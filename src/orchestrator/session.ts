import type { z } from 'zod';
import type { Agent } from '../config/schema.js';
import type { ChatMessage } from '../llm/types.js';
import { type CallDeps, type TurnResult, callAgent } from '../providers/resilient-call.js';
import { parseJsonOutput } from '../verdict.js';
import type { DebateEvent, Phase, SessionUsage } from './events.js';
import { retryJsonPrompt } from './prompts.js';

/** Runs turns for one debate: emits their events and accumulates session usage. */
export class DebateSession {
  readonly usage: SessionUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, turns: [], requests: {} };
  private turnCount = 0;

  constructor(
    private readonly deps: CallDeps,
    readonly emit: (event: DebateEvent) => void,
  ) {}

  async turn(agent: Agent, phase: Phase, round: number, messages: ChatMessage[]): Promise<TurnResult> {
    const turnId = `t${++this.turnCount}`;
    this.emit({ type: 'turn_start', turnId, agentId: agent.id, role: agent.role, phase, round });
    const result = await callAgent(this.deps, agent, messages, {
      onToken: (text) => this.emit({ type: 'token', turnId, text }),
      onAttemptFailed: (f, retrying) =>
        this.emit({ type: 'error', turnId, retrying, message: `${agent.role}: ${f.model} ${f.kind}: ${f.message}` }),
    });
    this.record(turnId, agent, result);
    this.emit({ type: 'turn_end', turnId, result });
    return result;
  }

  /** Text-only convenience: the turn's text, or null if every model failed. */
  async say(agent: Agent, phase: Phase, round: number, prompt: string): Promise<string | null> {
    const result = await this.turn(agent, phase, round, [{ role: 'user', content: prompt }]);
    return result.status === 'ok' ? result.text : null;
  }

  /** A turn whose output must be JSON matching `schema`; on a parse failure, retries once with the error. */
  async structured<T>(agent: Agent, phase: Phase, round: number, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
    let messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await this.turn(agent, phase, round, messages);
      if (result.status === 'failed') return null;
      const parsed = parseJsonOutput(result.text, schema);
      if (parsed.ok) return parsed.value;
      this.emit({ type: 'error', message: `${agent.role} returned invalid JSON (${attempt === 1 ? 'retrying once' : 'giving up'}): ${parsed.error}` });
      messages = [...messages, { role: 'assistant', content: result.text }, { role: 'user', content: retryJsonPrompt(parsed.error) }];
    }
    return null;
  }

  private record(turnId: string, agent: Agent, result: TurnResult): void {
    for (const [provider, n] of Object.entries(result.requests)) {
      const p = provider as keyof SessionUsage['requests'];
      this.usage.requests[p] = (this.usage.requests[p] ?? 0) + n;
    }
    if (result.status !== 'ok') return;
    const { inputTokens, outputTokens } = result.usage;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.costUsd += result.costUsd;
    this.usage.turns.push({ turnId, agentId: agent.id, model: result.model, inputTokens, outputTokens, costUsd: result.costUsd });
  }
}
