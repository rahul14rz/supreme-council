import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  type Agent,
  type AgentFile,
  type Config,
  type Council,
  type CouncilFile,
  CouncilFileSchema,
  PricesFileSchema,
  ProvidersFileSchema,
} from './schema.js';

export const DEFAULT_CONFIG_DIR = fileURLToPath(new URL('../../config', import.meta.url));

export class ConfigError extends Error {}

export function loadConfig(dir = DEFAULT_CONFIG_DIR): Config {
  const providersFile = parseFile(join(dir, 'providers.yaml'), ProvidersFileSchema);
  const pricesFile = parseFile(join(dir, 'prices.yaml'), PricesFileSchema);
  return {
    retry: providersFile.retry,
    providers: providersFile.providers,
    prices: pricesFile.prices,
    councils: loadCouncils(dir),
  };
}

function loadCouncils(dir: string): Map<string, Council> {
  const councilsDir = join(dir, 'councils');
  const councils = new Map<string, Council>();
  const files = readdirSync(councilsDir).filter((f) => ['.yaml', '.yml', '.json'].includes(extname(f))).sort();
  for (const file of files) {
    const path = join(councilsDir, file);
    const council = resolveCouncil(parseFile(path, CouncilFileSchema), join(dir, 'roles'), path);
    if (councils.has(council.id)) throw new ConfigError(`${path}: duplicate council id "${council.id}"`);
    councils.set(council.id, council);
  }
  return councils;
}

function resolveCouncil(file: CouncilFile, rolesDir: string, path: string): Council {
  const resolve = (a: AgentFile) => resolveAgent(a, rolesDir, path);
  const council: Council = file.protocol === 'parallel-rounds'
    ? { ...file, chair: resolve(file.chair), agents: file.agents.map(resolve) }
    : { ...file, creator: resolve(file.creator), critic: resolve(file.critic), keeper: resolve(file.keeper) };
  assertUniqueAgentIds(councilAgents(council), path);
  return council;
}

function resolveAgent(agent: AgentFile, rolesDir: string, path: string): Agent {
  const { promptRef, systemPrompt, ...rest } = agent;
  if (systemPrompt) return { ...rest, systemPrompt };
  const promptPath = join(rolesDir, `${promptRef}.md`);
  if (!existsSync(promptPath)) throw new ConfigError(`${path}: agent "${agent.id}" promptRef "${promptRef}" not found at ${promptPath}`);
  return { ...rest, systemPrompt: readFileSync(promptPath, 'utf8').trim() };
}

export function councilAgents(council: Council): Agent[] {
  return council.protocol === 'parallel-rounds'
    ? [council.chair, ...council.agents]
    : [council.creator, council.critic, council.keeper];
}

function assertUniqueAgentIds(agents: Agent[], path: string): void {
  const seen = new Set<string>();
  for (const a of agents) {
    if (seen.has(a.id)) throw new ConfigError(`${path}: duplicate agent id "${a.id}"`);
    seen.add(a.id);
  }
}

function parseFile<T extends z.ZodType>(path: string, schema: T): z.infer<T> {
  const text = readFileSync(path, 'utf8');
  let raw: unknown;
  try {
    raw = extname(path) === '.json' ? JSON.parse(text) : parseYaml(text);
  } catch (err) {
    throw new ConfigError(`${path}: ${(err as Error).message}`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ConfigError(`${path}:\n${z.prettifyError(result.error)}`);
  return result.data;
}
