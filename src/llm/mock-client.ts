import type { ChatMessage, LLMClient, LLMError, StreamOptions, Usage } from './types.js';

export type MockResponder = (messages: ChatMessage[], opts: StreamOptions) => string | LLMError | Promise<string | LLMError>;

/** Scripted LLMClient for tests and `--mock` runs. Streams the reply word by word. */
export class MockLLMClient implements LLMClient {
  readonly calls: { messages: ChatMessage[]; opts: StreamOptions }[] = [];

  constructor(private readonly respond: MockResponder) {}

  async *stream(messages: ChatMessage[], opts: StreamOptions): AsyncGenerator<string, Usage> {
    this.calls.push({ messages, opts });
    const reply = await this.respond(messages, opts);
    if (typeof reply !== 'string') throw reply;
    for (const token of reply.split(/(?<=\s)/)) yield token;
    const prompt = opts.system + messages.map((m) => m.content).join('');
    return { inputTokens: approxTokens(prompt), outputTokens: approxTokens(reply) };
  }
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
