import { councilAgents } from './config/load.js';
import type { Config, ModelRef, Price } from './config/schema.js';
import type { Usage } from './llm/types.js';

/** Models missing from the price table cost $0; the startup report lists them. */
export function turnCostUsd(prices: Partial<Record<ModelRef, Price>>, model: ModelRef, usage: Usage): number {
  const price = prices[model];
  if (!price) return 0;
  return (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
}

export function unpricedModels(config: Config): ModelRef[] {
  const refs = [...config.councils.values()].flatMap(councilAgents).flatMap((a) => [a.model, ...a.fallbackModels]);
  return [...new Set(refs)].filter((ref) => !config.prices[ref]);
}
