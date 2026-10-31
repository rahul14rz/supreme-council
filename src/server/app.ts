import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config/schema.js';
import type { Store } from '../db/store.js';
import type { DebateEvent } from '../orchestrator/events.js';
import { RoundsError, resolveRounds } from '../orchestrator/run.js';
import type { CallDeps } from '../providers/resilient-call.js';
import { councilStatus, providerStatuses } from '../providers/report.js';
import { startSession } from '../runtime.js';
import { LiveSessions } from './live.js';

type Env = Record<string, string | undefined>;

const CreateSessionBody = z.object({
  question: z.string().trim().min(1).max(4000),
  councilId: z.string().min(1),
  rounds: z.number().int().optional(),
});

const CORS = { 'access-control-allow-origin': '*' };

export function buildApp(opts: { config: Config; store: Store; deps: CallDeps; env: Env; logger?: boolean }): FastifyInstance {
  const { config, store, deps, env } = opts;
  const app = Fastify({ logger: opts.logger ?? false });
  const live = new LiveSessions();

  app.addHook('onSend', async (_req, reply) => { reply.headers(CORS); });
  app.options('/*', async (_req, reply) => reply
    .headers({ 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' })
    .code(204).send());

  app.post('/sessions', async (req, reply) => {
    const body = CreateSessionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: z.prettifyError(body.error) });
    const council = config.councils.get(body.data.councilId);
    if (!council) return reply.code(400).send({ error: `unknown council "${body.data.councilId}"` });
    let rounds: number;
    try {
      rounds = resolveRounds(council, body.data.rounds);
    } catch (err) {
      if (err instanceof RoundsError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    const { sessionId, events } = startSession(deps, store, council, body.data.question, rounds);
    live.run(sessionId, events, (err) => app.log.error({ err, sessionId }, 'debate stream failed'));
    return reply.code(201).send({ sessionId });
  });

  app.get('/sessions', async () => store.listSessions());

  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const detail = store.getSession(req.params.id);
    return detail ?? reply.code(404).send({ error: 'session not found' });
  });

  app.get<{ Params: { id: string } }>('/sessions/:id/stream', async (req, reply) => {
    if (!store.getSession(req.params.id)) return reply.code(404).send({ error: 'session not found' });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...CORS });
    const send = (e: DebateEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    const unsubscribe = live.subscribe(req.params.id, (e) => (e ? send(e) : res.end()));
    if (unsubscribe) {
      req.raw.on('close', unsubscribe);
      return;
    }
    for (const e of store.events(req.params.id)) send(e);
    res.end();
  });

  app.get('/providers', async () => ({
    day: new Date().toISOString().slice(0, 10),
    providers: providerStatuses(config, env, store.requestsToday()),
  }));

  app.get('/councils', async () => [...config.councils.values()].map((c) => ({
    id: c.id,
    name: c.name,
    protocol: c.protocol,
    maxRounds: c.protocol === 'parallel-rounds' ? c.maxRounds : c.maxCycles,
    minRounds: c.protocol === 'parallel-rounds' ? 2 : 1,
    members: (c.protocol === 'parallel-rounds' ? [c.chair, ...c.agents] : [c.creator, c.critic, c.keeper])
      .map((a) => ({ id: a.id, role: a.role, model: a.model })),
    status: councilStatus(c, (p) => deps.isAvailable(p)),
  })));

  return app;
}
