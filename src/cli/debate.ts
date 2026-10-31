import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config/load.js';
import { Store } from '../db/store.js';
import { demoResponder } from '../llm/demo-responder.js';
import { MockLLMClient } from '../llm/mock-client.js';
import { resolveRounds } from '../orchestrator/run.js';
import { formatStartupReport, usesFreeTier } from '../providers/report.js';
import { createCallDeps, startSession } from '../runtime.js';
import { TimelinePrinter } from './printer.js';
import { loadDotEnv } from '../env.js';

loadDotEnv();

const USAGE = `Usage: npm run debate -- [--council <id>] [--rounds <n>] [--mock] [--db <path>] "your question"`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      council: { type: 'string', default: 'supreme-free' },
      rounds: { type: 'string' },
      mock: { type: 'boolean', default: false },
      db: { type: 'string', default: process.env.SUPREME_COUNCIL_DB ?? 'data/council.db' },
    },
    allowPositionals: true,
  });
  const question = positionals.join(' ').trim();
  if (!question) return fail(USAGE);

  const config = loadConfig();
  const council = config.councils.get(values.council);
  if (!council) return fail(`Unknown council "${values.council}". Available: ${[...config.councils.keys()].join(', ')}`);
  const rounds = resolveRounds(council, values.rounds === undefined ? undefined : Number(values.rounds));

  // Mock runs use a throwaway database, so they never touch real quota counts.
  if (!values.mock) mkdirSync(dirname(values.db), { recursive: true });
  const store = new Store(values.mock ? ':memory:' : values.db);
  if (values.mock) console.log('MOCK MODE: canned replies, no provider is called; the availability below does not apply.\n');
  console.log(formatStartupReport(config, process.env, store.requestsToday()));
  if (!values.mock && usesFreeTier(council, config)) {
    console.log('\nWarning: this council uses free tiers, which may use your question for training. Do not send confidential questions.');
  }
  console.log(`\nCouncil: ${council.name} · ${council.protocol} · ${rounds} ${council.protocol === 'parallel-rounds' ? 'rounds' : 'max cycles'}`);
  console.log(`Question: ${question}`);

  const deps = createCallDeps(config, store, process.env, values.mock ? new MockLLMClient(demoResponder) : undefined);
  const { sessionId, events } = startSession(deps, store, council, question, rounds);
  const printer = new TimelinePrinter((s) => process.stdout.write(s));
  for await (const event of events) printer.handle(event);
  console.log(`\nSession ${sessionId}${values.mock ? ' (mock, not saved)' : ` saved to ${values.db}`}`);
  store.close();
  return 0;
}

function fail(message: string): number {
  console.error(message);
  return 1;
}

main().then((code) => { process.exitCode = code; }, (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
