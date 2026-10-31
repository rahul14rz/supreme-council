import { z } from 'zod';

export const PROVIDER_IDS = ['anthropic', 'openai', 'google', 'groq', 'mistral', 'openrouter', 'ollama'] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** "provider:model". The model part may itself contain colons (e.g. "ollama:family:tag"). */
export type ModelRef = `${ProviderId}:${string}`;

export function parseModelRef(ref: ModelRef): { provider: ProviderId; model: string } {
  const i = ref.indexOf(':');
  return { provider: ref.slice(0, i) as ProviderId, model: ref.slice(i + 1) };
}

export const ModelRefSchema = z.string().refine(
  (s) => {
    const i = s.indexOf(':');
    return i > 0 && i < s.length - 1 && ProviderIdSchema.safeParse(s.slice(0, i)).success;
  },
  { message: `must be "provider:model" with provider one of ${PROVIDER_IDS.join(', ')}` },
).transform((s) => s as ModelRef);

const ProviderSchema = z.object({
  apiKeyEnv: z.string().optional(),
  baseUrl: z.url().optional(),
  baseUrlEnv: z.string().optional(),
  rpm: z.number().int().positive(),
  rpd: z.number().int().positive().nullable(),
  freeTier: z.boolean(),
}).strict().refine((p) => Boolean(p.apiKeyEnv) !== Boolean(p.baseUrlEnv), {
  message: 'set exactly one of apiKeyEnv or baseUrlEnv',
});
export type ProviderConfig = z.infer<typeof ProviderSchema>;

export const ProvidersFileSchema = z.object({
  retry: z.object({
    maxAttempts: z.number().int().min(1).max(10),
    baseDelayMs: z.number().int().nonnegative(),
    maxDelayMs: z.number().int().nonnegative(),
  }).strict(),
  providers: z.record(ProviderIdSchema, ProviderSchema),
}).strict();
export type ProvidersFile = z.infer<typeof ProvidersFileSchema>;
export type RetryConfig = ProvidersFile['retry'];

const PriceSchema = z.object({
  inputPerMTok: z.number().nonnegative(),
  outputPerMTok: z.number().nonnegative(),
}).strict();
export type Price = z.infer<typeof PriceSchema>;

export const PricesFileSchema = z.object({
  prices: z.record(ModelRefSchema, PriceSchema),
}).strict();

/** Hard ceiling on any single turn, whatever a council file asks for. */
export const MAX_TOKENS_PER_TURN = 8000;

export const AgentFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  role: z.string().min(1),
  systemPrompt: z.string().min(1).optional(),
  promptRef: z.string().regex(/^[a-z0-9-]+$/).optional(),
  model: ModelRefSchema,
  fallbackModels: z.array(ModelRefSchema).default([]),
  maxTokens: z.number().int().positive().max(MAX_TOKENS_PER_TURN),
}).strict().refine((a) => Boolean(a.systemPrompt) !== Boolean(a.promptRef), {
  message: 'set exactly one of systemPrompt or promptRef',
});
export type AgentFile = z.infer<typeof AgentFileSchema>;

const CouncilBase = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
};

export const CouncilFileSchema = z.discriminatedUnion('protocol', [
  z.object({
    ...CouncilBase,
    protocol: z.literal('parallel-rounds'),
    maxRounds: z.union([z.literal(2), z.literal(3)]),
    chair: AgentFileSchema,
    agents: z.array(AgentFileSchema).min(2),
  }).strict(),
  z.object({
    ...CouncilBase,
    protocol: z.literal('create-critique-preserve'),
    maxCycles: z.number().int().min(1).max(10),
    creator: AgentFileSchema,
    critic: AgentFileSchema,
    keeper: AgentFileSchema,
  }).strict(),
]);
export type CouncilFile = z.infer<typeof CouncilFileSchema>;

/** An agent after its promptRef has been resolved. */
export type Agent = Omit<AgentFile, 'systemPrompt' | 'promptRef'> & { systemPrompt: string };

export type ParallelRoundsCouncil = Omit<Extract<CouncilFile, { protocol: 'parallel-rounds' }>, 'chair' | 'agents'> & {
  chair: Agent;
  agents: Agent[];
};
export type CreateCritiquePreserveCouncil = Omit<
  Extract<CouncilFile, { protocol: 'create-critique-preserve' }>,
  'creator' | 'critic' | 'keeper'
> & { creator: Agent; critic: Agent; keeper: Agent };
export type Council = ParallelRoundsCouncil | CreateCritiquePreserveCouncil;

export type Config = {
  retry: RetryConfig;
  providers: Record<ProviderId, ProviderConfig>;
  prices: Partial<Record<ModelRef, Price>>;
  councils: Map<string, Council>;
};
