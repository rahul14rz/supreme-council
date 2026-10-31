import type { Agent, ParallelRoundsCouncil } from '../config/schema.js';
import { VerdictSchema, withDissentFrom } from '../verdict.js';
import { finalPrompt, framingPrompt, openingPrompt, rebuttalPrompt, type Statement, verdictPrompt } from './prompts.js';
import type { DebateSession } from './session.js';
import type { Phase } from './events.js';

/**
 * Framing, then rounds that run every member in parallel, with each round
 * waiting for the previous one. Round 1 prompts contain only the question
 * and the chair's framing, so members cannot anchor on each other.
 */
export async function runParallelRounds(session: DebateSession, council: ParallelRoundsCouncil, question: string, rounds: number) {
  const framing = await session.say(council.chair, 'framing', 0, framingPrompt(question));

  const openings = await round(session, council.agents, 'opening', 1, () => openingPrompt(question, framing));
  const rebuttals = await round(session, council.agents, 'rebuttal', 2, (a) => rebuttalPrompt(question, openings, a.id));
  const finals = rounds >= 3
    ? await round(session, council.agents, 'final', 3, (a) => finalPrompt(question, openings, rebuttals, a.id))
    : null;

  const transcript = [
    { title: 'Round 1: opening positions', statements: openings },
    { title: 'Round 2: rebuttals', statements: rebuttals },
    ...(finals ? [{ title: 'Round 3: final stances', statements: finals }] : []),
  ];
  const schema = withDissentFrom(VerdictSchema, council.agents.map((a) => a.id));
  const verdict = await session.structured(council.chair, 'verdict', rounds + 1, verdictPrompt(question, framing, transcript), schema);
  session.emit({ type: 'verdict', verdict, usage: session.usage });
}

async function round(session: DebateSession, agents: Agent[], phase: Phase, n: number, prompt: (a: Agent) => string): Promise<Statement[]> {
  const statements = await Promise.all(agents.map(async (a) => ({
    agentId: a.id,
    role: a.role,
    text: await session.say(a, phase, n, prompt(a)),
  })));
  session.emit({ type: 'round_complete', round: n, phase });
  return statements;
}
