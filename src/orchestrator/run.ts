import type { Council } from '../config/schema.js';
import type { CallDeps } from '../providers/resilient-call.js';
import { Channel } from './channel.js';
import { runCreateCritiquePreserve } from './create-critique-preserve.js';
import type { DebateEvent } from './events.js';
import { runParallelRounds } from './parallel-rounds.js';
import { DebateSession } from './session.js';

export class RoundsError extends Error {}

/** Rounds (parallel-rounds) or cycles (create-critique-preserve), defaulting to and capped by the council config. */
export function resolveRounds(council: Council, requested?: number): number {
  const [min, max] = council.protocol === 'parallel-rounds' ? [2, council.maxRounds] : [1, council.maxCycles];
  const rounds = requested ?? max;
  if (!Number.isInteger(rounds) || rounds < min || rounds > max) {
    throw new RoundsError(`rounds for ${council.id} must be an integer from ${min} to ${max}`);
  }
  return rounds;
}

/** Run a debate and stream its events. Provider failures become events; the stream always ends. */
export function runDebate(deps: CallDeps, council: Council, question: string, rounds: number): AsyncIterable<DebateEvent> {
  const channel = new Channel<DebateEvent>();
  const session = new DebateSession(deps, (e) => channel.push(e));
  const run = council.protocol === 'parallel-rounds'
    ? runParallelRounds(session, council, question, rounds)
    : runCreateCritiquePreserve(session, council, question, rounds);
  run
    .catch((err: unknown) => channel.push({ type: 'error', message: `debate aborted: ${String(err)}` }))
    .finally(() => channel.close());
  return channel;
}
