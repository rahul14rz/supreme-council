import type { ModelRef } from '../config/schema.js';
import type { RequestCounts, TurnResult } from '../providers/resilient-call.js';
import type { Verdict } from '../verdict.js';

export type Phase = 'framing' | 'opening' | 'rebuttal' | 'final' | 'verdict' | 'create' | 'critique' | 'preserve';

export type TurnUsage = { turnId: string; agentId: string; model: ModelRef; inputTokens: number; outputTokens: number; costUsd: number };

export type SessionUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  turns: TurnUsage[];
  requests: RequestCounts;
};

/**
 * Everything a debate produces, in order. The CLI prints these, the server
 * streams them as SSE, and the store persists them so a session replays
 * exactly. An `error` with a turnId and `retrying: true` means the client
 * should discard that turn's streamed text; the turn is being retried.
 */
export type DebateEvent =
  | { type: 'turn_start'; turnId: string; agentId: string; role: string; phase: Phase; round: number }
  | { type: 'token'; turnId: string; text: string }
  | { type: 'turn_end'; turnId: string; result: TurnResult }
  | { type: 'round_complete'; round: number; phase: Phase }
  | { type: 'verdict'; verdict: Verdict | null; proposal?: string; usage: SessionUsage }
  | { type: 'error'; message: string; turnId?: string; retrying?: boolean };
