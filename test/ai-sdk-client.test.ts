import { APICallError, LoadAPIKeyError } from 'ai';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/load.js';
import { classifyError, createAiSdkClient } from '../src/llm/ai-sdk-client.js';
import { LLMError } from '../src/llm/types.js';

const apiError = (statusCode: number | undefined, headers?: Record<string, string>) =>
  new APICallError({ message: 'boom', url: 'https://x', requestBodyValues: {}, statusCode, responseHeaders: headers });

describe('AI SDK adapter', () => {
  it('fails with missing_key, without a network call, when the key is unset', async () => {
    const client = createAiSdkClient(loadConfig().providers, {});
    const stream = client.stream([{ role: 'user', content: 'hi' }], { model: 'groq:llama-3.3-70b-versatile', maxTokens: 10, system: 's' });
    await expect(stream.next()).rejects.toMatchObject({ kind: 'missing_key', message: expect.stringContaining('GROQ_API_KEY') });
  });

  it.each([
    ['429 with retry-after', apiError(429, { 'retry-after': '3' }), 'rate_limit', 3000],
    ['401', apiError(401), 'missing_key', undefined],
    ['503', apiError(503), 'unavailable', undefined],
    ['no status (network)', apiError(undefined), 'unavailable', undefined],
    ['404 unknown model', apiError(404), 'rejected', undefined],
    ['LoadAPIKeyError', new LoadAPIKeyError({ message: 'no key' }), 'missing_key', undefined],
    ['plain error', new TypeError('fetch failed'), 'unavailable', undefined],
  ])('classifies %s', (_name, err, kind, retryAfterMs) => {
    const classified = classifyError(err);
    expect(classified).toBeInstanceOf(LLMError);
    expect(classified).toMatchObject({ kind, retryAfterMs });
  });
});
