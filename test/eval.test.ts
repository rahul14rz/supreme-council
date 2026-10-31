import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { comparisonTable, gradeAnswer, loadEval, runCondition } from '../eval/harness.js';
import { Store } from '../src/db/store.js';
import { LLMError } from '../src/llm/types.js';
import { config, testDeps } from './helpers.js';
import { agentOf, defaultReply, phaseOf, verdict } from './orchestrator-helpers.js';

const EVAL_DIR = fileURLToPath(new URL('../eval', import.meta.url));

describe('eval harness', () => {
  const { questions, config: evalConfig } = loadEval(EVAL_DIR);

  it('ships 20 questions, balanced between yes and no', () => {
    expect(questions).toHaveLength(20);
    expect(questions.filter((q) => q.answer === 'yes')).toHaveLength(10);
    expect(new Set(questions.map((q) => q.id)).size).toBe(20);
    for (const c of evalConfig.conditions) if (c.council) expect(config.councils.has(c.council), c.council).toBe(true);
  });

  it.each([
    ['Yes, pay it off first.', 'yes'],
    ['**No** — the ball costs 5 cents.', 'no'],
    ['Some preamble\nRecommendation: No. Sunk costs are sunk.', 'no'],
    ['Nobody should do that.', null],
    ['It depends.', null],
    [null, null],
  ])('grades %j as %s', (text, expected) => {
    expect(gradeAnswer(text)).toBe(expected);
  });

  it('runs a council condition end to end and scores it', async () => {
    const reply = (m: Parameters<typeof phaseOf>[0], o: Parameters<typeof agentOf>[0]) => {
      const p = phaseOf(m);
      if (p !== 'verdict') return defaultReply(p, agentOf(o));
      const answer = m[0]!.content.includes('three doors') || m[0]!.content.includes('credit card') ? 'Yes' : 'No';
      return JSON.stringify(verdict({ recommendation: `${answer}, because.`, dissent: { agent: 'optimist', reason: 'r' } }));
    };
    const { deps } = testDeps((m, o) => reply(m, o));
    const row = await runCondition({ id: 'free', label: 'free', council: 'supreme-free' }, questions.slice(0, 3), evalConfig, config, deps, new Store(':memory:'));
    if (!('results' in row)) throw new Error('skipped');
    expect(row.results.map((r) => `${r.id}:${r.got}`)).toEqual(['card-vs-invest:yes', 'monty-hall:yes', 'password-hashing:no']);
    expect(comparisonTable([row], 3)).toContain('| free | 2/3 (67%) | 0 |');
  });

  it('skips a condition whose providers are unavailable instead of failing every question', async () => {
    const { deps } = testDeps(() => new LLMError('missing_key', 'x'), { isAvailable: () => false });
    const row = await runCondition({ id: 'baseline', label: 'base' }, questions, evalConfig, config, deps, new Store(':memory:'));
    expect(row).toMatchObject({ skipped: expect.stringContaining('anthropic') });
    expect(comparisonTable([row], 20)).toContain('skipped');
  });
});
