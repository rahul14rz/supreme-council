import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/providers/rate-limiter.js';
import { config, fakeClock } from './helpers.js';

describe('RateLimiter', () => {
  it('queues calls over the per-minute limit instead of rejecting them', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ ...config.providers, groq: { rpm: 2 } }, clock);
    const grantedAt: number[] = [];
    await Promise.all(Array.from({ length: 5 }, () => limiter.acquire('groq').then(() => grantedAt.push(clock.now()))));
    expect(grantedAt).toEqual([0, 0, 60_000, 60_000, 120_000]);
  });

  it('limits each provider independently', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ ...config.providers, groq: { rpm: 1 }, mistral: { rpm: 1 } }, clock);
    await Promise.all([limiter.acquire('groq'), limiter.acquire('mistral')]);
    expect(clock.sleeps).toEqual([]);
  });
});
