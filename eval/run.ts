import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config/load.js';
import { Store } from '../src/db/store.js';
import { demoResponder } from '../src/llm/demo-responder.js';
import { MockLLMClient } from '../src/llm/mock-client.js';
import { formatStartupReport } from '../src/providers/report.js';
import { createCallDeps } from '../src/runtime.js';
import { type ConditionResult, comparisonTable, loadEval, runCondition } from './harness.js';
import { loadDotEnv } from '../src/env.js';

loadDotEnv();

const EVAL_DIR = fileURLToPath(new URL('.', import.meta.url));

const { values } = parseArgs({
  options: {
    conditions: { type: 'string' },
    limit: { type: 'string' },
    mock: { type: 'boolean', default: false },
    db: { type: 'string', default: process.env.SUPREME_COUNCIL_DB ?? 'data/council.db' },
  },
});

const config = loadConfig();
const { questions: allQuestions, config: evalConfig } = loadEval(EVAL_DIR);
const questions = values.limit ? allQuestions.slice(0, Number(values.limit)) : allQuestions;
const wanted = values.conditions?.split(',');
const conditions = evalConfig.conditions.filter((c) => !wanted || wanted.includes(c.id));

if (!values.mock) mkdirSync('data', { recursive: true });
const store = new Store(values.mock ? ':memory:' : values.db);
const deps = createCallDeps(config, store, process.env, values.mock ? new MockLLMClient(demoResponder) : undefined);
console.log(values.mock ? 'MOCK MODE: canned replies; scores are meaningless, this only checks the harness.\n' : formatStartupReport(config, process.env, store.requestsToday()));

const rows: ConditionResult[] = [];
for (const condition of conditions) {
  process.stdout.write(`\nRunning ${condition.label} on ${questions.length} questions...`);
  const row = await runCondition(condition, questions, evalConfig, config, deps, store);
  process.stdout.write('skipped' in row ? ` skipped (${row.skipped})\n` : ' done\n');
  if ('results' in row) {
    for (const r of row.results) console.log(`  ${r.got === r.expected ? '✓' : '✗'} ${r.id}: expected ${r.expected}, got ${r.got ?? 'no clear answer'}`);
  }
  rows.push(row);
}

const table = comparisonTable(rows, questions.length);
console.log(`\n${table}`);
if (!values.mock && rows.some((r) => 'results' in r)) {
  const out = `eval/results-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.md`;
  writeFileSync(out, `# Eval run ${new Date().toISOString()}\n\n${questions.length} questions.\n\n${table}\n\n## Per question\n\n\`\`\`json\n${JSON.stringify(rows, null, 2)}\n\`\`\`\n`);
  console.log(`\nWrote ${out}`);
}
store.close();
