# Supreme Council

> Multi-agent debate where role-based AIs argue, a chair rules, and dissent stays visible.

> **Data privacy warning:** free API tiers (Google AI Studio, Groq, Mistral's free plan, OpenRouter free models) may use submitted prompts and outputs to train their models. **Do not send confidential questions through a free-tier council** (`supreme-free`, `creator-critic-keeper`). Use a paid provider, or a local Ollama model, for anything sensitive.

**Status:** under construction. Step 1 of 9 is done: the config loader, the provider and price tables, and the `LLMClient` interface with its Vercel AI SDK adapter.

## Layout

```
config/
  providers.yaml       # env var, requests/minute, requests/day, free tier, per provider
  prices.yaml          # USD per million tokens, keyed by "provider:model"
  roles/*.md           # system prompts, referenced by promptRef
  councils/*.yaml      # one file per council
src/
  config/              # Zod schemas and the loader
  llm/                 # LLMClient interface + the only module that imports provider SDKs
  providers/           # availability (and soon rate limiting, fallbacks)
```

Model IDs live only in `config/`. A test fails if one appears in `src/`, and another fails if anything other than `src/llm/ai-sdk-client.ts` imports a provider SDK.

## Development

```bash
npm install
npm test
npm run typecheck
```
