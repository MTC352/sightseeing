// Central AI provider resolver (Task #15). EVERY AI feature resolves its provider
// + concrete model through `resolveAi` so the admin's "active provider" choice is
// honored site-wide and fail-soft behavior stays consistent.
//
// Import graph: provider.ts → models.ts (pure) + queries.ts. queries.ts only
// imports models.ts (pure), so there is no cycle.

import type { LanguageModel } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { dbGetSettings } from "@/lib/db/queries"
import {
  type AiProvider,
  type EnvKeys,
  type ModelTier,
  TIER_MODELS,
  directKeyFor,
  effectiveProvider,
  tierOf,
} from "@/lib/ai/models"

type SettingsLike = Awaited<ReturnType<typeof dbGetSettings>>

export interface AiResolution {
  provider: AiProvider
  /** Ready to pass to streamText/generateText. Gateway → string id; direct →
   *  a provider model instance; `null` when no usable key (caller must fall back). */
  model: LanguageModel | null
  modelId: string
  prefixedModelId: string
  temperature?: number
  maxTokens?: number
  available: boolean
  usingGateway: boolean
}

function readEnv(): EnvKeys {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gateway: process.env.AI_GATEWAY_API_KEY,
  }
}

export interface ResolveAiOptions {
  /** AI System key (e.g. "chat", "planner", "outdoor_today", "blog"). Reads the
   *  stored model/temperature/maxTokens from settings.ai[systemKey]. */
  systemKey?: string
  /** Explicit stored model string, takes precedence over systemKey's model. */
  storedModel?: string | null
  /** Tier used when no stored model is found. */
  defaultTier?: ModelTier
  /** Pre-fetched settings to avoid a duplicate dbGetSettings round-trip. */
  settings?: SettingsLike
}

/**
 * Resolve the effective provider and a ready-to-use model for an AI feature.
 * The stored model only determines the TIER — the concrete model id always
 * belongs to the effective provider, so switching providers never leaves a
 * route pointing at a wrong-provider model id.
 */
export async function resolveAi(opts: ResolveAiOptions = {}): Promise<AiResolution> {
  const settings = opts.settings ?? (await dbGetSettings())
  const apiKeys = ((settings as { apiKeys?: Record<string, string> }).apiKeys ?? {}) as Record<string, string>
  const env = readEnv()
  const provider = effectiveProvider(apiKeys, env)

  let stored = opts.storedModel ?? undefined
  let temperature: number | undefined
  let maxTokens: number | undefined

  if (opts.systemKey) {
    const cfg = (settings.ai as Record<string, Record<string, unknown>> | undefined)?.[opts.systemKey]
    if (cfg) {
      if (!stored && typeof cfg.model === "string" && cfg.model) stored = cfg.model
      if (typeof cfg.temperature === "number") temperature = cfg.temperature
      if (typeof cfg.maxTokens === "number") maxTokens = cfg.maxTokens
    }
  }

  const tier: ModelTier = stored ? tierOf(stored) : (opts.defaultTier ?? "fast")
  const modelId = TIER_MODELS[provider][tier]
  const prefixedModelId = `${provider}/${modelId}`

  // Resolution waterfall (must match `providerUsable`): direct provider key
  // first — DB integration key, then env provider key — and only fall back to
  // the shared gateway when no direct key exists. A stale/invalid gateway key
  // must never override a valid direct provider key.
  const key = directKeyFor(provider, apiKeys, env)
  if (key) {
    const model: LanguageModel =
      provider === "anthropic"
        ? createAnthropic({ apiKey: key })(modelId)
        : createOpenAI({ apiKey: key })(modelId)

    return {
      provider,
      model,
      modelId,
      prefixedModelId,
      temperature,
      maxTokens,
      available: true,
      usingGateway: false,
    }
  }

  const gateway = (env.gateway ?? "").trim()
  if (gateway) {
    // Gateway accepts the prefixed string id and bills both providers.
    return {
      provider,
      model: prefixedModelId,
      modelId,
      prefixedModelId,
      temperature,
      maxTokens,
      available: true,
      usingGateway: true,
    }
  }

  return {
    provider,
    model: null,
    modelId,
    prefixedModelId,
    temperature,
    maxTokens,
    available: false,
    usingGateway: false,
  }
}

/** Lightweight effective-provider lookup for routes/UI that only need the name. */
export async function getEffectiveProvider(settings?: SettingsLike): Promise<AiProvider> {
  const s = settings ?? (await dbGetSettings())
  const apiKeys = ((s as { apiKeys?: Record<string, string> }).apiKeys ?? {}) as Record<string, string>
  return effectiveProvider(apiKeys, readEnv())
}
