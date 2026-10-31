import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { councilAgents, loadConfig } from '../src/config/load.js';
import { parseModelRef } from '../src/config/schema.js';

const SRC = join(import.meta.dirname, '..', 'src');
const ADAPTER = 'llm/ai-sdk-client.ts';

const sources = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ path: relative(SRC, join(SRC, f)), text: readFileSync(join(SRC, f), 'utf8') }));

describe('code boundaries', () => {
  it('imports provider SDKs only from the adapter', () => {
    const offenders = sources
      .filter((s) => s.path !== ADAPTER && /from ['"](ai|@ai-sdk\/[^'"]+)['"]/.test(s.text))
      .map((s) => s.path);
    expect(offenders).toEqual([]);
  });

  it('keeps model ids out of code (config only)', () => {
    const config = loadConfig();
    const refs = new Set([...Object.keys(config.prices), ...[...config.councils.values()]
      .flatMap(councilAgents).flatMap((a) => [a.model, ...a.fallbackModels])]);
    const models = [...refs].map((r) => parseModelRef(r as `groq:${string}`).model);
    const offenders = sources.flatMap((s) => models.filter((m) => s.text.includes(m)).map((m) => `${s.path}: ${m}`));
    expect(offenders).toEqual([]);
  });
});
