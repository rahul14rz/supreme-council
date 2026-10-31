// Pure prompt builders. Role identity lives in each agent's system prompt;
// these add the phase-specific task and the debate material the agent may see.

export type Statement = { agentId: string; role: string; text: string | null };

const NO_RESPONSE = '(no response: this member was unavailable)';

const VERDICT_SHAPE = `{
  "recommendation": string,               // the decision, stated plainly
  "confidence": number,                   // 0 to 1
  "agreements": string[],                 // points the members actually agreed on
  "unresolved_disagreements": string[],   // disagreements the debate did not settle
  "dissent": { "agent": string, "reason": string },  // the member who differs most from the recommendation, and their strongest reason
  "what_would_change_my_mind": string[]   // concrete new information that would change the recommendation
}`;

const JSON_ONLY = 'Return ONLY the JSON object: no prose before or after it, and no code fences.';

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim()}`;
}

function transcript(statements: Statement[], selfId?: string): string {
  return statements
    .map((s) => `### ${s.role}${s.agentId === selfId ? ' (you)' : ''} [${s.agentId}]\n${s.text ?? NO_RESPONSE}`)
    .join('\n\n');
}

export function framingPrompt(question: string): string {
  return [
    section('Question', question),
    section('Your task', `Frame this question for the council. Do not answer it.
1. Restate the question precisely, noting any ambiguity and how you resolve it.
2. List 3-6 concrete criteria the decision should be judged on, most important first.
Be brief.`),
  ].join('\n\n');
}

export function openingPrompt(question: string, framing: string | null): string {
  return [
    section('Question', question),
    ...(framing ? [section("Chair's framing", framing)] : []),
    section('Your task', `Round 1: give your opening position, from your role only. You have not seen any other member's view, and should not guess at them.
Use this structure:
**Position:** one sentence.
**Reasoning:** 3-5 bullets, each with a concrete reason.
**Key uncertainty:** the one thing that, if you are wrong about it, changes your answer.`),
  ].join('\n\n');
}

export function rebuttalPrompt(question: string, openings: Statement[], selfId: string): string {
  return [
    section('Question', question),
    section('Round 1 opening positions', transcript(openings, selfId)),
    section('Your task', `Round 2: rebuttal. Respond to the OTHER members, staying in your role.
**Disagree:** name one member and one specific point of theirs you think is wrong, and give a concrete reason.
**Concede:** name one specific point from another member that is right and that you had missed or underweighted, and the concrete argument that convinced you. Concede only to a concrete argument, never to be agreeable. If nothing convinced you, write "Concede: nothing" and say why the strongest opposing point still fails.
**Updated position:** one or two sentences.`),
  ].join('\n\n');
}

export function finalPrompt(question: string, openings: Statement[], rebuttals: Statement[], selfId: string): string {
  return [
    section('Question', question),
    section('Round 1 opening positions', transcript(openings, selfId)),
    section('Round 2 rebuttals', transcript(rebuttals, selfId)),
    section('Your task', `Round 3: final stance. Change your position only if an argument above gave you a concrete reason to; say which.
**Final stance:** one sentence.
**Confidence:** an integer from 1 to 10.
**Why:** 2-3 bullets.`),
  ].join('\n\n');
}

export function verdictPrompt(question: string, framing: string | null, rounds: { title: string; statements: Statement[] }[]): string {
  const memberIds = [...new Set(rounds.flatMap((r) => r.statements.map((s) => s.agentId)))];
  return [
    section('Question', question),
    ...(framing ? [section('Your framing', framing)] : []),
    ...rounds.map((r) => section(r.title, transcript(r.statements))),
    section('Your task', `Write the council's ruling as a JSON object of this shape:
${VERDICT_SHAPE}
"dissent.agent" must be one of: ${memberIds.join(', ')}. Use "none" only if every member ended up agreeing with the recommendation.
Members who were unavailable count for nothing; do not invent their views.
${JSON_ONLY}`),
  ].join('\n\n');
}

export function retryJsonPrompt(error: string): string {
  return `Your previous reply could not be used: ${error}\nReply again with the corrected JSON object. ${JSON_ONLY}`;
}

export function createPrompt(question: string, previous: { proposal: string; unresolved: string[] } | null): string {
  if (!previous) {
    return [
      section('Problem', question),
      section('Your task', 'Propose one concrete, actionable solution: numbered steps, and what "done" looks like.'),
    ].join('\n\n');
  }
  return [
    section('Problem', question),
    section('Current proposal (kept by the Keeper after the last critique)', previous.proposal),
    section('Unresolved issues', previous.unresolved.length ? previous.unresolved.map((u) => `- ${u}`).join('\n') : '- none'),
    section('Your task', 'Improve the current proposal: address the unresolved issues and keep what works. Write out the full revised proposal. If it needs no further change, return it unchanged.'),
  ].join('\n\n');
}

export function critiquePrompt(question: string, proposal: string): string {
  return [
    section('Problem', question),
    section('Proposal', proposal),
    section('Your task', 'Attack this proposal. List its weaknesses ranked by damage, each with the concrete situation in which it fails. Then, in at most two lines, note what is sound. If it is now solid, say so plainly.'),
  ].join('\n\n');
}

export function preservePrompt(question: string, baseline: string, proposal: string, critique: string): string {
  return [
    section('Problem', question),
    section('Baseline (the proposal as it stood at the start of this cycle)', baseline),
    section("This cycle's proposal", proposal),
    section('Critique', critique),
    section('Your task', `Keep what survived the critique, fix what did not, and write the revised proposal in full.
Set "changed" to true only if your revised proposal differs MATERIALLY from the baseline: a changed decision, an added or removed step, or a changed risk posture. Rewording, reordering and small clarifications are not material.
Return a JSON object of this shape:
{
  "changed": boolean,
  "proposal": string,   // the full revised proposal
  "verdict": ${VERDICT_SHAPE.replace(/\n/g, '\n  ')}
}
In the verdict, "dissent.agent" must be "creator", "critic", or "none".
${JSON_ONLY}`),
  ].join('\n\n');
}
