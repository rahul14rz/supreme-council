import type { CreateCritiquePreserveCouncil } from '../config/schema.js';
import { type KeeperOutput, KeeperOutputSchema, withDissentFrom } from '../verdict.js';
import { createPrompt, critiquePrompt, preservePrompt } from './prompts.js';
import type { DebateSession } from './session.js';

/**
 * Sequential create -> critique -> preserve cycles. Stops when the Keeper
 * reports no material change, when the cycle cap is reached, or when a
 * member fails (the last good Keeper output then stands).
 */
export async function runCreateCritiquePreserve(session: DebateSession, council: CreateCritiquePreserveCouncil, question: string, maxCycles: number) {
  const schema = withDissentFrom(KeeperOutputSchema, [council.creator.id, council.critic.id]);
  let kept = null as KeeperOutput | null; // cast: stops the checker narrowing it to null inside the loop

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const previous = kept && { proposal: kept.proposal, unresolved: kept.verdict.unresolved_disagreements };
    const proposal: string | undefined = await session.say(council.creator, 'create', cycle, createPrompt(question, previous)) ?? kept?.proposal;
    if (!proposal) break;
    const critique = await session.say(council.critic, 'critique', cycle, critiquePrompt(question, proposal));
    if (!critique) break;
    const baseline = kept?.proposal ?? proposal;
    const output: KeeperOutput | null = await session.structured(council.keeper, 'preserve', cycle, preservePrompt(question, baseline, proposal, critique), schema);
    if (!output) break;
    kept = output;
    session.emit({ type: 'round_complete', round: cycle, phase: 'preserve' });
    if (!output.changed) break;
  }

  session.emit({ type: 'verdict', verdict: kept?.verdict ?? null, proposal: kept?.proposal, usage: session.usage });
}
