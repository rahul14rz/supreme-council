import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config/load.js';
import { Store } from './db/store.js';
import { demoResponder } from './llm/demo-responder.js';
import { MockLLMClient } from './llm/mock-client.js';
import { formatStartupReport } from './providers/report.js';
import { createCallDeps } from './runtime.js';
import { buildApp } from './server/app.js';

const { values } = parseArgs({ options: { mock: { type: 'boolean', default: false } } });
const config = loadConfig();
// Mock runs get their own database so they never count against real provider quotas.
const dbPath = values.mock ? 'data/mock.db' : (process.env.SUPREME_COUNCIL_DB ?? 'data/council.db');
mkdirSync(dirname(dbPath), { recursive: true });
const store = new Store(dbPath);
const interrupted = store.failInterrupted();

if (values.mock) console.log('MOCK MODE: canned replies, no provider is called.\n');
console.log(formatStartupReport(config, process.env, store.requestsToday()));
if (interrupted) console.log(`Marked ${interrupted} interrupted session(s) as failed.`);

const deps = createCallDeps(config, store, process.env, values.mock ? new MockLLMClient(demoResponder) : undefined);
const app = buildApp({ config, store, deps, env: process.env, logger: true });
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
