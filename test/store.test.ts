import { describe, expect, it } from 'vitest';
import { Store } from '../src/db/store.js';
import type { DebateEvent } from '../src/orchestrator/events.js';
import { startSession } from '../src/runtime.js';
import { testDeps } from './helpers.js';
import { agentOf, collect, council, defaultReply, phaseOf, unavailable } from './orchestrator-helpers.js';

function persistedDebate(store: Store, reply = defaultReply) {
  const { deps } = testDeps((m, o) => reply(phaseOf(m), agentOf(o)), { quota: store });
  return startSession(deps, store, council, 'Should we rewrite billing?', 3);
}

describe('Store', () => {
  it('replays a finished session event-for-event', async () => {
    const store = new Store(':memory:');
    const { sessionId, events } = persistedDebate(store);
    const live = await collect(events);
    expect(store.events(sessionId)).toEqual(live);
  });

  it('projects sessions, turns, verdict and usage', async () => {
    const store = new Store(':memory:');
    const { sessionId, events } = persistedDebate(store, (p, id) => (id === 'risk' ? unavailable() : defaultReply(p, id)));
    const live = await collect(events);
    const verdictEvent = live.at(-1) as Extract<DebateEvent, { type: 'verdict' }>;

    const detail = store.getSession(sessionId)!;
    expect(detail.session).toMatchObject({ status: 'complete', councilId: 'test', rounds: 3, outputTokens: verdictEvent.usage.outputTokens });
    expect(detail.turns).toHaveLength(14);
    expect(detail.turns.filter((t) => t.status === 'failed').map((t) => t.agentId)).toEqual(['risk', 'risk', 'risk']);
    expect(detail.turns[0]).toMatchObject({ turnId: 't1', phase: 'framing', status: 'ok', text: 'FRAMING-FROM-chair' });
    expect(detail.verdict).toEqual(verdictEvent.verdict);
    expect(store.listSessions().map((s) => s.id)).toEqual([sessionId]);
  });

  it('marks a session failed when it ends without a verdict', async () => {
    const store = new Store(':memory:');
    const { sessionId, events } = persistedDebate(store, (p, id) => (p === 'verdict' || p === 'retry' ? 'nope' : defaultReply(p, id)));
    await collect(events);
    expect(store.getSession(sessionId)!.session.status).toBe('failed');
  });

  it('counts requests per provider per day, persisted across restarts', () => {
    let day = '2026-10-31';
    const path = `${process.env.TMPDIR ?? '/tmp'}/council-${Date.now()}.db`;
    const store = new Store(path, () => day);
    store.record('groq');
    store.record('groq');
    store.record('google');
    store.close();

    const reopened = new Store(path, () => day);
    expect(reopened.requestsToday()).toEqual({ groq: 2, google: 1 });
    day = '2026-11-01';
    expect(reopened.countToday('groq')).toBe(0);
  });

  it('records request counts made during a debate', async () => {
    const store = new Store(':memory:');
    await collect(persistedDebate(store).events);
    expect(store.requestsToday()).toEqual({ groq: 14 });
  });

  it('fails sessions interrupted by a restart', () => {
    const store = new Store(':memory:');
    store.createSession({ id: 's1', question: 'q', councilId: 'test', rounds: 2 });
    expect(store.failInterrupted()).toBe(1);
    expect(store.getSession('s1')!.session.status).toBe('failed');
  });
});
