import { describe, expect, it } from 'vitest';
import type { Council } from '../src/config/schema.js';
import { RoundsError, resolveRounds, runDebate } from '../src/orchestrator/run.js';
import type { DebateEvent } from '../src/orchestrator/events.js';
import { testDeps } from './helpers.js';
import { type Phase, type Reply, agentOf, ccpCouncil, collect, council, defaultReply, phaseOf, unavailable, verdict } from './orchestrator-helpers.js';

function debate(reply: (phase: Phase, agentId: string, callIndex: number) => Reply = defaultReply, rounds = 3, c: Council = council) {
  let calls = 0;
  const { deps, llm } = testDeps(async (messages, opts) => {
    await new Promise((r) => setTimeout(r, 2)); // let parallel turns overlap for real
    return reply(phaseOf(messages), agentOf(opts), calls++);
  });
  return { events: collect(runDebate(deps, c, 'Should we rewrite the billing system?', rounds)), llm };
}

const starts = (events: DebateEvent[]) => events.filter((e) => e.type === 'turn_start');
const indexOf = (events: DebateEvent[], pred: (e: DebateEvent) => boolean) => events.findIndex(pred);
const lastIndexOf = (events: DebateEvent[], pred: (e: DebateEvent) => boolean) => events.findLastIndex(pred);

describe('parallel-rounds protocol', () => {
  it('runs framing, three rounds, then the verdict, in order', async () => {
    const events = await debate().events;
    expect(starts(events).map((e) => `${e.phase}:${e.agentId}`)).toEqual([
      'framing:chair',
      ...['opening', 'rebuttal', 'final'].flatMap((p) => ['optimist', 'skeptic', 'cost', 'risk'].map((a) => `${p}:${a}`)),
      'verdict:chair',
    ]);
    expect(events.filter((e) => e.type === 'round_complete').map((e) => e.round)).toEqual([1, 2, 3]);
    expect(events.at(-1)).toMatchObject({ type: 'verdict', verdict: verdict() });
  });

  it('runs members in parallel within a round and rounds strictly one after another', async () => {
    const events = await debate().events;
    for (const phase of ['opening', 'rebuttal', 'final']) {
      const inPhase = new Set(starts(events).filter((e) => e.phase === phase).map((e) => e.turnId));
      const firstEnd = indexOf(events, (e) => e.type === 'turn_end' && inPhase.has(e.turnId));
      const lastStart = lastIndexOf(events, (e) => e.type === 'turn_start' && inPhase.has(e.turnId));
      expect(lastStart, `${phase}: all members start before any finishes`).toBeLessThan(firstEnd);
    }
    const lastOpeningEnd = lastIndexOf(events, (e) => e.type === 'round_complete' && e.round === 1);
    const firstRebuttal = indexOf(events, (e) => e.type === 'turn_start' && e.phase === 'rebuttal');
    expect(lastOpeningEnd).toBeLessThan(firstRebuttal);
  });

  it('keeps every other member out of Round 1 prompts, and shows all of Round 1 in Round 2', async () => {
    const { events, llm } = debate();
    await events;
    const prompts = (phase: Phase) => llm.calls.filter((c) => phaseOf(c.messages) === phase).map((c) => JSON.stringify(c.messages));
    expect(prompts('opening')).toHaveLength(4);
    for (const p of prompts('opening')) expect(p).not.toMatch(/OPENING-FROM-|REBUTTAL-FROM-/);
    for (const p of prompts('opening')) expect(p).toContain('FRAMING-FROM-chair');
    for (const p of prompts('rebuttal')) {
      for (const id of ['optimist', 'skeptic', 'cost', 'risk']) expect(p).toContain(`OPENING-FROM-${id}`);
    }
  });

  it('skips the final round when asked for two rounds', async () => {
    const events = await debate(defaultReply, 2).events;
    expect(starts(events).some((e) => e.phase === 'final')).toBe(false);
    expect(events.at(-1)?.type).toBe('verdict');
  });

  it('marks a failed member turn and carries on to a verdict', async () => {
    const { events, llm } = debate((phase, id) => (id === 'skeptic' ? unavailable() : defaultReply(phase, id)));
    const all = await events;
    const skepticEnds = all.filter((e) => e.type === 'turn_end' && e.result.status === 'failed');
    expect(skepticEnds).toHaveLength(3);
    expect(all.at(-1)).toMatchObject({ type: 'verdict', verdict: verdict() });
    const rebuttalPrompt = llm.calls.find((c) => phaseOf(c.messages) === 'rebuttal')!.messages[0]!.content;
    expect(rebuttalPrompt).toContain('no response: this member was unavailable');
  });

  it('reports token, cost and request totals on the verdict', async () => {
    const all = await debate().events;
    const v = all.at(-1);
    if (v?.type !== 'verdict') throw new Error('no verdict');
    expect(v.usage.turns).toHaveLength(14);
    expect(v.usage.outputTokens).toBe(v.usage.turns.reduce((s, t) => s + t.outputTokens, 0));
    expect(v.usage.requests).toEqual({ groq: 14 });
  });
});

describe('chair verdict', () => {
  const verdictTurns = (events: DebateEvent[]) => starts(events).filter((e) => e.phase === 'verdict');

  it('accepts JSON wrapped in prose and code fences', async () => {
    const all = await debate((p, id) => (p === 'verdict' ? `Here you go:\n\`\`\`json\n${JSON.stringify(verdict())}\n\`\`\`` : defaultReply(p, id))).events;
    expect(all.at(-1)).toMatchObject({ verdict: verdict() });
    expect(verdictTurns(all)).toHaveLength(1);
  });

  it('retries once on invalid output and uses the corrected verdict', async () => {
    const all = await debate((p, id) => (p === 'verdict' ? '{"recommendation": "yes"}' : defaultReply(p, id))).events;
    expect(verdictTurns(all)).toHaveLength(2);
    expect(all.some((e) => e.type === 'error' && e.message.includes('retrying once'))).toBe(true);
    expect(all.at(-1)).toMatchObject({ type: 'verdict', verdict: verdict() });
  });

  it('rejects a dissent that names no real member', async () => {
    const bad = JSON.stringify(verdict({ dissent: { agent: 'Ghost', reason: 'r' } }));
    const all = await debate((p, id) => (p === 'verdict' ? bad : defaultReply(p, id))).events;
    expect(verdictTurns(all)).toHaveLength(2);
  });

  it('gives up after one retry with a null verdict and an error, without crashing', async () => {
    const all = await debate((p, id) => (p === 'verdict' || p === 'retry' ? 'not json' : defaultReply(p, id))).events;
    expect(verdictTurns(all)).toHaveLength(2);
    expect(all.some((e) => e.type === 'error' && e.message.includes('giving up'))).toBe(true);
    expect(all.at(-1)).toMatchObject({ type: 'verdict', verdict: null });
  });
});

describe('create-critique-preserve protocol', () => {
  const keeperSays = (changed: boolean, n: number) => JSON.stringify({
    changed, proposal: `proposal v${n}`, verdict: verdict({ dissent: { agent: 'critic', reason: 'r' } }),
  });

  it('stops as soon as the Keeper reports no material change', async () => {
    let keeperCalls = 0;
    const all = await debate((p, id) => (p === 'preserve' ? keeperSays(++keeperCalls < 2, keeperCalls) : defaultReply(p, id)), 4, ccpCouncil).events;
    expect(starts(all).map((e) => `${e.round}:${e.agentId}`)).toEqual(['1:creator', '1:critic', '1:keeper', '2:creator', '2:critic', '2:keeper']);
    expect(all.at(-1)).toMatchObject({ type: 'verdict', proposal: 'proposal v2' });
  });

  it('stops at the cycle cap when the proposal keeps changing', async () => {
    let keeperCalls = 0;
    const all = await debate((p, id) => (p === 'preserve' ? keeperSays(true, ++keeperCalls) : defaultReply(p, id)), 3, ccpCouncil).events;
    expect(starts(all).filter((e) => e.agentId === 'keeper')).toHaveLength(3);
    expect(all.at(-1)).toMatchObject({ type: 'verdict', proposal: 'proposal v3' });
  });

  it('runs members one at a time and feeds the kept proposal into the next cycle', async () => {
    let keeperCalls = 0;
    const { events, llm } = debate((p, id) => (p === 'preserve' ? keeperSays(++keeperCalls < 2, keeperCalls) : defaultReply(p, id)), 4, ccpCouncil);
    const all = await events;
    for (let i = 0; i < all.length; i++) {
      const e = all[i]!;
      if (e.type === 'turn_start') expect(all[i + 1]?.type === 'turn_start').toBe(false);
    }
    const secondCreate = llm.calls.filter((c) => phaseOf(c.messages) === 'create')[1]!;
    expect(secondCreate.messages[0]!.content).toContain('proposal v1');
  });

  it('keeps the last good proposal when the Keeper later fails', async () => {
    let keeperCalls = 0;
    const all = await debate((p, id) => (p === 'preserve' ? (++keeperCalls === 1 ? keeperSays(true, 1) : unavailable()) : defaultReply(p, id)), 4, ccpCouncil).events;
    expect(all.at(-1)).toMatchObject({ type: 'verdict', proposal: 'proposal v1' });
  });
});

describe('resolveRounds', () => {
  it('defaults to the council cap and rejects values outside it', () => {
    expect(resolveRounds(council)).toBe(3);
    expect(resolveRounds(council, 2)).toBe(2);
    expect(() => resolveRounds(council, 4)).toThrow(RoundsError);
    expect(() => resolveRounds(council, 1)).toThrow(RoundsError);
    expect(resolveRounds(ccpCouncil, 1)).toBe(1);
    expect(() => resolveRounds(ccpCouncil, 5)).toThrow(RoundsError);
  });
});
