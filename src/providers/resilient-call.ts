import type { Agent, Config, ModelRef, ProviderId } from '../config/schema.js';
import { parseModelRef } from '../config/schema.js';
import { turnCostUsd } from '../cost.js';
import { type ChatMessage, type LLMClient, LLMError, type LLMErrorKind, type Usage } from '../llm/types.js';
import type { RequestCounter } from './quota.js';
import type { RateLimiter } from './rate-limiter.js';

export type AttemptFailure = { model: ModelRef; kind: LLMErrorKind | 'quota_exhausted'; message: string };

export type RequestCounts = Partial<Record<ProviderId, number>>;

export type TurnResult =
  | { status: 'ok'; text: string; model: ModelRef; usage: Usage; costUsd: number; failures: AttemptFailure[]; requests: RequestCounts }
  | { status: 'failed'; error: string; failures: AttemptFailure[]; requests: RequestCounts };

export type CallDeps = {
  llm: LLMClient;
  limiter: RateLimiter;
  quota: RequestCounter;
  config: Pick<Config, 'retry' | 'providers' | 'prices'>;
  isAvailable(provider: ProviderId): boolean;
  sleep(ms: number): Promise<void>;
};

export type CallHooks = {
  onToken(text: string): void;
  /** willRetry means the same model is tried again, so any streamed text for this turn should be discarded. */
  onAttemptFailed(failure: AttemptFailure, willRetry: boolean): void;
};

/**
 * Run one agent turn: the primary model with bounded exponential backoff on
 * retryable errors, then each fallback in order. Never throws for provider
 * failures; returns a failed TurnResult when every option is exhausted.
 */
export async function callAgent(deps: CallDeps, agent: Agent, messages: ChatMessage[], hooks: CallHooks): Promise<TurnResult> {
  const failures: AttemptFailure[] = [];
  const requests: RequestCounts = {};
  const fail = (failure: AttemptFailure, willRetry: boolean) => {
    failures.push(failure);
    hooks.onAttemptFailed(failure, willRetry);
  };

  for (const model of [agent.model, ...agent.fallbackModels]) {
    const { provider } = parseModelRef(model);
    if (!deps.isAvailable(provider)) {
      fail({ model, kind: 'missing_key', message: `${provider} has no credentials configured` }, false);
      continue;
    }
    for (let attempt = 1; attempt <= deps.config.retry.maxAttempts; attempt++) {
      const rpd = deps.config.providers[provider].rpd;
      if (rpd !== null && deps.quota.countToday(provider) >= rpd) {
        fail({ model, kind: 'quota_exhausted', message: `${provider} daily quota of ${rpd} requests used up` }, false);
        break;
      }
      await deps.limiter.acquire(provider);
      deps.quota.record(provider);
      requests[provider] = (requests[provider] ?? 0) + 1;
      try {
        const { text, usage } = await streamTurn(deps.llm, agent, model, messages, hooks.onToken);
        const costUsd = turnCostUsd(deps.config.prices, model, usage);
        return { status: 'ok', text, model, usage, costUsd, failures, requests };
      } catch (err) {
        const error = err instanceof LLMError ? err : new LLMError('unavailable', String(err));
        const willRetry = error.retryable && attempt < deps.config.retry.maxAttempts;
        fail({ model, kind: error.kind, message: error.message }, willRetry);
        if (!willRetry) break;
        await deps.sleep(backoffMs(deps.config.retry, attempt, error.retryAfterMs));
      }
    }
  }
  return { status: 'failed', error: `all ${1 + agent.fallbackModels.length} model options failed`, failures, requests };
}

async function streamTurn(llm: LLMClient, agent: Agent, model: ModelRef, messages: ChatMessage[], onToken: (t: string) => void) {
  const stream = llm.stream(messages, { model, maxTokens: agent.maxTokens, system: agent.systemPrompt });
  let text = '';
  for (;;) {
    const next = await stream.next();
    if (next.done) return { text, usage: next.value };
    text += next.value;
    onToken(next.value);
  }
}

export function backoffMs(retry: Config['retry'], attempt: number, retryAfterMs?: number): number {
  return Math.min(retryAfterMs ?? retry.baseDelayMs * 2 ** (attempt - 1), retry.maxDelayMs);
}
