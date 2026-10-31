import { z } from 'zod';

export const VerdictSchema = z.object({
  recommendation: z.string().min(1),
  confidence: z.number().min(0).max(1),
  agreements: z.array(z.string()),
  unresolved_disagreements: z.array(z.string()),
  dissent: z.object({ agent: z.string().min(1), reason: z.string().min(1) }),
  what_would_change_my_mind: z.array(z.string()),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const KeeperOutputSchema = z.object({
  changed: z.boolean(),
  proposal: z.string().min(1),
  verdict: VerdictSchema,
});
export type KeeperOutput = z.infer<typeof KeeperOutputSchema>;

/** dissent.agent must name a real member, or "none" when the council was unanimous. */
export function withDissentFrom<T extends z.ZodType<{ dissent: { agent: string } } | { verdict: { dissent: { agent: string } } }>>(
  schema: T,
  agentIds: string[],
) {
  const allowed = [...agentIds, 'none'];
  return schema.refine(
    (v) => allowed.includes('verdict' in v ? v.verdict.dissent.agent : v.dissent.agent),
    { message: `dissent.agent must be one of: ${allowed.join(', ')}` },
  );
}

/** Parse a JSON object out of model output, tolerating code fences and surrounding prose. */
export function parseJsonOutput<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false, error: 'no JSON object found' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  const result = schema.safeParse(raw);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: z.prettifyError(result.error) };
}
