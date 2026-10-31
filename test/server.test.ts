import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../src/db/store.js';
import { demoResponder } from '../src/llm/demo-responder.js';
import { MockLLMClient } from '../src/llm/mock-client.js';
import type { DebateEvent } from '../src/orchestrator/events.js';
import { createCallDeps } from '../src/runtime.js';
import { buildApp } from '../src/server/app.js';
import { config } from './helpers.js';

const env = { GROQ_API_KEY: 'sk-test-secret-value' };
const store = new Store(':memory:');
const app = buildApp({ config, store, env, deps: createCallDeps(config, store, env, new MockLLMClient(demoResponder)) });
let base: string;

beforeAll(async () => {
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(() => app.close());

async function readSse(url: string): Promise<{ event: string; data: DebateEvent }[]> {
  const res = await fetch(url);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const text = await res.text(); // the server ends the stream after the last event
  return text.trim().split('\n\n').map((block) => {
    const [eventLine, dataLine] = block.split('\n');
    return { event: eventLine!.slice('event: '.length), data: JSON.parse(dataLine!.slice('data: '.length)) as DebateEvent };
  });
}

const post = (body: unknown) => app.inject({ method: 'POST', url: '/sessions', payload: body as object });

describe('HTTP API', () => {
  it.each([
    [{ councilId: 'supreme-free' }, /question/],
    [{ question: 'q', councilId: 'nope' }, /unknown council/],
    [{ question: 'q', councilId: 'supreme-free', rounds: 9 }, /rounds .* from 2 to 3/],
  ])('rejects a bad request %#', async (body, error) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(error);
  });

  it('streams a session live over SSE, then replays it identically from the database', async () => {
    const res = await post({ question: 'Should we adopt a 4-day week?', councilId: 'supreme-free', rounds: 2 });
    expect(res.statusCode).toBe(201);
    const { sessionId } = res.json();

    const live = await readSse(`${base}/sessions/${sessionId}/stream`);
    expect(live[0]?.event).toBe('turn_start');
    expect(live.at(-1)?.event).toBe('verdict');
    expect(live.every((e) => e.event === e.data.type)).toBe(true);
    expect(new Set(live.map((e) => e.event))).toEqual(new Set(['turn_start', 'token', 'turn_end', 'round_complete', 'verdict']));

    const replay = await readSse(`${base}/sessions/${sessionId}/stream`);
    expect(replay).toEqual(live);

    const detail = (await app.inject(`/sessions/${sessionId}`)).json();
    expect(detail.session).toMatchObject({ id: sessionId, status: 'complete', councilId: 'supreme-free' });
    expect(detail.turns).toHaveLength(10);
    expect(detail.verdict.recommendation).toContain('pilot');
    expect((await app.inject('/sessions')).json().map((s: { id: string }) => s.id)).toContain(sessionId);
  });

  it('returns 404 for an unknown session', async () => {
    expect((await app.inject('/sessions/nope')).statusCode).toBe(404);
    expect((await app.inject('/sessions/nope/stream')).statusCode).toBe(404);
  });

  it('reports provider availability and usage without exposing key values', async () => {
    const res = await app.inject('/providers');
    expect(res.body).not.toContain(env.GROQ_API_KEY);
    const groq = res.json().providers.find((p: { id: string }) => p.id === 'groq');
    expect(groq).toMatchObject({ available: true, freeTier: true, credentialEnv: 'GROQ_API_KEY' });
    expect(res.json().providers.find((p: { id: string }) => p.id === 'openai').available).toBe(false);
  });

  it('lists councils with members, round limits and readiness', async () => {
    const councils = (await app.inject('/councils')).json();
    expect(councils.map((c: { id: string }) => c.id).sort()).toEqual(['creator-critic-keeper', 'supreme-free', 'supreme-mixed', 'supreme-single']);
    expect(councils.find((c: { id: string }) => c.id === 'creator-critic-keeper')).toMatchObject({ minRounds: 1, maxRounds: 4 });
  });

  it('sends CORS headers for browser clients', async () => {
    expect((await app.inject('/providers')).headers['access-control-allow-origin']).toBe('*');
    expect((await app.inject({ method: 'OPTIONS', url: '/sessions' })).statusCode).toBe(204);
  });
});
