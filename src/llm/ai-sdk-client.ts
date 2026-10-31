// The only module that imports provider SDKs. Everything else talks to LLMClient.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { APICallError, LoadAPIKeyError, RetryError, streamText, type LanguageModel } from 'ai';
import { type ModelRef, type ProviderConfig, type ProviderId, parseModelRef } from '../config/schema.js';
import { providerCredential } from '../providers/availability.js';
import { type ChatMessage, type LLMClient, LLMError, type StreamOptions, type Usage } from './types.js';

type Env = Record<string, string | undefined>;

export function createAiSdkClient(providers: Record<ProviderId, ProviderConfig>, env: Env = process.env): LLMClient {
  return {
    async *stream(messages: ChatMessage[], opts: StreamOptions): AsyncGenerator<string, Usage> {
      const model = languageModel(opts.model, providers, env);
      try {
        const result = streamText({
          model,
          instructions: opts.system,
          messages,
          maxOutputTokens: opts.maxTokens,
          maxRetries: 0, // retries and fallbacks are ours, so they respect the rate limiter
        });
        for await (const part of result.stream) {
          if (part.type === 'text-delta') yield part.text;
          else if (part.type === 'error') throw part.error;
        }
        const usage = await result.usage;
        return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
      } catch (err) {
        throw classifyError(err);
      }
    },
  };
}

function languageModel(ref: ModelRef, providers: Record<ProviderId, ProviderConfig>, env: Env): LanguageModel {
  const { provider, model } = parseModelRef(ref);
  const cfg = providers[provider];
  const credential = providerCredential(cfg, env);
  if (!credential) {
    throw new LLMError('missing_key', `${provider} is unavailable: ${cfg.apiKeyEnv ?? cfg.baseUrlEnv} is not set`);
  }
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey: credential })(model);
    case 'openai': return createOpenAI({ apiKey: credential })(model);
    case 'google': return createGoogleGenerativeAI({ apiKey: credential })(model);
    case 'groq': return createGroq({ apiKey: credential })(model);
    case 'mistral': return createMistral({ apiKey: credential })(model);
    case 'openrouter':
      return createOpenAICompatible({ name: 'openrouter', baseURL: cfg.baseUrl ?? '', apiKey: credential, includeUsage: true })(model);
    case 'ollama':
      return createOpenAICompatible({ name: 'ollama', baseURL: `${credential.replace(/\/$/, '')}/v1`, includeUsage: true })(model);
  }
}

/** Map SDK and network errors onto the four kinds the fallback logic understands. */
export function classifyError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;
  if (RetryError.isInstance(err)) return classifyError(err.lastError);
  if (LoadAPIKeyError.isInstance(err)) return new LLMError('missing_key', err.message);
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 429) return new LLMError('rate_limit', err.message, retryAfterMs(err.responseHeaders));
    if (status === 401 || status === 403) return new LLMError('missing_key', `auth failed (${status}): ${err.message}`);
    if (status === undefined || status === 408 || status >= 500) return new LLMError('unavailable', err.message);
    return new LLMError('rejected', `${status}: ${err.message}`);
  }
  return new LLMError('unavailable', err instanceof Error ? err.message : String(err));
}

function retryAfterMs(headers: Record<string, string> | undefined): number | undefined {
  const seconds = Number(headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
