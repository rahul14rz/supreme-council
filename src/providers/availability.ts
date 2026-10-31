import type { ProviderConfig } from '../config/schema.js';

type Env = Record<string, string | undefined>;

/** Key-based providers need their key; ollama needs its base URL. Values are never logged. */
export function providerCredential(cfg: ProviderConfig, env: Env): string | undefined {
  const name = cfg.apiKeyEnv ?? cfg.baseUrlEnv;
  const value = name ? env[name]?.trim() : undefined;
  return value || undefined;
}

export function isProviderAvailable(cfg: ProviderConfig, env: Env): boolean {
  return providerCredential(cfg, env) !== undefined;
}
