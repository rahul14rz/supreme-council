import type { CreateCritiquePreserveCouncil, ParallelRoundsCouncil } from '../src/config/schema.js';
import type { ChatMessage, StreamOptions } from '../src/llm/types.js';
import { LLMError } from '../src/llm/types.js';
import type { DebateEvent } from '../src/orchestrator/events.js';
import type { Verdict } from '../src/verdict.js';
import { agent } from './helpers.js';

const MODEL = 'groq:llama-3.3-70b-versatile';

export const council: ParallelRoundsCouncil = {
  id: 'test', name: 'Test', protocol: 'parallel-rounds', maxRounds: 3,
  chair: agent(MODEL, [], 'chair'),
  agents: ['optimist', 'skeptic', 'cost', 'risk'].map((id) => agent(MODEL, [], id)),
};

export const ccpCouncil: CreateCritiquePreserveCouncil = {
  id: 'ccp', name: 'CCP', protocol: 'create-critique-preserve', maxCycles: 4,
  creator: agent(MODEL, [], 'creator'), critic: agent(MODEL, [], 'critic'), keeper: agent(MODEL, [], 'keeper'),
};

export type Phase = 'framing' | 'opening' | 'rebuttal' | 'final' | 'verdict' | 'create' | 'critique' | 'preserve' | 'retry';

// Checked most specific first, because later prompts quote earlier ones.
const PHASE_MARKERS: [Phase, string][] = [
  ['retry', 'could not be used'],
  ['verdict', "council's ruling"],
  ['preserve', 'Keep what survived'],
  ['framing', 'Frame this question'],
  ['final', 'Round 3:'],
  ['rebuttal', 'Round 2:'],
  ['opening', 'Round 1:'],
  ['create', 'Propose one concrete'],
  ['create', 'Improve the current proposal'],
  ['critique', 'Attack this proposal'],
];

export function phaseOf(messages: ChatMessage[]): Phase {
  const last = messages.at(-1)!.content;
  return PHASE_MARKERS.find(([, marker]) => last.includes(marker))![0];
}

export function agentOf(opts: StreamOptions): string {
  return /You are (\S+)\./.exec(opts.system)![1]!;
}

export const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  recommendation: 'Do it, carefully.',
  confidence: 0.7,
  agreements: ['a'],
  unresolved_disagreements: ['b'],
  dissent: { agent: 'skeptic', reason: 'base rates are poor' },
  what_would_change_my_mind: ['c'],
  ...over,
});

export type Reply = string | LLMError;


/** Default debate replies: a marker per agent and phase, and valid JSON for structured turns. */
export function defaultReply(phase: Phase, agentId: string): Reply {
  if (phase === 'verdict' || phase === 'retry') return JSON.stringify(verdict());
  if (phase === 'preserve') return JSON.stringify({ changed: false, proposal: 'kept proposal', verdict: verdict({ dissent: { agent: 'critic', reason: 'r' } }) });
  return `${phase.toUpperCase()}-FROM-${agentId}`;
}

export async function collect(events: AsyncIterable<DebateEvent>): Promise<DebateEvent[]> {
  const out: DebateEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

export const unavailable = () => new LLMError('unavailable', 'down');
