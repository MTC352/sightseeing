"use client"

/**
 * Shared loading skeletons for the AI Systems admin editor pages.
 *
 * The editor pages fetch their saved prompt/model config on mount. Without a
 * skeleton they flash the built-in defaults for a moment and then snap to the
 * real saved values — a glitchy "blank → default → data" jump. These skeletons
 * are shown until BOTH the page's own config fetch AND the active-provider
 * lookup have settled, so the form only ever renders once with real data.
 */

import type { CSSProperties } from "react"

export function Shimmer({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse rounded-md bg-secondary ${className}`} style={style} />
}

/** Mimics a "System Prompt" card: label + revisions row, a textarea block, a hint line. */
export function PromptCardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-7 w-24" />
      </div>
      <Shimmer className="w-full" style={{ height: `${rows * 1.15}rem` }} />
      <Shimmer className="mt-2 h-3 w-40" />
    </div>
  )
}

/** Mimics the "Model Configuration" card: model select, temperature slider, max tokens. */
export function ModelCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-6 w-40 rounded-full" />
      </div>
      <div className="space-y-4">
        <div>
          <Shimmer className="mb-1.5 h-3 w-16" />
          <Shimmer className="h-10 w-full" />
        </div>
        <div>
          <Shimmer className="mb-1.5 h-3 w-28" />
          <Shimmer className="h-2 w-full" />
        </div>
        <div>
          <Shimmer className="mb-1.5 h-3 w-20" />
          <Shimmer className="h-10 w-full" />
        </div>
      </div>
    </div>
  )
}

/** Generic card with a title and N input-height rows. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Shimmer className="mb-4 h-4 w-40" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Page-level header skeleton (back button + eyebrow/title/subtitle + Save button). */
export function PageHeaderSkeleton({ withBack = true }: { withBack?: boolean }) {
  return (
    <div className="mb-8 flex items-start gap-4">
      {withBack && <Shimmer className="mt-0.5 h-8 w-8 shrink-0" />}
      <div className="flex-1">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="mt-2 h-7 w-56" />
        <Shimmer className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <Shimmer className="h-10 w-24 shrink-0" />
    </div>
  )
}

/**
 * Skeleton for the embedded AiSystemEditor body (no page padding / back button —
 * those belong to the wrapping route). Title + save row, one prompt card, one
 * model card.
 */
export function EditorBodySkeleton() {
  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <Shimmer className="h-6 w-48" />
          <Shimmer className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <Shimmer className="h-10 w-24 shrink-0" />
      </div>
      <div className="max-w-2xl space-y-6">
        <PromptCardSkeleton rows={8} />
        <ModelCardSkeleton />
      </div>
    </div>
  )
}
