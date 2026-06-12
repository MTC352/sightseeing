"use client"

/**
 * Trip-list SEO cell — renders the SEO status badge AND, for trips with no SEO
 * yet, a Quick-SEO launcher button whose label/colour reflects the background
 * job state (driven by <QuickSeoProvider>):
 *   - no job          → "SEO Optimize via AI"  (primary)
 *   - running/saving  → "Generating…"          (disabled)
 *   - ready (unsaved) → "Generated SEO"         (WARNING / amber — needs review)
 *   - error           → "Retry SEO"             (red)
 */

import { AlertTriangle, Sparkles, Loader2, ListChecks, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuickSeo } from "@/components/admin/quick-seo-context"

interface Props {
  tripId: string
  tripTitle: string
  tripImage: string
  optimized: boolean
  stale: boolean
  seoScore: number | null
}

export function TripSeoCell({ tripId, tripTitle, tripImage, optimized, stale, seoScore }: Props) {
  const { jobs, openStart, openReview } = useQuickSeo()
  const job = jobs[tripId]

  // Optimised trips just show their badge (Quick SEO is only for trips with none).
  if (optimized) {
    if (stale) {
      return (
        <span
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-semibold bg-amber-500/12 text-amber-600 ring-1 ring-inset ring-amber-500/20"
          title="Source content changed since last optimization — re-run the AI SEO optimizer"
        >
          <AlertTriangle className="h-2.5 w-2.5" /> SEO stale
        </span>
      )
    }
    return (
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset",
          seoScore != null && seoScore >= 80
            ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/20"
            : "bg-amber-500/12 text-amber-600 ring-amber-500/20",
        )}
        title="SEO optimised"
      >
        SEO {seoScore ?? "✓"}
      </span>
    )
  }

  // Not optimised → "No SEO" badge + the Quick-SEO launcher.
  const status = job?.status

  // Saved but the server list hasn't re-rendered yet (router.refresh() in flight).
  // Show a transient success chip instead of a contradictory "No SEO + no action".
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" /> SEO saved…
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-slate-400/10 text-slate-500 ring-1 ring-inset ring-slate-400/20"
        title="SEO not optimised yet"
      >
        No SEO
      </span>

      {(status === "running" || status === "saving") && (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
        >
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          {status === "saving" ? "Saving…" : "Generating…"}
        </button>
      )}

      {status === "ready" && (
        <button
          type="button"
          onClick={() => openReview(tripId)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-500/30 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
          title="AI-generated SEO is ready — review and Accept & Save"
        >
          <ListChecks className="h-2.5 w-2.5" /> Generated SEO
        </button>
      )}

      {status === "error" && (
        <button
          type="button"
          onClick={() => openStart({ tripId, tripTitle, tripImage })}
          className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-inset ring-red-500/30 transition-colors hover:bg-red-500/20"
          title={job?.error || "Generation failed — try again"}
        >
          <AlertTriangle className="h-2.5 w-2.5" /> Retry SEO
        </button>
      )}

      {!status && (
        <button
          type="button"
          onClick={() => openStart({ tripId, tripTitle, tripImage })}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-colors hover:bg-primary/20"
          title="Generate SEO with AI"
        >
          <Sparkles className="h-2.5 w-2.5" /> SEO Optimize via AI
        </button>
      )}
    </span>
  )
}
