"use client"

/**
 * SEO AI Optimizer modal.
 *
 * Calls POST /api/admin/seo-generate to get AI-suggested SEO fields, then shows
 * a 3-column comparison per field: Current | AI-Suggested (changed words
 * highlighted) | Manual input. The admin picks a source per field (default AI),
 * sees a live projected score, then "Accept & Save All" (POST .../seo) or
 * "Decline".
 */

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Sparkles, X, Check, AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  computeSeoSections,
  summarizeScore,
  scoreInputFromFields,
  type SeoFields,
} from "@/lib/seo/score"

type Choice = "current" | "ai" | "manual"

interface FieldDef {
  key: keyof SeoFields
  label: string
  multiline?: boolean
  array?: boolean
}

const FIELD_DEFS: FieldDef[] = [
  { key: "seoKeyword", label: "Focus Keyword" },
  { key: "seoTitle", label: "SEO Title" },
  { key: "seoMetaDescription", label: "Meta Description", multiline: true },
  { key: "seoSlug", label: "URL Slug" },
  { key: "seoHighlights", label: "Highlights (one per line)", multiline: true, array: true },
  { key: "seoBody", label: "Body Content (HTML)", multiline: true },
]

/**
 * A snapshot of a generated session, held by the PARENT so the modal can be
 * reopened with the previously-generated data (and the admin's per-field
 * choices / manual edits) instead of regenerating — until the page is refreshed
 * or the admin explicitly clicks "Regenerate".
 */
export interface SeoAiModalCache {
  ai: SeoFields
  hasImage: boolean
  choices: Record<string, Choice>
  manual: Record<string, string>
}

interface Props {
  tripId: string
  image: string
  current: SeoFields
  cache?: SeoAiModalCache | null
  onCache?: (cache: SeoAiModalCache | null) => void
  onClose: () => void
  onSaved: (result: { fields: SeoFields; score: number; seoOptimizedAt: string }) => void
}

// ── Word-level diff (LCS) for highlighting AI changes vs current ────────────────

function tokenize(s: string): string[] {
  return (s || "").split(/(\s+)/).filter((t) => t.length > 0)
}

interface DiffSeg {
  text: string
  added: boolean
}

function diffTokens(current: string, next: string): DiffSeg[] {
  const a = tokenize(current)
  const b = tokenize(next)
  const n = a.length
  const m = b.length
  // LCS table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const segs: DiffSeg[] = []
  let i = 0
  let j = 0
  const push = (text: string, added: boolean) => {
    const last = segs[segs.length - 1]
    if (last && last.added === added) last.text += text
    else segs.push({ text, added })
  }
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(b[j], false)
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++ // token removed from current — skip (we only show `next`)
    } else {
      push(b[j], true)
      j++
    }
  }
  while (j < m) {
    push(b[j], true)
    j++
  }
  return segs
}

function DiffView({ current, next }: { current: string; next: string }) {
  const segs = useMemo(() => diffTokens(current, next), [current, next])
  return (
    <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground">
      {segs.map((s, idx) =>
        s.added ? (
          <mark key={idx} className="rounded bg-emerald-200/70 px-0.5 text-emerald-950 dark:bg-emerald-500/30 dark:text-emerald-100">
            {s.text}
          </mark>
        ) : (
          <span key={idx}>{s.text}</span>
        ),
      )}
    </div>
  )
}

// ── Field value helpers ─────────────────────────────────────────────────────────

function fieldToText(def: FieldDef, fields: SeoFields): string {
  const v = fields[def.key]
  if (def.array) return Array.isArray(v) ? v.join("\n") : ""
  return typeof v === "string" ? v : ""
}

function textToField(def: FieldDef, text: string): string[] | string {
  if (def.array) return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  return text
}

export function SeoAiModal({ tripId, image, current, cache, onCache, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ai, setAi] = useState<SeoFields | null>(null)
  const [hasImage, setHasImage] = useState(!!image)
  const [saving, setSaving] = useState(false)

  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [manual, setManual] = useState<Record<string, string>>({})

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/seo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to generate SEO suggestions.")
      const aiFields = data.fields as SeoFields
      setAi(aiFields)
      setHasImage(!!data.hasImage)
      // Default every field to AI; seed manual inputs with the AI text.
      const initChoices: Record<string, Choice> = {}
      const initManual: Record<string, string> = {}
      for (const def of FIELD_DEFS) {
        initChoices[def.key] = "ai"
        initManual[def.key] = fieldToText(def, aiFields)
      }
      setChoices(initChoices)
      setManual(initManual)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  // On open: rehydrate the previously-generated session if one exists, otherwise
  // generate fresh. This makes reopening a closed modal show the same data.
  useEffect(() => {
    if (cache?.ai) {
      setAi(cache.ai)
      setHasImage(cache.hasImage)
      setChoices(cache.choices)
      setManual(cache.manual)
      setLoading(false)
    } else {
      generate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a live snapshot and flush it up to the parent when the modal closes
  // (unmounts), so a later reopen can rehydrate without regenerating.
  const snapshotRef = useRef<SeoAiModalCache | null>(cache ?? null)
  useEffect(() => {
    snapshotRef.current = ai ? { ai, hasImage, choices, manual } : null
  }, [ai, hasImage, choices, manual])
  useEffect(() => {
    return () => { onCache?.(snapshotRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the chosen field set from the per-field selections.
  const chosen: SeoFields = useMemo(() => {
    const out: SeoFields = {
      seoKeyword: current.seoKeyword,
      seoTitle: current.seoTitle,
      seoMetaDescription: current.seoMetaDescription,
      seoBody: current.seoBody,
      seoHighlights: current.seoHighlights,
      seoSlug: current.seoSlug,
    }
    for (const def of FIELD_DEFS) {
      const c = choices[def.key] ?? "ai"
      if (c === "current") continue
      if (c === "ai" && ai) {
        ;(out as unknown as Record<string, unknown>)[def.key] = ai[def.key]
      } else if (c === "manual") {
        ;(out as unknown as Record<string, unknown>)[def.key] = textToField(def, manual[def.key] ?? "")
      }
    }
    return out
  }, [choices, manual, ai, current])

  const currentScore = useMemo(
    () => summarizeScore(computeSeoSections(scoreInputFromFields(current, image))),
    [current, image],
  )
  const projected = useMemo(
    () => summarizeScore(computeSeoSections(scoreInputFromFields(chosen, image))),
    [chosen, image],
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/trips/${tripId}/seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: chosen }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to save SEO.")
      onSaved({ fields: data.fields ?? chosen, score: data.score, seoOptimizedAt: data.seoOptimizedAt })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">AI SEO Optimizer</h2>
          </div>
          <div className="flex items-center gap-4">
            {!loading && ai && (
              <button
                onClick={generate}
                disabled={saving}
                title="Discard these suggestions and generate fresh ones"
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </button>
            )}
            {!loading && ai && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold text-muted-foreground">{currentScore.score}</span>
                <span className="text-muted-foreground">→</span>
                <span className={cn("rounded-full px-2 py-0.5 text-sm font-bold",
                  projected.score >= 80 ? "bg-emerald-500/15 text-emerald-600" :
                  projected.score >= 60 ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600")}>
                  {projected.score}
                </span>
              </div>
            )}
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Picking a focus keyword and generating optimised SEO…</p>
            </div>
          )}

          {!loading && error && !ai && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
                <p className="text-sm">{error}</p>
              </div>
              <button onClick={generate} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </div>
          )}

          {!loading && ai && (
            <div className="space-y-5">
              {!hasImage && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This trip has no image. Two image-based checks (alt text & rich media) will stay unchecked, capping the score below 100 until you add one.</span>
                </div>
              )}

              {FIELD_DEFS.map((def) => {
                const currentText = fieldToText(def, current)
                const aiText = fieldToText(def, ai)
                const choice = choices[def.key] ?? "ai"
                return (
                  <div key={def.key} className="rounded-xl border border-border">
                    <div className="border-b border-border bg-secondary/30 px-4 py-2">
                      <span className="text-[12px] font-semibold uppercase tracking-wider text-foreground">{def.label}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
                      {/* Current */}
                      <label className={cn("flex cursor-pointer flex-col gap-2 bg-card p-3", choice === "current" && "ring-2 ring-inset ring-primary/60")}>
                        <div className="flex items-center gap-2">
                          <input type="radio" checked={choice === "current"} onChange={() => setChoices((p) => ({ ...p, [def.key]: "current" }))} />
                          <span className="text-[11px] font-semibold text-muted-foreground">Current</span>
                        </div>
                        <div className={cn("whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground", def.key === "seoBody" && "max-h-40 overflow-y-auto")}>
                          {currentText || <span className="italic opacity-60">— empty —</span>}
                        </div>
                      </label>

                      {/* AI suggested */}
                      <label className={cn("flex cursor-pointer flex-col gap-2 bg-card p-3", choice === "ai" && "ring-2 ring-inset ring-primary/60")}>
                        <div className="flex items-center gap-2">
                          <input type="radio" checked={choice === "ai"} onChange={() => setChoices((p) => ({ ...p, [def.key]: "ai" }))} />
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-primary"><Sparkles className="h-3 w-3" /> AI Suggested</span>
                        </div>
                        <div className={cn(def.key === "seoBody" && "max-h-40 overflow-y-auto")}>
                          <DiffView current={currentText} next={aiText} />
                        </div>
                      </label>

                      {/* Manual */}
                      <label className={cn("flex cursor-pointer flex-col gap-2 bg-card p-3", choice === "manual" && "ring-2 ring-inset ring-primary/60")}>
                        <div className="flex items-center gap-2">
                          <input type="radio" checked={choice === "manual"} onChange={() => setChoices((p) => ({ ...p, [def.key]: "manual" }))} />
                          <span className="text-[11px] font-semibold text-foreground">Manual</span>
                        </div>
                        {def.multiline ? (
                          <textarea
                            value={manual[def.key] ?? ""}
                            onChange={(e) => { setManual((p) => ({ ...p, [def.key]: e.target.value })); setChoices((p) => ({ ...p, [def.key]: "manual" })) }}
                            rows={def.key === "seoBody" ? 6 : 3}
                            className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground focus:border-primary/50 focus:outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={manual[def.key] ?? ""}
                            onChange={(e) => { setManual((p) => ({ ...p, [def.key]: e.target.value })); setChoices((p) => ({ ...p, [def.key]: "manual" })) }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-foreground focus:border-primary/50 focus:outline-none"
                          />
                        )}
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && ai && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <p className="text-[12px] text-muted-foreground">
              {projected.passingCount}/{projected.totalCount} checks will pass · saved to import-safe SEO fields (Palisis sync won't overwrite).
            </p>
            <div className="flex items-center gap-2">
              {error && <span className="text-[12px] text-red-500">{error}</span>}
              <button onClick={onClose} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60">
                Decline
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Saving…" : "Accept & Save All"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
