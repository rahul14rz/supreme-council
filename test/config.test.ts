import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG_DIR, councilAgents, loadConfig } from '../src/config/load.js';
import { parseModelRef } from '../src/config/schema.js';

function tempConfigWith(file: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'council-config-'));
  cpSync(DEFAULT_CONFIG_DIR, dir, { recursive: true });
  writeFileSync(join(dir, 'councils', file), content);
  return dir;
}

const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  id, role: id, systemPrompt: `You are ${id}.`, model: 'groq:llama-3.3-70b-versatile', maxTokens: 500, ...extra,
});
const council = (agents: object[], extra: Record<string, unknown> = {}) => JSON.stringify({
  id: 'bad', name: 'Bad', protocol: 'parallel-rounds', maxRounds: 3, chair: agent('chair'), agents, ...extra,
});

describe('shipped config', () => {
  const config = loadConfig();

  it('loads every council with its protocol', () => {
    const protocols = Object.fromEntries([...config.councils].map(([id, c]) => [id, c.protocol]));
    expect(protocols).toEqual({
      'creator-critic-keeper': 'create-critique-preserve',
      'supreme-free': 'parallel-rounds',
      'supreme-mixed': 'parallel-rounds',
      'supreme-single': 'parallel-rounds',
    });
  });

  it('resolves role prompts from promptRef', () => {
    const council = config.councils.get('supreme-free')!;
    for (const agent of councilAgents(council)) expect(agent.systemPrompt.length).toBeGreaterThan(200);
    expect(council.protocol === 'parallel-rounds' && council.agents.map((a) => a.id))
      .toEqual(['optimist', 'skeptic', 'cost-analyst', 'risk-officer']);
  });

  it('loads provider limits and retry settings', () => {
    expect(config.providers.google).toMatchObject({ apiKeyEnv: 'GOOGLE_API_KEY', freeTier: true });
    expect(config.providers.ollama).toMatchObject({ baseUrlEnv: 'OLLAMA_BASE_URL', freeTier: true });
    for (const p of Object.values(config.providers)) expect(p.rpm).toBeGreaterThan(0);
    expect(config.retry.maxAttempts).toBeGreaterThanOrEqual(1);
  });

  it('parses the price table, including model ids that contain colons', () => {
    expect(config.prices['ollama:llama3.1:8b']).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
    expect(config.prices['anthropic:claude-opus-5-5']?.outputPerMTok).toBeGreaterThan(0);
  });

  it('prices every model a shipped council can use', () => {
    for (const council of config.councils.values()) {
      for (const agent of councilAgents(council)) {
        for (const ref of [agent.model, ...agent.fallbackModels]) expect(config.prices, ref).toHaveProperty([ref]);
      }
    }
  });

  it('keeps supreme-free on free providers, with openrouter only as a fallback', () => {
    for (const agent of councilAgents(config.councils.get('supreme-free')!)) {
      const refs = [agent.model, ...agent.fallbackModels];
      for (const ref of refs) expect(config.providers[parseModelRef(ref).provider].freeTier, ref).toBe(true);
      expect(parseModelRef(agent.model).provider).not.toBe('openrouter');
      expect(parseModelRef(refs.at(-1)!).provider).toBe('openrouter');
    }
  });
});

describe('adding a council', () => {
  it('works by adding one config file with inline prompts', () => {
    const dir = tempConfigWith('hiring-panel.json', JSON.stringify({
      id: 'hiring-panel',
      name: 'Hiring Panel',
      protocol: 'parallel-rounds',
      maxRounds: 2,
      chair: { id: 'chair', role: 'Hiring Manager', systemPrompt: 'Decide.', model: 'google:gemini-2.5-flash', maxTokens: 900 },
      agents: [
        { id: 'tech', role: 'Tech Interviewer', systemPrompt: 'Probe skills.', model: 'groq:llama-3.3-70b-versatile', maxTokens: 500 },
        { id: 'culture', role: 'Team Lead', systemPrompt: 'Probe teamwork.', model: 'mistral:mistral-small-latest', maxTokens: 500 },
      ],
    }));
    const council = loadConfig(dir).councils.get('hiring-panel');
    expect(council?.protocol).toBe('parallel-rounds');
    expect(councilAgents(council!).map((a) => a.fallbackModels)).toEqual([[], [], []]);
  });
});

describe('invalid config', () => {
  const cases: [string, string, RegExp][] = [
    ['unknown provider', council([agent('a', { model: 'acme:x' }), agent('b')]), /provider:model/],
    ['model without a provider', council([agent('a', { model: 'x' }), agent('b')]), /provider:model/],
    ['maxTokens above the per-turn cap', council([agent('a', { maxTokens: 50000 }), agent('b')]), /maxTokens/],
    ['duplicate agent ids', council([agent('a'), agent('a')]), /duplicate agent id "a"/],
    ['missing prompt', council([agent('a', { systemPrompt: undefined }), agent('b')]), /exactly one of systemPrompt or promptRef/],
    ['unknown promptRef', council([agent('a', { systemPrompt: undefined, promptRef: 'nobody' }), agent('b')]), /promptRef "nobody" not found/],
    ['unknown protocol', council([agent('a'), agent('b')], { protocol: 'round-robin' }), /protocol/],
    ['a single agent', council([agent('a')]), /agents/],
    ['a duplicate council id', council([agent('a'), agent('b')], { id: 'supreme-free' }), /duplicate council id "supreme-free"/],
  ];

  it.each(cases)('rejects %s', (_name, json, message) => {
    const dir = tempConfigWith('bad.json', json);
    expect(() => loadConfig(dir)).toThrow(ConfigError);
    expect(() => loadConfig(dir)).toThrow(message);
  });

  it('reports YAML syntax errors as ConfigError', () => {
    expect(() => loadConfig(tempConfigWith('broken.yaml', 'id: [unclosed'))).toThrow(ConfigError);
  });
});
