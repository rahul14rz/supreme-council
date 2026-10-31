import { loadConfig } from '../src/config/load.js';
import type { Agent, ModelRef, ProviderId } from '../src/config/schema.js';
import { MockLLMClient, type MockResponder } from '../src/llm/mock-client.js';
import type { RequestCounter } from '../src/providers/quota.js';
import { type Clock, RateLimiter } from '../src/providers/rate-limiter.js';
import type { CallDeps } from '../src/providers/resilient-call.js';

export const config = loadConfig();

export class MemoryCounter implements RequestCounter {
  readonly counts = new Map<ProviderId, number>();
  countToday(p: ProviderId) { return this.counts.get(p) ?? 0; }
  record(p: ProviderId) { this.counts.set(p, this.countToday(p) + 1); }
}

/** A clock whose sleep advances time instantly, recording each sleep. */
export function fakeClock(): Clock & { sleeps: number[] } {
  let t = 0;
  const sleeps: number[] = [];
  return { sleeps, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } };
}

export function testDeps(respond: MockResponder, overrides: Partial<CallDeps> = {}) {
  const llm = new MockLLMClient(respond);
  const clock = fakeClock();
  const deps: CallDeps = {
    llm,
    limiter: new RateLimiter(config.providers, clock),
    quota: new MemoryCounter(),
    config,
    isAvailable: () => true,
    sleep: clock.sleep,
    ...overrides,
  };
  return { deps, llm, clock };
}

export function agent(model: ModelRef, fallbackModels: ModelRef[] = [], id = 'tester'): Agent {
  return { id, role: id, systemPrompt: `You are ${id}.`, model, fallbackModels, maxTokens: 100 };
}
