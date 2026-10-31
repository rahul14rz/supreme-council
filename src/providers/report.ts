import { councilAgents } from '../config/load.js';
import { type Config, type Council, PROVIDER_IDS, type ProviderId, parseModelRef } from '../config/schema.js';
import { unpricedModels } from '../cost.js';
import { isProviderAvailable } from './availability.js';

type Env = Record<string, string | undefined>;

export type ProviderStatus = {
  id: ProviderId; available: boolean; freeTier: boolean; rpm: number; rpd: number | null; requestsToday: number; credentialEnv: string;
};

export type CouncilStatus = {
  /** ready: every member's primary model is available. fallbacks: some members rely on fallbacks. blocked: some members have no option. */
  state: 'ready' | 'fallbacks' | 'blocked';
  onFallback: string[];
  noModel: string[];
};

export function providerStatuses(config: Config, env: Env, requestsToday: Partial<Record<ProviderId, number>>): ProviderStatus[] {
  return PROVIDER_IDS.map((id) => {
    const p = config.providers[id];
    return {
      id, available: isProviderAvailable(p, env), freeTier: p.freeTier, rpm: p.rpm, rpd: p.rpd,
      requestsToday: requestsToday[id] ?? 0, credentialEnv: (p.apiKeyEnv ?? p.baseUrlEnv)!,
    };
  });
}

export function councilStatus(council: Council, available: (p: ProviderId) => boolean): CouncilStatus {
  const usable = (ref: Parameters<typeof parseModelRef>[0]) => available(parseModelRef(ref).provider);
  const onFallback: string[] = [];
  const noModel: string[] = [];
  for (const agent of councilAgents(council)) {
    if (usable(agent.model)) continue;
    (agent.fallbackModels.some(usable) ? onFallback : noModel).push(agent.id);
  }
  return { state: noModel.length ? 'blocked' : onFallback.length ? 'fallbacks' : 'ready', onFallback, noModel };
}

/** Human-readable startup report. Prints env var names only, never their values. */
export function formatStartupReport(config: Config, env: Env, requestsToday: Partial<Record<ProviderId, number>>): string {
  const providers = providerStatuses(config, env, requestsToday);
  const available = (id: ProviderId) => providers.find((p) => p.id === id)!.available;
  const lines = ['Providers:'];
  for (const p of providers) {
    const limits = `${p.rpm} rpm, ${p.rpd ?? 'no'} daily cap`;
    const usage = p.rpd ? `${p.requestsToday}/${p.rpd} today` : `${p.requestsToday} today`;
    lines.push(p.available
      ? `  ✓ ${p.id.padEnd(10)} ${p.freeTier ? 'free' : 'paid'}  ${limits}; ${usage}`
      : `  ✗ ${p.id.padEnd(10)} unavailable: ${p.credentialEnv} is not set`);
  }
  lines.push('Councils:');
  for (const council of config.councils.values()) {
    const s = councilStatus(council, available);
    const detail = s.state === 'ready' ? 'ready'
      : s.state === 'fallbacks' ? `runs on fallback models for: ${s.onFallback.join(', ')}`
      : `cannot run fully, no available model for: ${s.noModel.join(', ')}`;
    lines.push(`  ${s.state === 'blocked' ? '✗' : '✓'} ${council.id.padEnd(22)} ${detail}`);
  }
  const unpriced = unpricedModels(config);
  if (unpriced.length) lines.push(`Unpriced models (costed at $0): ${unpriced.join(', ')}`);
  return lines.join('\n');
}

export function usesFreeTier(council: Council, config: Config): boolean {
  return councilAgents(council).some((a) => [a.model, ...a.fallbackModels].some((r) => config.providers[parseModelRef(r).provider].freeTier));
}
