import type { ProviderConfig, ProviderId } from '../config/schema.js';

export type Clock = { now(): number; sleep(ms: number): Promise<void> };

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const WINDOW_MS = 60_000;

/**
 * Per-provider sliding-window limiter. Callers over the requests-per-minute
 * limit wait in a FIFO queue instead of failing.
 */
export class RateLimiter {
  private readonly sent = new Map<ProviderId, number[]>();
  private readonly queues = new Map<ProviderId, Promise<void>>();

  constructor(
    private readonly providers: Record<ProviderId, Pick<ProviderConfig, 'rpm'>>,
    private readonly clock: Clock = realClock,
  ) {}

  acquire(provider: ProviderId): Promise<void> {
    const next = (this.queues.get(provider) ?? Promise.resolve()).then(() => this.take(provider));
    this.queues.set(provider, next);
    return next;
  }

  private async take(provider: ProviderId): Promise<void> {
    const stamps = this.sent.get(provider) ?? [];
    this.sent.set(provider, stamps);
    for (;;) {
      const now = this.clock.now();
      while (stamps.length > 0 && stamps[0]! <= now - WINDOW_MS) stamps.shift();
      if (stamps.length < this.providers[provider].rpm) {
        stamps.push(now);
        return;
      }
      await this.clock.sleep(stamps[0]! + WINDOW_MS - now);
    }
  }
}
