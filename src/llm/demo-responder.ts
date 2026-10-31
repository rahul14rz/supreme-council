import type { MockResponder } from './mock-client.js';

/**
 * Canned replies for `--mock` runs, so the CLI, server and client can be
 * exercised without API keys. Replies are role-flavoured placeholders, not advice.
 */
export const demoResponder: MockResponder = async (messages, opts) => {
  await new Promise((r) => setTimeout(r, 30));
  const prompt = messages.at(-1)!.content;
  const role = /You are (?:the )?([A-Z][\w/-]*(?: [A-Z][\w/-]*)?)/.exec(opts.system)?.[1] ?? 'Member';
  if (!prompt.includes('Return ONLY the JSON object')) {
    return `[mock ${role}] This is a placeholder reply from the ${role}. With a real provider, this turn would argue the question from the ${role}'s perspective.`;
  }
  const allowed = /must be one of: ([\w, -]+)\./.exec(prompt)?.[1]?.split(', ') ?? ['critic'];
  const verdict = {
    recommendation: '[mock] Proceed with a small, reversible pilot before committing fully.',
    confidence: 0.62,
    agreements: ['[mock] A pilot reduces downside.'],
    unresolved_disagreements: ['[mock] Whether the upside justifies the effort.'],
    dissent: { agent: allowed[0] ?? 'none', reason: '[mock] The strongest objection, preserved as dissent.' },
    what_would_change_my_mind: ['[mock] Evidence from the pilot.'],
  };
  if (prompt.includes('"changed"')) return JSON.stringify({ changed: false, proposal: '[mock] 1. Pilot. 2. Measure. 3. Decide.', verdict });
  return JSON.stringify(verdict);
};
