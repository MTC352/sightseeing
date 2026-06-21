// Pure AI provider/model mapping. NO process.env, NO DB imports — safe to import
// from both client components (admin model dropdowns) and server code.
//
// Task #15: the platform supports two AI providers (Anthropic + OpenAI). Each AI
// System stores a model id; when the admin switches the active provider every
// stored model is auto-remapped to the equivalent tier of the new provider.

export type AiProvider = "anthropic" | "openai"
export type ModelTier = "fast" | "balanced" | "best"

export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai"]

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
}

// Tier → concrete bare model id per provider. The three tiers map across
// providers so a stored model can be translated to its equivalent on switch.
export const TIER_MODELS: Record<AiProvider, Record<ModelTier, string>> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    best: "claude-opus-4-7",
  },
  openai: {
    fast: "gpt-4o-mini",
    balanced: "gpt-4o",
    best: "gpt-4.1",
  },
}

export const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5 — fast",
  "claude-sonnet-4-6": "Claude Sonnet 4.6 — balanced",
  "claude-opus-4-7": "Claude Opus 4.7 — best quality",
  "gpt-4o-mini": "GPT-4o mini — fast",
  "gpt-4o": "GPT-4o — balanced",
  "gpt-4.1": "GPT-4.1 — best quality",
}

const TIER_ORDER: ModelTier[] = ["fast", "balanced", "best"]

/** Strip a leading "anthropic/" or "openai/" gateway prefix from a model id. */
export function stripProviderPrefix(model: string): string {
  if (!model) return ""
  const i = model.indexOf("/")
  return i >= 0 ? model.slice(i + 1) : model
}

/** Best-effort detection of which provider a stored model id belongs to. */
export function providerOf(model: string): AiProvider | null {
  const m = (model || "").toLowerCase()
  if (m.startsWith("anthropic/") || m.includes("claude")) return "anthropic"
  if (
    m.startsWith("openai/") ||
    m.includes("gpt") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  ) {
    return "openai"
  }
  return null
}

/** Classify any (prefixed or bare) model id into a capability tier. */
export function tierOf(model: string): ModelTier {
  const m = stripProviderPrefix(model).toLowerCase()
  // fast first — "gpt-4o-mini" also contains "gpt-4o", so "mini" must win.
  if (m.includes("haiku") || m.includes("mini")) return "fast"
  if (
    m.includes("opus") ||
    m.includes("gpt-4.1") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  ) {
    return "best"
  }
  if (m.includes("sonnet") || m.includes("gpt-4o") || m.includes("gpt-4")) return "balanced"
  return "fast"
}

/** Bare model id for `target` provider equivalent to the given model. */
export function equivalentModelId(model: string, target: AiProvider): string {
  return TIER_MODELS[target][tierOf(model)]
}

/** Prefixed (`provider/id`) equivalent model for `target` provider. */
export function equivalentModel(model: string, target: AiProvider): string {
  return `${target}/${equivalentModelId(model, target)}`
}

/** Prefixed dropdown options for a provider, ordered fast → best. */
export function modelOptions(provider: AiProvider): { value: string; label: string }[] {
  return TIER_ORDER.map((tier) => {
    const id = TIER_MODELS[provider][tier]
    return { value: `${provider}/${id}`, label: MODEL_LABELS[id] ?? id }
  })
}

/** The provider the admin explicitly selected (raw, defaults to anthropic). */
export function selectedProvider(apiKeys: Record<string, string | undefined> | undefined): AiProvider {
  return apiKeys?.["ai_provider"] === "openai" ? "openai" : "anthropic"
}

export interface EnvKeys {
  anthropic?: string
  openai?: string
  gateway?: string
}

/** Resolve the usable direct API key for a provider: DB key first, env fallback. */
export function directKeyFor(
  provider: AiProvider,
  apiKeys: Record<string, string | undefined> | undefined,
  env: EnvKeys,
): string {
  const dbKey = (apiKeys?.[provider] ?? "").trim()
  if (dbKey) return dbKey
  return ((provider === "anthropic" ? env.anthropic : env.openai) ?? "").trim()
}

/** True when a provider has a usable key (direct or via the shared gateway). */
export function providerUsable(
  provider: AiProvider,
  apiKeys: Record<string, string | undefined> | undefined,
  env: EnvKeys,
): boolean {
  if (directKeyFor(provider, apiKeys, env)) return true
  return !!(env.gateway ?? "").trim()
}

/**
 * The provider actually used at runtime: the selected one if usable, else the
 * other usable provider, else the selected one (which will report unavailable).
 */
export function effectiveProvider(
  apiKeys: Record<string, string | undefined> | undefined,
  env: EnvKeys,
): AiProvider {
  const selected = selectedProvider(apiKeys)
  if (providerUsable(selected, apiKeys, env)) return selected
  const other: AiProvider = selected === "anthropic" ? "openai" : "anthropic"
  if (providerUsable(other, apiKeys, env)) return other
  return selected
}

// ---------------------------------------------------------------------------
// Model capability metadata + capability verdicts
//
// Drives the admin "model selection" UI: each model exposes its context window,
// max output tokens, and a short blurb. `capabilityFor(model, useCase)` turns a
// model + use-case into a plain-language verdict so an admin can tell at a glance
// whether the model they picked is powerful enough for, say, the Trip Planner
// chat or the Itinerary builder (both of which inject a lot of trip context).
//
// Numbers are approximate and meant for admin guidance, not billing accuracy.
// ---------------------------------------------------------------------------

export interface ModelMeta {
  tier: ModelTier
  /** Approx max input context window, in tokens. */
  contextWindow: number
  /** Approx max output tokens per response. */
  maxOutput: number
  /** Short admin-facing description of the model's strengths. */
  blurb: string
}

/** Per-model capability metadata, keyed by BARE model id (no provider prefix). */
export const MODEL_META: Record<string, ModelMeta> = {
  // OpenAI
  "gpt-4o-mini": {
    tier: "fast",
    contextWindow: 128_000,
    maxOutput: 16_384,
    blurb: "Fast and economical. Great for short Q&A and lightweight chat, but has the lowest rate limits.",
  },
  "gpt-4o": {
    tier: "balanced",
    contextWindow: 128_000,
    maxOutput: 16_384,
    blurb: "Strong all-rounder. Handles multi-turn planning and the full trip menu comfortably.",
  },
  "gpt-4.1": {
    tier: "best",
    contextWindow: 1_047_576,
    maxOutput: 32_768,
    blurb: "Largest context and deepest reasoning. Ideal for itinerary building over every trip's details.",
  },
  // Anthropic
  "claude-haiku-4-5-20251001": {
    tier: "fast",
    contextWindow: 200_000,
    maxOutput: 8_192,
    blurb: "Fast, low-cost Claude. Good for short chats; lighter on deep analysis.",
  },
  "claude-sonnet-4-6": {
    tier: "balanced",
    contextWindow: 200_000,
    maxOutput: 16_384,
    blurb: "Balanced Claude. Reliable for planning conversations and itinerary work.",
  },
  "claude-opus-4-7": {
    tier: "best",
    contextWindow: 200_000,
    maxOutput: 32_000,
    blurb: "Most capable Claude. Best for the richest context and the most demanding analysis.",
  },
}

/** Capability metadata for any (prefixed or bare) model id. Falls back to a
 *  tier-derived estimate for ids not in the catalog so the UI never breaks. */
export function modelMeta(model: string): ModelMeta {
  const bare = stripProviderPrefix(model)
  const hit = MODEL_META[bare]
  if (hit) return hit
  // Unknown id — synthesise a conservative estimate from its tier.
  const tier = tierOf(model)
  const byTier: Record<ModelTier, ModelMeta> = {
    fast: { tier: "fast", contextWindow: 128_000, maxOutput: 8_192, blurb: "Fast, lightweight model." },
    balanced: { tier: "balanced", contextWindow: 128_000, maxOutput: 16_384, blurb: "Balanced general-purpose model." },
    best: { tier: "best", contextWindow: 200_000, maxOutput: 32_000, blurb: "High-capability model." },
  }
  return byTier[tier]
}

export type AiUseCase = "planner-chat" | "itinerary" | "chat" | "general"

export const USE_CASE_LABELS: Record<AiUseCase, string> = {
  "planner-chat": "Trip Planner chat",
  itinerary: "Itinerary building",
  chat: "Trip chat",
  general: "this feature",
}

/** Minimum tier each use-case really needs to behave well. The planner chat and
 *  the itinerary builder both inject a lot of live trip context + tools, so they
 *  want at least the balanced tier; lighter features are fine on the fast tier. */
export const USE_CASE_MIN_TIER: Record<AiUseCase, ModelTier> = {
  "planner-chat": "balanced",
  itinerary: "balanced",
  chat: "fast",
  general: "fast",
}

export type CapabilityLevel = "limited" | "good" | "great"

export interface CapabilityVerdict {
  level: CapabilityLevel
  /** Short badge label, e.g. "Recommended". */
  label: string
  /** One-line plain-language explanation for the admin. */
  note: string
}

/** Verdict on whether `model` is powerful enough for `useCase`. */
export function capabilityFor(model: string, useCase: AiUseCase): CapabilityVerdict {
  const tier = tierOf(model)
  const min = USE_CASE_MIN_TIER[useCase]
  const rank = TIER_ORDER.indexOf(tier)
  const minRank = TIER_ORDER.indexOf(min)
  const what = USE_CASE_LABELS[useCase]
  const heavy = useCase === "planner-chat" || useCase === "itinerary"
  if (rank < minRank) {
    return {
      level: "limited",
      label: "Under-powered",
      note: heavy
        ? `May hit rate limits and truncate trip context during ${what}. Better suited to short Q&A — consider a balanced or best model.`
        : `Below the recommended capability for ${what}.`,
    }
  }
  if (rank === minRank) {
    return {
      level: "good",
      label: "Capable",
      note: heavy
        ? `Handles ${what} well — comfortably fits the full trip menu and multi-turn conversations.`
        : `Capable for ${what}.`,
    }
  }
  return {
    level: "great",
    label: "Recommended",
    note: heavy
      ? `Ideal for ${what} — the largest context for every trip's details plus deeper analysis.`
      : `More than enough capability for ${what}.`,
  }
}

/** Human-readable token count, e.g. 128000 → "128K", 1047576 → "1M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 || Number.isInteger(m) ? Math.round(m) : m.toFixed(1)}M`
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/** Rough number of back-and-forth chat exchanges a model's context can hold.
 *  Assumes ~1,200 tokens per exchange (prompt history grows each turn) and only
 *  uses ~70% of the window to leave room for the system prompt + tools. */
export function approxConversationTurns(model: string): number {
  const { contextWindow } = modelMeta(model)
  return Math.max(1, Math.floor((contextWindow * 0.7) / 1_200))
}

/** Prefixed dropdown options for a provider, enriched with capability metadata
 *  and a verdict for the given use-case. Ordered fast → best. */
export function modelOptionsDetailed(
  provider: AiProvider,
  useCase: AiUseCase,
): { value: string; label: string; meta: ModelMeta; capability: CapabilityVerdict }[] {
  return TIER_ORDER.map((tier) => {
    const id = TIER_MODELS[provider][tier]
    const value = `${provider}/${id}`
    return {
      value,
      label: MODEL_LABELS[id] ?? id,
      meta: modelMeta(id),
      capability: capabilityFor(value, useCase),
    }
  })
}
