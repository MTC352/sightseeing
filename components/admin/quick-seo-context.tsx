"use client"

/**
 * Quick-SEO background engine.
 *
 * Mounted once in app/admin/layout.tsx (above the page tree) so a generation job
 * keeps running while the admin navigates between pages — Next's App Router keeps
 * the layout mounted across client-side navigation, so this provider's state
 * survives route changes (it does NOT survive a full browser reload — results are
 * intentionally "temporary", as specced).
 *
 * Flow per trip:
 *   idle → start(autosave) → POST /api/admin/seo-generate (status "running")
 *     → if autosave:   POST .../seo immediately            (status "accepted")
 *     → else:          hold AI fields for review            (status "ready")
 *   ready → accept()  → POST .../seo                        (status "accepted")
 *
 * The launcher button in the trip list reads each job's status to flip its label
 * ("SEO Optimize via AI" → "Generated SEO" warning). The Start + Review modals
 * and a small global notifier are rendered here so they can be opened from
 * anywhere (the row button or the notifier).
 */

import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  Sparkles, X, Check, Loader2, AlertTriangle, CheckCircle2, ListChecks,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  computeSeoSections, summarizeScore, scoreInputFromFields, stripHtml,
  type SeoFields,
} from "@/lib/seo/score"

export type QuickSeoStatus = "running" | "ready" | "saving" | "accepted" | "error"

export interface QuickSeoJob {
  tripId: string
  tripTitle: string
  tripImage: string
  autosave: boolean
  status: QuickSeoStatus
  fields?: SeoFields
  hasImage?: boolean
  score?: number
  error?: string
}

interface StartTarget {
  tripId: string
  tripTitle: string
  tripImage: string
}

interface QuickSeoContextValue {
  jobs: Record<string, QuickSeoJob>
  openStart: (t: StartTarget) => void
  openReview: (tripId: string) => void
  accept: (tripId: string) => void
  dismiss: (tripId: string) => void
}

const QuickSeoContext = createContext<QuickSeoContextValue | null>(null)

export function useQuickSeo(): QuickSeoContextValue {
  const ctx = useContext(QuickSeoContext)
  if (!ctx) throw new Error("useQuickSeo must be used within <QuickSeoProvider>")
  return ctx
}

export function QuickSeoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [jobs, setJobs] = useState<Record<string, QuickSeoJob>>({})
  const [startTarget, setStartTarget] = useState<StartTarget | null>(null)
  const [autosave, setAutosave] = useState(false)
  const [reviewId, setReviewId] = useState<string | null>(null)
  // Guard so a double-click / re-render never fires two generations for one trip.
  const inflight = useRef<Set<string>>(new Set())

  const patchJob = useCallback((tripId: string, patch: Partial<QuickSeoJob>) => {
    setJobs((prev) => {
      const existing = prev[tripId]
      if (!existing) return prev
      return { ...prev, [tripId]: { ...existing, ...patch } }
    })
  }, [])

  // POST the chosen fields to the import-safe SEO route.
  const persist = useCallback(async (tripId: string, fields: SeoFields): Promise<boolean> => {
    const res = await fetch(`/api/admin/trips/${tripId}/seo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `Save failed (${res.status})`)
    }
    const data = await res.json().catch(() => ({}))
    return typeof data?.score === "number" ? data.score : true
  }, [])

  const runGeneration = useCallback(async (job: QuickSeoJob) => {
    const { tripId } = job
    if (inflight.current.has(tripId)) return
    inflight.current.add(tripId)
    try {
      const res = await fetch("/api/admin/seo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to generate SEO suggestions.")
      const fields = data.fields as SeoFields
      const hasImage = !!data.hasImage

      if (job.autosave) {
        patchJob(tripId, { fields, hasImage, status: "saving" })
        const score = await persist(tripId, fields)
        patchJob(tripId, { status: "accepted", score: typeof score === "number" ? score : undefined })
        router.refresh()
      } else {
        patchJob(tripId, { fields, hasImage, status: "ready" })
      }
    } catch (e) {
      patchJob(tripId, { status: "error", error: e instanceof Error ? e.message : "Something went wrong." })
    } finally {
      inflight.current.delete(tripId)
    }
  }, [patchJob, persist, router])

  const openStart = useCallback((t: StartTarget) => {
    setAutosave(false) // default OFF every time the modal opens
    setStartTarget(t)
  }, [])

  const confirmStart = useCallback(() => {
    if (!startTarget) return
    const job: QuickSeoJob = {
      tripId: startTarget.tripId,
      tripTitle: startTarget.tripTitle,
      tripImage: startTarget.tripImage,
      autosave,
      status: "running",
    }
    setJobs((prev) => ({ ...prev, [job.tripId]: job }))
    setStartTarget(null)
    void runGeneration(job)
  }, [startTarget, autosave, runGeneration])

  const openReview = useCallback((tripId: string) => setReviewId(tripId), [])

  const accept = useCallback((tripId: string) => {
    const job = jobs[tripId]
    if (!job?.fields) return
    patchJob(tripId, { status: "saving" })
    ;(async () => {
      try {
        const score = await persist(tripId, job.fields as SeoFields)
        patchJob(tripId, { status: "accepted", score: typeof score === "number" ? score : undefined })
        setReviewId((cur) => (cur === tripId ? null : cur))
        router.refresh()
      } catch (e) {
        patchJob(tripId, { status: "ready", error: e instanceof Error ? e.message : "Save failed." })
      }
    })()
  }, [jobs, patchJob, persist, router])

  const dismiss = useCallback((tripId: string) => {
    setJobs((prev) => {
      const next = { ...prev }
      delete next[tripId]
      return next
    })
    setReviewId((cur) => (cur === tripId ? null : cur))
  }, [])

  const value = useMemo<QuickSeoContextValue>(
    () => ({ jobs, openStart, openReview, accept, dismiss }),
    [jobs, openStart, openReview, accept, dismiss],
  )

  const reviewJob = reviewId ? jobs[reviewId] : null

  return (
    <QuickSeoContext.Provider value={value}>
      {children}

      {startTarget && (
        <QuickSeoStartModal
          target={startTarget}
          autosave={autosave}
          onAutosaveChange={setAutosave}
          onCancel={() => setStartTarget(null)}
          onConfirm={confirmStart}
        />
      )}

      {reviewJob && reviewJob.fields && (
        <QuickSeoReviewModal
          job={reviewJob}
          onClose={() => setReviewId(null)}
          onAccept={() => accept(reviewJob.tripId)}
          onDiscard={() => dismiss(reviewJob.tripId)}
        />
      )}

      <QuickSeoNotifier jobs={jobs} onOpenReview={openReview} onDismiss={dismiss} />
    </QuickSeoContext.Provider>
  )
}

// ── Start modal (Trip Title above + autosave checkbox) ─────────────────────────

function QuickSeoStartModal({
  target, autosave, onAutosaveChange, onCancel, onConfirm,
}: {
  target: StartTarget
  autosave: boolean
  onAutosaveChange: (v: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Quick SEO Optimize</span>
            </div>
            {/* Trip title shown above the modal body so it's clear which trip is being optimised */}
            <h2 className="mt-1 truncate text-base font-semibold text-foreground" title={target.tripTitle}>
              {target.tripTitle}
            </h2>
          </div>
          <button onClick={onCancel} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground">
            The AI will pick a focus keyword and write optimised SEO for this trip.
            It runs in the background — you can keep working and come back when it&apos;s ready.
          </p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-3">
            <input
              type="checkbox"
              checked={autosave}
              onChange={(e) => onAutosaveChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground">Autosave generated SEO</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                Save the result automatically when generation finishes — no manual review.
                Leave off to review &amp; Accept yourself.
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Sparkles className="h-4 w-4" /> Generate
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Review modal (Trip Title above + generated SEO + Accept & Save) ────────────

const REVIEW_ROWS: { key: keyof SeoFields; label: string; html?: boolean; array?: boolean }[] = [
  { key: "seoKeyword", label: "Focus Keyword" },
  { key: "seoTitle", label: "SEO Title" },
  { key: "seoMetaDescription", label: "Meta Description" },
  { key: "seoSlug", label: "URL Slug" },
  { key: "seoHighlights", label: "Highlights", array: true },
  { key: "seoBody", label: "Body Content", html: true },
]

function QuickSeoReviewModal({
  job, onClose, onAccept, onDiscard,
}: {
  job: QuickSeoJob
  onClose: () => void
  onAccept: () => void
  onDiscard: () => void
}) {
  const fields = job.fields as SeoFields
  const projected = useMemo(
    () => summarizeScore(computeSeoSections(scoreInputFromFields(fields, job.tripImage))),
    [fields, job.tripImage],
  )
  const saving = job.status === "saving"

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Generated SEO — review</span>
            </div>
            {/* Trip title above the modal body */}
            <h2 className="mt-1 truncate text-base font-semibold text-foreground" title={job.tripTitle}>
              {job.tripTitle}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Projected</span>
              <span className={cn("rounded-full px-2 py-0.5 text-sm font-bold",
                projected.score >= 80 ? "bg-emerald-500/15 text-emerald-600" :
                projected.score >= 60 ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600")}>
                {projected.score}
              </span>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {!job.hasImage && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This trip has no image — two image checks stay unchecked, capping the score below 100.</span>
            </div>
          )}
          {REVIEW_ROWS.map((row) => {
            const v = fields[row.key]
            let text = ""
            if (row.array) text = Array.isArray(v) ? (v as string[]).join("\n") : ""
            else if (row.html) text = stripHtml(typeof v === "string" ? v : "")
            else text = typeof v === "string" ? v : ""
            return (
              <div key={row.key} className="rounded-xl border border-border">
                <div className="border-b border-border bg-secondary/30 px-3 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{row.label}</span>
                </div>
                <div className={cn("whitespace-pre-wrap break-words px-3 py-2 text-[12px] leading-relaxed text-foreground", row.html && "max-h-40 overflow-y-auto")}>
                  {text || <span className="italic opacity-60">— empty —</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-[12px] text-muted-foreground">
            {projected.passingCount}/{projected.totalCount} checks will pass · saved to import-safe SEO fields.
          </p>
          <div className="flex items-center gap-2">
            {job.error && <span className="text-[12px] text-red-500">{job.error}</span>}
            <button onClick={onDiscard} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60">
              Discard
            </button>
            <button onClick={onAccept} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Accept & Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Global notifier (so a finished background job is noticeable anywhere) ───────

function QuickSeoNotifier({
  jobs, onOpenReview, onDismiss,
}: {
  jobs: Record<string, QuickSeoJob>
  onOpenReview: (tripId: string) => void
  onDismiss: (tripId: string) => void
}) {
  const list = Object.values(jobs)
  if (list.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[55] flex w-72 flex-col gap-2">
      {list.map((job) => (
        <div
          key={job.tripId}
          className="pointer-events-auto overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <div className="flex items-start gap-2.5 px-3 py-2.5">
            <span className="mt-0.5 shrink-0">
              {job.status === "running" || job.status === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : job.status === "ready" ? (
                <ListChecks className="h-4 w-4 text-amber-500" />
              ) : job.status === "accepted" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground" title={job.tripTitle}>
                {job.tripTitle}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {job.status === "running" && "Generating SEO…"}
                {job.status === "saving" && "Saving SEO…"}
                {job.status === "ready" && "SEO ready — needs review"}
                {job.status === "accepted" && `SEO saved${typeof job.score === "number" ? ` · score ${job.score}` : ""}`}
                {job.status === "error" && (job.error || "Generation failed")}
              </p>
              {job.status === "ready" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => onOpenReview(job.tripId)}
                    className="rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
                  >
                    Review &amp; Save
                  </button>
                  <Link
                    href="/admin/trips"
                    className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Go to Trips
                  </Link>
                </div>
              )}
            </div>
            <button
              onClick={() => onDismiss(job.tripId)}
              disabled={job.status === "running" || job.status === "saving"}
              className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Dismiss"
              title={job.status === "running" || job.status === "saving" ? "Can't dismiss while in progress" : "Dismiss"}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
