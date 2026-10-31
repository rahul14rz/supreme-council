import { randomUUID } from 'node:crypto';
import type { Config, Council } from './config/schema.js';
import type { Store } from './db/store.js';
import { createAiSdkClient } from './llm/ai-sdk-client.js';
import type { LLMClient } from './llm/types.js';
import type { DebateEvent } from './orchestrator/events.js';
import { runDebate } from './orchestrator/run.js';
import { isProviderAvailable } from './providers/availability.js';
import { RateLimiter, realClock } from './providers/rate-limiter.js';
import type { CallDeps } from './providers/resilient-call.js';

type Env = Record<string, string | undefined>;

/** Wiring for real runs. `mock` swaps in a scripted client and treats every provider as available. */
export function createCallDeps(config: Config, store: Store, env: Env, mock?: LLMClient): CallDeps {
  return {
    llm: mock ?? createAiSdkClient(config.providers, env),
    limiter: new RateLimiter(config.providers),
    quota: store,
    config,
    isAvailable: (p) => mock !== undefined || isProviderAvailable(config.providers[p], env),
    sleep: realClock.sleep,
  };
}

/** Start a persisted debate. Every event is written to the store before it is yielded. */
export function startSession(deps: CallDeps, store: Store, council: Council, question: string, rounds: number) {
  const sessionId = randomUUID();
  store.createSession({ id: sessionId, question, councilId: council.id, rounds });
  return { sessionId, events: recorded(store, sessionId, runDebate(deps, council, question, rounds)) };
}

async function* recorded(store: Store, sessionId: string, events: AsyncIterable<DebateEvent>): AsyncGenerator<DebateEvent> {
  try {
    for await (const event of events) {
      store.append(sessionId, event);
      yield event;
    }
  } finally {
    store.finish(sessionId);
  }
}
