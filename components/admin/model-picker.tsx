"use client"

/**
 * Reusable admin model selector with a capability info card.
 *
 * Shows the per-model metadata an admin needs to choose well: context-window
 * size, max output tokens, an approximate conversation length, and a verdict on
 * whether the model is powerful enough for the given use-case (e.g. Trip Planner
 * chat or Itinerary building). Used on the planner-chat and itinerary admin pages.
 */

import { CheckCircle2, AlertTriangle, Gauge, Info } from "lucide-react"
import {
  type AiProvider,
  type AiUseCase,
  modelOptionsDetailed,
  modelMeta,
  capabilityFor,
  approxConversationTurns,
  formatTokens,
} from "@/lib/ai/models"

const VERDICT_STYLES: Record<
  "limited" | "good" | "great",
  { box: string; badge: string; Icon: typeof CheckCircle2 }
> = {
  great: {
    box: "border-emerald-500/25 bg-emerald-500/8",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  good: {
    box: "border-sky-500/25 bg-sky-500/8",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    Icon: Gauge,
  },
  limited: {
    box: "border-amber-500/30 bg-amber-500/8",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Icon: AlertTriangle,
  },
}

export function ModelPicker({
  value,
  onChange,
  provider,
  useCase,
  disabled,
  label = "Model",
}: {
  value: string
  onChange: (value: string) => void
  provider: AiProvider
  useCase: AiUseCase
  disabled?: boolean
  label?: string
}) {
  const options = modelOptionsDetailed(provider, useCase)
  const meta = modelMeta(value)
  const verdict = capabilityFor(value, useCase)
  const turns = approxConversationTurns(value)
  const style = VERDICT_STYLES[verdict.level]
  const Icon = style.Icon

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        disabled={disabled}
        data-testid="model-picker-select"
      >
        {options.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Capability info card */}
      <div className={`mt-3 rounded-lg border p-3.5 ${style.box}`}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Icon className="h-3.5 w-3.5" />
            Capability for {useCaseLabel(useCase)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
            {verdict.label}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="Context window" value={`${formatTokens(meta.contextWindow)} tokens`} />
          <Stat label="Max output" value={`${formatTokens(meta.maxOutput)} tokens`} />
          <Stat label="Approx. chat length" value={`~${turns.toLocaleString()} messages`} />
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {verdict.note} {meta.blurb}
          </span>
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function useCaseLabel(useCase: AiUseCase): string {
  switch (useCase) {
    case "planner-chat":
      return "Trip Planner chat"
    case "itinerary":
      return "Itinerary building"
    case "chat":
      return "Trip chat"
    default:
      return "this feature"
  }
}
