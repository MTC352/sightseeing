"use client"

/**
 * Task #15 — shared helpers for the AI Systems admin screens.
 *
 * `useActiveAiProvider` reads the effective active provider from
 * /api/admin/settings (the same value resolveAi uses server-side) and exposes
 * the provider's model dropdown options. `ActiveProviderBadge` shows which
 * provider is currently powering every AI feature.
 */

import { useEffect, useState } from "react"
import { Bot } from "lucide-react"
import {
  type AiProvider,
  PROVIDER_LABELS,
  modelOptions,
} from "@/lib/ai/models"

export function useActiveAiProvider(): {
  provider: AiProvider
  models: { value: string; label: string }[]
  ready: boolean
} {
  const [provider, setProvider] = useState<AiProvider>("anthropic")
  // `ready` lets editor pages hold their skeleton until the active provider is
  // known, so the model dropdown never flashes the wrong provider's options.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .catch(() => null)
      .then((s) => {
        if (cancelled) return
        if (s?.aiProvider === "openai" || s?.aiProvider === "anthropic") {
          setProvider(s.aiProvider)
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { provider, models: modelOptions(provider), ready }
}

export function ActiveProviderBadge({ provider }: { provider: AiProvider }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
      <Bot className="h-3 w-3" />
      Active provider: {PROVIDER_LABELS[provider]}
    </span>
  )
}
