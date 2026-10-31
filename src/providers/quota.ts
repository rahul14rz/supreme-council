import type { ProviderId } from '../config/schema.js';

/** Requests sent per provider today, so free-tier daily quotas are respected and visible. */
export interface RequestCounter {
  countToday(provider: ProviderId): number;
  record(provider: ProviderId): void;
}
