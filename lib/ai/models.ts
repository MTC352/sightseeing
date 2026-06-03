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
