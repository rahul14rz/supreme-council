import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Agent, Config, ProviderId } from '../src/config/schema.js';
import { AgentFileSchema, parseModelRef } from '../src/config/schema.js';
import type { Store } from '../src/db/store.js';
import type { DebateEvent } from '../src/orchestrator/events.js';
import { resolveRounds } from '../src/orchestrator/run.js';
import { councilStatus } from '../src/providers/report.js';
import { type CallDeps, type RequestCounts, callAgent } from '../src/providers/resilient-call.js';
import { startSession } from '../src/runtime.js';

const QuestionsSchema = z.object({
  questions: z.array(z.object({ id: z.string(), question: z.string(), answer: z.enum(['yes', 'no']) })).min(1),
});
export type Question = z.infer<typeof QuestionsSchema>['questions'][number];

const EvalConfigSchema = z.object({
  questionSuffix: z.string(),
  baseline: AgentFileSchema,
  conditions: z.array(z.object({ id: z.string(), label: z.string(), council: z.string().optional() })).min(1),
});
export type EvalConfig = z.infer<typeof EvalConfigSchema>;
export type Condition = EvalConfig['conditions'][number];

export function loadEval(dir: string): { questions: Question[]; config: EvalConfig } {
  const read = (f: string) => parseYaml(readFileSync(`${dir}/${f}`, 'utf8'));
  return { questions: QuestionsSchema.parse(read('questions.yaml')).questions, config: EvalConfigSchema.parse(read('config.yaml')) };
}

/** The decision a recommendation opens with. Anything else, including no verdict, is graded wrong. */
export function gradeAnswer(recommendation: string | null): 'yes' | 'no' | null {
  if (!recommendation) return null;
  const line = /Recommendation:\s*(.*)/i.exec(recommendation)?.[1] ?? recommendation;
  const word = /^[\s*_"'`#>-]*(yes|no)\b/i.exec(line)?.[1];
  return word ? (word.toLowerCase() as 'yes' | 'no') : null;
}

export type QuestionResult = { id: string; expected: 'yes' | 'no'; got: 'yes' | 'no' | null; costUsd: number; outputTokens: number; requests: RequestCounts };

export type ConditionResult =
  | { condition: Condition; skipped: string }
  | { condition: Condition; results: QuestionResult[] };

/** Run one condition over all questions, sequentially so free-tier rate limits hold. */
export async function runCondition(condition: Condition, questions: Question[], evalConfig: EvalConfig, config: Config, deps: CallDeps, store: Store): Promise<ConditionResult> {
  const skip = unavailableReason(condition, evalConfig, config, deps);
  if (skip) return { condition, skipped: skip };
  const results: QuestionResult[] = [];
  for (const q of questions) {
    const prompt = `${q.question}\n\n${evalConfig.questionSuffix}`;
    const outcome = condition.council
      ? await askCouncil(condition.council, prompt, config, deps, store)
      : await askBaseline(evalConfig, prompt, deps);
    results.push({ id: q.id, expected: q.answer, got: gradeAnswer(outcome.recommendation), ...outcome.usage });
  }
  return { condition, results };
}

function unavailableReason(condition: Condition, evalConfig: EvalConfig, config: Config, deps: CallDeps): string | null {
  if (!condition.council) {
    const { provider } = parseModelRef(evalConfig.baseline.model);
    return deps.isAvailable(provider) ? null : `baseline model's provider (${provider}) is unavailable`;
  }
  const council = config.councils.get(condition.council);
  if (!council) return `unknown council ${condition.council}`;
  const status = councilStatus(council, (p: ProviderId) => deps.isAvailable(p));
  return status.state === 'blocked' ? `no available model for: ${status.noModel.join(', ')}` : null;
}

async function askCouncil(councilId: string, prompt: string, config: Config, deps: CallDeps, store: Store) {
  const council = config.councils.get(councilId)!;
  const { events } = startSession(deps, store, council, prompt, resolveRounds(council));
  let verdict: Extract<DebateEvent, { type: 'verdict' }> | undefined;
  for await (const e of events) if (e.type === 'verdict') verdict = e;
  return {
    recommendation: verdict?.verdict?.recommendation ?? null,
    usage: { costUsd: verdict?.usage.costUsd ?? 0, outputTokens: verdict?.usage.outputTokens ?? 0, requests: verdict?.usage.requests ?? {} },
  };
}

async function askBaseline(evalConfig: EvalConfig, prompt: string, deps: CallDeps) {
  const { promptRef: _unused, systemPrompt, ...rest } = evalConfig.baseline;
  const agent: Agent = { ...rest, systemPrompt: systemPrompt ?? '' };
  const result = await callAgent(deps, agent, [{ role: 'user', content: prompt }], { onToken: () => {}, onAttemptFailed: () => {} });
  const ok = result.status === 'ok';
  return {
    recommendation: ok ? result.text : null,
    usage: { costUsd: ok ? result.costUsd : 0, outputTokens: ok ? result.usage.outputTokens : 0, requests: result.requests },
  };
}

export function comparisonTable(rows: ConditionResult[], questionCount: number): string {
  const lines = [
    '| Condition | Correct | No clear answer | Total cost | Cost / question | Output tokens / question | Requests |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    if ('skipped' in row) {
      lines.push(`| ${row.condition.label} | skipped: ${row.skipped} | | | | | |`);
      continue;
    }
    const r = row.results;
    const correct = r.filter((x) => x.got === x.expected).length;
    const unclear = r.filter((x) => x.got === null).length;
    const cost = r.reduce((s, x) => s + x.costUsd, 0);
    const tokens = r.reduce((s, x) => s + x.outputTokens, 0);
    const requests: Record<string, number> = {};
    for (const x of r) for (const [p, n] of Object.entries(x.requests)) requests[p] = (requests[p] ?? 0) + (n ?? 0);
    const reqText = Object.entries(requests).map(([p, n]) => `${p} ${n}`).join(', ') || 'none';
    lines.push(`| ${row.condition.label} | ${correct}/${questionCount} (${Math.round((100 * correct) / questionCount)}%) | ${unclear} | $${cost.toFixed(4)} | $${(cost / r.length).toFixed(4)} | ${Math.round(tokens / r.length)} | ${reqText} |`);
  }
  return lines.join('\n');
}
