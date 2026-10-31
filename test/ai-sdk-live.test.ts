// Drives the real Vercel AI SDK adapter against a local OpenAI-compatible
// server (as the ollama provider), so the streaming, usage and error paths
// are exercised end to end without API keys.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAiSdkClient } from '../src/llm/ai-sdk-client.js';
import { config } from './helpers.js';

let server: Server;
let baseUrl: string;
let nextStatus = 200;
const requests: unknown[] = [];

const chunk = (delta: object, extra: object = {}) =>
  `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'fake', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      requests.push(JSON.parse(body));
      if (nextStatus !== 200) {
        res.writeHead(nextStatus, { 'content-type': 'application/json', 'retry-after': '2' });
        res.end(JSON.stringify({ error: { message: 'slow down' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(chunk({ role: 'assistant', content: 'Hello' }));
      res.write(chunk({ content: ' council' }));
      res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'fake', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function drain(gen: AsyncGenerator<string, { inputTokens: number; outputTokens: number }>) {
  const tokens: string[] = [];
  for (;;) {
    const n = await gen.next();
    if (n.done) return { tokens, usage: n.value };
    tokens.push(n.value);
  }
}

describe('AI SDK adapter over HTTP', () => {
  const client = () => createAiSdkClient(config.providers, { OLLAMA_BASE_URL: baseUrl });
  const opts = { model: 'ollama:fake-model' as const, maxTokens: 50, system: 'You are terse.' };

  it('streams tokens and normalizes usage', async () => {
    nextStatus = 200;
    const { tokens, usage } = await drain(client().stream([{ role: 'user', content: 'hi' }], opts));
    expect(tokens.join('')).toBe('Hello council');
    expect(usage).toEqual({ inputTokens: 11, outputTokens: 2 });
    expect(requests.at(-1)).toMatchObject({ model: 'fake-model', max_tokens: 50, stream: true, messages: [{ role: 'system', content: 'You are terse.' }, { role: 'user', content: 'hi' }] });
  });

  it('surfaces an HTTP 429 as a rate_limit error with retry-after', async () => {
    nextStatus = 429;
    await expect(drain(client().stream([{ role: 'user', content: 'hi' }], opts))).rejects.toMatchObject({ kind: 'rate_limit', retryAfterMs: 2000 });
  });

  it('surfaces an HTTP 503 as unavailable', async () => {
    nextStatus = 503;
    await expect(drain(client().stream([{ role: 'user', content: 'hi' }], opts))).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
