import { describe, expect, it } from 'vitest';
import { LLMError } from '../src/llm/types.js';
import { callAgent } from '../src/providers/resilient-call.js';
import { MemoryCounter, agent, config, testDeps } from './helpers.js';

const noHooks = { onToken: () => {}, onAttemptFailed: () => {} };
const PRIMARY = 'groq:llama-3.3-70b-versatile';
const FALLBACK = 'mistral:mistral-small-latest';
const LAST = 'ollama:llama3.1:8b';

describe('callAgent', () => {
  it('streams tokens and returns text, usage and cost', async () => {
    const { deps } = testDeps(() => 'hello there world');
    const tokens: string[] = [];
    const result = await callAgent(deps, agent(PRIMARY), [{ role: 'user', content: 'hi' }], { ...noHooks, onToken: (t) => tokens.push(t) });
    expect(tokens.join('')).toBe('hello there world');
    expect(result).toMatchObject({ status: 'ok', text: 'hello there world', model: PRIMARY, costUsd: 0, requests: { groq: 1 } });
  });

  it('retries a 429 with bounded backoff, then falls back to the next model', async () => {
    const { deps, llm, clock } = testDeps((_m, opts) =>
      opts.model === PRIMARY ? new LLMError('rate_limit', 'slow down') : 'from fallback');
    const result = await callAgent(deps, agent(PRIMARY, [FALLBACK]), [], noHooks);
    expect(result).toMatchObject({ status: 'ok', model: FALLBACK, text: 'from fallback', requests: { groq: 3, mistral: 1 } });
    expect(llm.calls.map((c) => c.opts.model)).toEqual([PRIMARY, PRIMARY, PRIMARY, FALLBACK]);
    expect(clock.sleeps).toEqual([1000, 2000]);
  });

  it('caps a long retry-after at maxDelayMs', async () => {
    let calls = 0;
    const { deps, clock } = testDeps(() => (++calls === 1 ? new LLMError('rate_limit', '429', 60_000) : 'ok'));
    await callAgent(deps, agent(PRIMARY), [], noHooks);
    expect(clock.sleeps).toEqual([config.retry.maxDelayMs]);
  });

  it('falls back on a missing key without calling the provider', async () => {
    const { deps, llm } = testDeps(() => 'from fallback', { isAvailable: (p) => p !== 'groq' });
    const failures: string[] = [];
    const result = await callAgent(deps, agent(PRIMARY, [FALLBACK]), [], { ...noHooks, onAttemptFailed: (f) => failures.push(f.kind) });
    expect(result).toMatchObject({ status: 'ok', model: FALLBACK });
    expect(llm.calls.map((c) => c.opts.model)).toEqual([FALLBACK]);
    expect(failures).toEqual(['missing_key']);
  });

  it('does not retry a rejected request on the same model', async () => {
    const { deps, llm } = testDeps((_m, opts) => (opts.model === PRIMARY ? new LLMError('rejected', '404 model') : 'ok'));
    await callAgent(deps, agent(PRIMARY, [FALLBACK]), [], noHooks);
    expect(llm.calls.map((c) => c.opts.model)).toEqual([PRIMARY, FALLBACK]);
  });

  it('skips a provider whose daily quota is used up', async () => {
    const quota = new MemoryCounter();
    quota.counts.set('groq', config.providers.groq.rpd!);
    const { deps, llm } = testDeps(() => 'ok', { quota });
    const result = await callAgent(deps, agent(PRIMARY, [FALLBACK]), [], noHooks);
    expect(result).toMatchObject({ status: 'ok', model: FALLBACK, failures: [{ model: PRIMARY, kind: 'quota_exhausted' }] });
    expect(llm.calls).toHaveLength(1);
  });

  it('marks the turn failed when every option is exhausted, without throwing', async () => {
    const { deps } = testDeps(() => new LLMError('unavailable', 'down'), { isAvailable: (p) => p !== 'ollama' });
    const result = await callAgent(deps, agent(PRIMARY, [FALLBACK, LAST]), [], noHooks);
    expect(result.status).toBe('failed');
    expect(result.failures.map((f) => `${f.model} ${f.kind}`)).toEqual([
      ...Array(3).fill(`${PRIMARY} unavailable`),
      ...Array(3).fill(`${FALLBACK} unavailable`),
      `${LAST} missing_key`,
    ]);
  });

  it('tells the caller to discard streamed text when it retries', async () => {
    let calls = 0;
    const { deps } = testDeps(() => (++calls === 1 ? new LLMError('unavailable', 'blip') : 'ok'));
    const retries: boolean[] = [];
    await callAgent(deps, agent(PRIMARY), [], { ...noHooks, onAttemptFailed: (_f, willRetry) => retries.push(willRetry) });
    expect(retries).toEqual([true]);
  });
});
