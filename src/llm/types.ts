import type { ModelRef } from '../config/schema.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type Usage = { inputTokens: number; outputTokens: number };

export type StreamOptions = { model: ModelRef; maxTokens: number; system: string };

/**
 * Yields text tokens as they arrive and returns normalized usage when done.
 * Failures are thrown as LLMError while iterating.
 */
export interface LLMClient {
  stream(messages: ChatMessage[], opts: StreamOptions): AsyncGenerator<string, Usage>;
}

/**
 * rate_limit and unavailable are worth retrying on the same model.
 * missing_key and rejected are not: go straight to the next fallback.
 */
export type LLMErrorKind = 'rate_limit' | 'unavailable' | 'missing_key' | 'rejected';

export class LLMError extends Error {
  constructor(
    readonly kind: LLMErrorKind,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }

  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'unavailable';
  }
}
