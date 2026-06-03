---
name: AI provider central resolver
description: How every AI feature picks provider+model (Anthropic vs OpenAI) through one resolver, and the model auto-remap-on-switch rule.
---

# AI provider central resolver

All server AI features resolve provider + model through ONE place: `resolveAi(...)`
in `lib/ai/provider.ts`. It returns `{ provider, model (LanguageModel | gateway
string | null), modelId, prefixedModelId, temperature, maxTokens, available,
usingGateway }`. `model === null` means no usable key → caller MUST fail-soft
(503 / SSE error / deterministic fallback). Never call `createAnthropic` /
`createOpenAI` directly in a route — go through `resolveAi`.

`lib/ai/models.ts` is the pure mapping layer (NO `process.env`, NO queries import,
client+server safe). Tier equivalence is fixed:
fast = Haiku ⇄ gpt-4o-mini, balanced = Sonnet ⇄ gpt-4o, best = Opus ⇄ gpt-4.1.

**Precedence contract (must stay in lockstep across `resolveAi`, `providerUsable`,
and the admin selector):** direct provider key FIRST — DB integration key
(`directKeyFor`, i.e. `apiKeys[provider]`) then env provider key — and the shared
`AI_GATEWAY_API_KEY` only as a LAST fallback. Never check the gateway before the
direct key: a stale/invalid gateway key must not override a valid direct key.

**Rule — provider switch auto-remaps stored models.** When the admin changes the
active provider (`integrations.ai_provider`), `dbUpdateApiKeys` detects the change
and calls `dbRemapAiModelsForProvider`, which rewrites every
`ai_system_configs.model` to the equivalent tier in the new provider via
`equivalentModel`. So a stored model id always belongs to the active provider.

**Why:** before this, each AI route resolved its own key/model and the env
Anthropic key is stale → intermittent 401s and provider drift. One resolver +
auto-remap keeps all surfaces consistent and switchable from a single admin
control.

**How to apply:**
- New AI feature: import `resolveAi`, pass `{ systemKey, storedModel, defaultTier,
  settings }`, branch on `model === null`.
- `dbGetSettings` exposes effective `aiProvider` (falls back to whichever provider
  has a key when unset) and raw `aiProviderSelected`. Admin UI badge reads
  `aiProvider`; the integrations selector writes `ai_provider` and only enables a
  provider whose key is saved (key-only, NOT gateway-based).
- AI Systems admin pages get model dropdown options from `modelOptions(provider)`
  via `useActiveAiProvider` (`components/admin/active-ai-provider.tsx`).
- EXCEPTION: blog cover-image generation stays OpenAI-only (DALL·E direct call) —
  do not route the image path through `resolveAi`. Blog *text* does use it.
