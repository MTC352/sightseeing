"use client"

/**
 * SEO Optimizer — RankMath Pro-style widget for the trip admin edit page.
 *
 * All 21 checks update live as the user edits any field in the form above.
 * Descriptions may be plain text OR HTML (rich text editor output) — the
 * optimizer strips HTML before counting words / checking keyword presence.
 */

import React, { useState, useMemo, useEffect } from "react"
import type { AdminTrip } from "@/lib/admin-store"
import {
  ChevronDown, ChevronUp, CheckCircle2, XCircle, HelpCircle, Eye, Edit3, Search,
  Sparkles, AlertTriangle, Loader2, Save, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  computeSeoSections, summarizeScore, computeStaleness, scoreInputFromFields,
  stripHtml, wordCount, countOccurrences, type SeoFields, type SeoSection,
} from "@/lib/seo/score"
import { SeoAiModal, type SeoAiModalCache } from "@/components/admin/seo-ai-modal"

// ── Pure helpers ──────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

// Friendly labels for the staleness badge's changed-source list.
const SOURCE_LABELS: Record<string, string> = {
  title: "Title", description: "Description", shortDescription: "Short description",
  longDescription: "Long description", highlights: "Highlights", included: "Includes",
  excluded: "Excludes", itinerary: "Itinerary", category: "Category", city: "City",
}

interface Props {
  tripData: Partial<AdminTrip>
  onApplyOptimization: (field: keyof AdminTrip, value: unknown) => void
}

// Which SEO checks each editable snippet field is responsible for. Used to show
// live, per-field suggestions in the snippet editor so the admin can see exactly
// which checks the field they're editing affects.
const FIELD_CHECK_IDS: Record<string, string[]> = {
  keyword: ["kw-set"],
  title: ["kw-in-title", "kw-at-title-start", "title-sentiment", "title-power-word", "title-number"],
  meta: ["kw-in-meta", "meta-length"],
  slug: ["kw-in-url", "url-length"],
  highlights: ["kw-in-headings", "toc"],
  body: ["kw-in-intro", "kw-in-content", "content-length", "keyword-density", "external-links", "dofollow-links", "internal-links", "short-paragraphs"],
}

// ── Tooltip copy ──────────────────────────────────────────────────────────────

const TOOLTIPS: Record<string, string> = {
  "kw-in-title":       "Search engines give extra weight to keywords in the title tag. Including your focus keyword signals relevance.",
  "kw-in-meta":        "The meta description appears in search results. Having your keyword helps searchers recognise your content as relevant.",
  "meta-length":       "Aim for a 120–160 character meta description — long enough to be descriptive, short enough that Google won't truncate it.",
  "kw-in-url":         "URLs with keywords are more readable and carry slight SEO weight. Use hyphens to separate words.",
  "kw-in-intro":       "Mentioning your keyword in the first 100 characters signals its importance to search engines.",
  "kw-in-content":     "Your focus keyword should appear naturally at least once throughout the body of your content.",
  "content-length":    "Longer, more comprehensive content tends to rank higher. Aim for 600 or more words.",
  "kw-in-headings":    "Keywords in subheadings (H2/H3) help search engines understand the structure of your content.",
  "image-alt":         "Alt text on images helps search engines index visual content and improves accessibility.",
  "keyword-density":   "Keyword density between 0.5–2.5% is ideal. Too little won't help; too much looks spammy.",
  "url-length":        "Short, descriptive URLs are easier to read, share, and understand by search engines.",
  "external-links":    "Linking to authoritative external sources adds credibility and helps search engines understand context.",
  "dofollow-links":    "DoFollow links pass link equity. Make sure your external links aren't set to nofollow unnecessarily.",
  "internal-links":    "Internal links help search engines discover more of your site and distribute link equity.",
  "kw-set":            "A focus keyword lets you target a specific search query and drives all keyword-based checks.",
  "kw-at-title-start": "Having your keyword at the beginning of the title gives it more SEO weight.",
  "title-sentiment":   "Emotional words (positive or negative) increase click-through rates from search results.",
  "title-power-word":  "Power words like 'Ultimate', 'Best', or 'Essential' make titles more compelling and clickable.",
  "title-number":      "Numbers in titles attract attention and suggest specific, structured content (e.g. 'Top 5 Spots').",
  "toc":               "Structured sections or a table of contents improve UX and help search engines understand hierarchy.",
  "short-paragraphs":  "Short paragraphs (3-4 sentences) are easier to read, especially on mobile, and improve engagement.",
  "rich-media":        "Images and videos improve engagement metrics which can positively impact search rankings.",
}

// ── Score colours ─────────────────────────────────────────────────────────────

function scoreColors(score: number) {
  if (score >= 80) return { text: "text-emerald-500", ring: "stroke-emerald-500", pill: "bg-emerald-500/10 text-emerald-600", label: "Good" }
  if (score >= 60) return { text: "text-amber-500",   ring: "stroke-amber-500",   pill: "bg-amber-500/10 text-amber-600",   label: "Needs Work" }
  return               { text: "text-red-500",     ring: "stroke-red-500",     pill: "bg-red-500/10 text-red-600",       label: "Poor" }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SEOOptimizer({ tripData, onApplyOptimization }: Props) {
  const permalink   = tripData.permalink ?? tripData.id ?? ""
  const image       = tripData.image ?? ""
  const url         = `https://sightseeing.lu/trip/${permalink}`

  // Local editable playground state. Seeds prefer the persisted seo_* columns,
  // then fall back to live form fields (so a never-optimised trip still scores).
  const [focusKeyword,  setFocusKeyword]  = useState(tripData.seoKeyword ?? "")
  const [seoTitle,      setSeoTitle]      = useState(tripData.seoTitle ?? tripData.title ?? "")
  const [metaDesc,      setMetaDesc]      = useState(tripData.seoMetaDescription ?? stripHtml(tripData.description ?? "").slice(0, 160))
  const [editSnippet,   setEditSnippet]   = useState(false)
  const [openSections,  setOpenSections]  = useState<Set<string>>(new Set(["basic"]))
  const [visibleTip,    setVisibleTip]    = useState<string | null>(null)
  const [showAiModal,   setShowAiModal]   = useState(false)
  // Persists the AI modal's generated session across open/close so reopening
  // shows the previous data instead of regenerating (until page refresh).
  const [aiModalCache,  setAiModalCache]  = useState<SeoAiModalCache | null>(null)

  // Manual snippet-editor save (persists to import-safe seo_* columns via /seo).
  const [savingSnippet, setSavingSnippet] = useState(false)
  const [snippetError,  setSnippetError]  = useState<string | null>(null)
  const [snippetSaved,  setSnippetSaved]  = useState(false)
  // SeoFields keys the admin has edited in the snippet editor — only these are
  // persisted, so untouched fields are never modified.
  const [dirty,         setDirty]         = useState<Set<keyof SeoFields>>(new Set())
  const markDirty = (k: keyof SeoFields) =>
    setDirty((prev) => (prev.has(k) ? prev : new Set(prev).add(k)))

  // Overlays — populated after an AI "Accept & Save All" so the widget reflects
  // the freshly-persisted SEO without a full page reload.
  const [bodyOverlay,       setBodyOverlay]       = useState<string | null>(tripData.seoBody ?? null)
  const [highlightsOverlay, setHighlightsOverlay] = useState<string[] | null>(tripData.seoHighlights ?? null)
  const [slugOverlay,       setSlugOverlay]       = useState<string | null>(tripData.seoSlug ?? null)
  const [optimizedOverlay,  setOptimizedOverlay]  = useState<string | null>(tripData.seoOptimizedAt ?? null)

  // Keep seoTitle synced with the form title ONLY when there's no persisted SEO
  // title yet (don't clobber an optimised title with the raw catalog one).
  useEffect(() => {
    if (!tripData.seoTitle && tripData.title && !editSnippet) setSeoTitle(tripData.title)
  }, [tripData.title, tripData.seoTitle, editSnippet])

  useEffect(() => {
    if (!tripData.seoMetaDescription && tripData.description && !editSnippet) {
      setMetaDesc(stripHtml(tripData.description).slice(0, 160))
    }
  }, [tripData.description, tripData.seoMetaDescription, editSnippet])

  // ── The field set currently being scored ──────────────────────────────────
  const liveFields: SeoFields = useMemo(() => ({
    seoKeyword: focusKeyword.trim(),
    seoTitle,
    seoMetaDescription: metaDesc,
    seoBody: bodyOverlay ?? tripData.seoBody ?? tripData.description ?? "",
    seoHighlights: highlightsOverlay ?? tripData.seoHighlights ?? tripData.highlights ?? [],
    seoSlug: slugOverlay ?? tripData.seoSlug ?? permalink,
  }), [focusKeyword, seoTitle, metaDesc, bodyOverlay, highlightsOverlay, slugOverlay,
       tripData.seoBody, tripData.description, tripData.seoHighlights, tripData.highlights,
       tripData.seoSlug, permalink])

  // Density read-out for the focus-keyword panel.
  const plainText = useMemo(() => stripHtml(liveFields.seoBody), [liveFields.seoBody])
  const words   = useMemo(() => wordCount(plainText), [plainText])
  const kwCount = useMemo(() => countOccurrences(plainText, focusKeyword.toLowerCase().trim()), [plainText, focusKeyword])
  const density = words > 0 ? (kwCount / words) * 100 : 0

  // ── All checks (recomputed instantly on any change) ───────────────────────
  const sections: SeoSection[] = useMemo(
    () => computeSeoSections(scoreInputFromFields(liveFields, image)),
    [liveFields, image],
  )
  const { passingCount, totalCount, score } = useMemo(() => summarizeScore(sections), [sections])

  // Flat check lookup so the snippet editor can show per-field suggestions.
  const checkById = useMemo(() => {
    const map: Record<string, { id: string; pass: boolean; message: string }> = {}
    for (const s of sections) for (const c of s.checks) map[c.id] = c
    return map
  }, [sections])

  // ── Staleness (source fields changed since last optimization) ─────────────
  const staleness = useMemo(
    () => computeStaleness({ ...tripData, seoOptimizedAt: optimizedOverlay ?? tripData.seoOptimizedAt } as Record<string, unknown>),
    [tripData, optimizedOverlay],
  )

  const colors       = scoreColors(score)
  const circleR      = 28
  const circleC      = 2 * Math.PI * circleR
  const strokeDash   = (score / 100) * circleC

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // Live per-field suggestions: the checks a given snippet field is responsible
  // for, with their current pass/fail state (updates as the admin edits).
  function FieldChecks({ field }: { field: keyof typeof FIELD_CHECK_IDS }) {
    const items = (FIELD_CHECK_IDS[field] ?? []).map((id) => checkById[id]).filter(Boolean)
    if (items.length === 0) return null
    return (
      <ul className="mt-1.5 space-y-1">
        {items.map((c) => (
          <li key={c.id} className="flex items-start gap-1.5 text-[10px] leading-snug">
            {c.pass
              ? <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-emerald-500" />
              : <XCircle className="mt-px h-3 w-3 shrink-0 text-amber-500" />}
            <span className={cn(c.pass
              ? "text-muted-foreground line-through decoration-muted-foreground/30"
              : "text-foreground")}>
              {c.message}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  // Persist ONLY the SEO snippet fields the admin actually edited to the
  // import-safe seo_* columns (partial merge on the server). Fields the admin
  // didn't touch keep their stored values — nothing else on the trip changes.
  async function handleSaveSnippet() {
    if (!tripData.id) return
    if (dirty.size === 0) {
      setSnippetError("No changes to save.")
      return
    }
    // Send ONLY the fields the admin edited; the server merges them over the
    // current stored SEO so untouched fields are never modified.
    const payload: Partial<SeoFields> = {}
    if (dirty.has("seoKeyword"))         payload.seoKeyword = liveFields.seoKeyword
    if (dirty.has("seoTitle"))           payload.seoTitle = liveFields.seoTitle
    if (dirty.has("seoMetaDescription")) payload.seoMetaDescription = liveFields.seoMetaDescription
    if (dirty.has("seoSlug"))            payload.seoSlug = liveFields.seoSlug
    if (dirty.has("seoHighlights"))      payload.seoHighlights = liveFields.seoHighlights
    if (dirty.has("seoBody"))            payload.seoBody = liveFields.seoBody

    setSavingSnippet(true)
    setSnippetError(null)
    try {
      const res = await fetch(`/api/admin/trips/${tripData.id}/seo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: payload, partial: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to save SEO.")
      const saved = (data.fields ?? liveFields) as SeoFields
      // Reflect the persisted (merged) values so the widget stays in sync without reload.
      setFocusKeyword(saved.seoKeyword ?? "")
      setSeoTitle(saved.seoTitle ?? "")
      setMetaDesc(saved.seoMetaDescription ?? "")
      setBodyOverlay(saved.seoBody ?? "")
      setHighlightsOverlay(saved.seoHighlights ?? [])
      setSlugOverlay(saved.seoSlug ?? "")
      setOptimizedOverlay(data.seoOptimizedAt ?? new Date().toISOString())
      setDirty(new Set())
      setSnippetSaved(true)
      window.setTimeout(() => setSnippetSaved(false), 2500)
    } catch (e) {
      setSnippetError(e instanceof Error ? e.message : "Failed to save SEO.")
    } finally {
      setSavingSnippet(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Header: score + label ───────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-border px-5 py-4">
        <div className="relative h-14 w-14 shrink-0">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={circleR} fill="none" strokeWidth="6" className="stroke-border" />
            <circle
              cx="32" cy="32" r={circleR} fill="none" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circleC}`}
              className={staleness.stale ? "stroke-amber-500" : colors.ring}
            />
          </svg>
          <span className={cn(
            "absolute inset-0 flex items-center justify-center text-xs font-bold",
            staleness.stale ? "text-amber-600 dark:text-amber-400" : colors.text,
          )}>
            {score}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">SEO Optimizer</h3>
          <p className="text-[11px] text-muted-foreground">
            {staleness.stale
              ? "Content changed since last optimization — re-run AI to refresh SEO text"
              : `${passingCount}/${totalCount} checks passing`}
          </p>
        </div>
        <span className={cn(
          "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
          staleness.stale ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : colors.pill,
        )}>
          {staleness.stale ? "Outdated" : colors.label}
        </span>
      </div>

      {/* ── AI Optimize CTA + staleness banner ───────────────────────────── */}
      <div className="border-b border-border bg-primary/5 px-5 py-4">
        {staleness.stale && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              SEO may be outdated — source content changed since the last optimization
              {staleness.changedFields.length > 0 && (
                <> ({staleness.changedFields.map((f) => SOURCE_LABELS[f] ?? f).join(", ")})</>
              )}. Re-run the AI optimizer to refresh.
            </span>
          </div>
        )}
        <button
          type="button"
          disabled={!tripData.id}
          onClick={() => setShowAiModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          Optimize SEO via AI
        </button>
        {staleness.optimized && tripData.seoOptimizedAt && !staleness.stale && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Last optimized {new Date(optimizedOverlay ?? tripData.seoOptimizedAt).toLocaleString()}
            {typeof tripData.seoScore === "number" && <> · saved score {tripData.seoScore}</>}
          </p>
        )}
      </div>

      {/* ── Focus Keyword (primary segment) ────────────────────────────── */}
      <div className="border-b border-border bg-secondary/20 px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Focus Keyword</span>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Set the primary keyword for this trip. All SEO checks below update live as you type here or edit the form content.
        </p>
        <input
          type="text"
          value={focusKeyword}
          onChange={(e) => setFocusKeyword(e.target.value)}
          placeholder="e.g. Luxembourg city tour"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {focusKeyword ? (
          <div className="mt-2 flex items-center gap-3 text-[10px]">
            <span className="text-muted-foreground">
              Density:{" "}
              <span className={cn("font-semibold", density >= 0.5 && density <= 2.5 ? "text-emerald-500" : "text-amber-500")}>
                {density.toFixed(1)}%
              </span>
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">
              {kwCount} occurrence{kwCount !== 1 ? "s" : ""} in {words} words
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn("font-semibold",
              density === 0 ? "text-red-400" :
              density >= 0.5 && density <= 2.5 ? "text-emerald-500" :
              density < 0.5 ? "text-amber-500" : "text-amber-500"
            )}>
              {density === 0 ? "Not found" : density >= 0.5 && density <= 2.5 ? "Good density" : density < 0.5 ? "Too low" : "Too high"}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-muted-foreground/60">
            Without a focus keyword, keyword-based checks will fail.
          </p>
        )}
      </div>

      {/* ── SERP Preview ────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</span>
          <button
            onClick={() => setEditSnippet((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary/60 transition-colors"
          >
            {editSnippet ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
            {editSnippet ? "Preview" : "Edit Snippet"}
          </button>
        </div>

        {!editSnippet ? (
          <div className="rounded-lg border border-border bg-white p-3 font-sans shadow-sm dark:bg-secondary/20">
            <p className="mb-0.5 truncate text-[11px] text-green-700 dark:text-green-400">{url}</p>
            <p className="text-sm font-medium leading-snug text-blue-700 dark:text-blue-400">
              {truncate(seoTitle || "Add a title…", 60)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-muted-foreground">
              {truncate(metaDesc || "Add a meta description…", 155)}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Edit any field below. The score and per-field suggestions update live, and
              <span className="font-medium text-foreground"> Save SEO</span> only changes the
              fields you touch — nothing else on the trip is modified.
            </p>

            {/* Focus Keyword */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Focus Keyword</label>
              <input
                type="text"
                value={focusKeyword}
                onChange={(e) => { setFocusKeyword(e.target.value); markDirty("seoKeyword") }}
                placeholder="e.g. luxembourg city tour"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="keyword" />
            </div>

            {/* SEO Title */}
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                SEO Title
                <span className={cn(seoTitle.length > 60 ? "text-red-500" : "text-muted-foreground")}>
                  {seoTitle.length}/60
                </span>
              </label>
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => { setSeoTitle(e.target.value); markDirty("seoTitle") }}
                placeholder="SEO title…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="title" />
            </div>

            {/* Meta Description */}
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                Meta Description
                <span className={cn(metaDesc.length < 120 || metaDesc.length > 160 ? "text-amber-500" : "text-emerald-500")}>
                  {metaDesc.length}/160
                </span>
              </label>
              <textarea
                rows={3}
                value={metaDesc}
                onChange={(e) => { setMetaDesc(e.target.value.slice(0, 160)); markDirty("seoMetaDescription") }}
                placeholder="Meta description (120–160 chars)…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="meta" />
            </div>

            {/* URL Slug */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">URL Slug</label>
              <input
                type="text"
                value={liveFields.seoSlug}
                onChange={(e) => { setSlugOverlay(e.target.value); markDirty("seoSlug") }}
                placeholder="url-slug"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="slug" />
            </div>

            {/* Highlights */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Highlights (one per line)</label>
              <textarea
                rows={4}
                value={liveFields.seoHighlights.join("\n")}
                onChange={(e) => { setHighlightsOverlay(e.target.value.split("\n").map((h) => h.replace(/^\s+/, ""))); markDirty("seoHighlights") }}
                placeholder={"Highlight one\nHighlight two\nHighlight three"}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="highlights" />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Body Content (HTML)</label>
              <textarea
                rows={6}
                value={liveFields.seoBody}
                onChange={(e) => { setBodyOverlay(e.target.value); markDirty("seoBody") }}
                placeholder="Body content…"
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <FieldChecks field="body" />
            </div>

            {snippetError && (
              <p className="flex items-center gap-1.5 rounded-md bg-red-100 px-2.5 py-1.5 text-[11px] font-medium text-red-600 dark:bg-red-500/15 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {snippetError}
              </p>
            )}

            <button
              onClick={handleSaveSnippet}
              disabled={savingSnippet || !tripData.id}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {savingSnippet
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : snippetSaved
                  ? <><Check className="h-3.5 w-3.5" /> Saved!</>
                  : <><Save className="h-3.5 w-3.5" /> Save SEO</>}
            </button>
          </div>
        )}
      </div>

      {/* ── Accordion sections ───────────────────────────────────────────── */}
      <div className="divide-y divide-border">
        {sections.map((section) => {
          const errors = section.checks.filter((c) => !c.pass).length
          const isOpen = openSections.has(section.id)

          return (
            <div key={section.id}>
              <button
                onClick={() => toggleSection(section.id)}
                className={cn(
                  "flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-secondary/40",
                  isOpen && "border-l-2 border-primary bg-primary/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{section.label}</span>
                  {errors > 0 ? (
                    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">
                      <XCircle className="h-3 w-3" />
                      {errors} {errors === 1 ? "Error" : "Errors"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      All Passed
                    </span>
                  )}
                </div>
                {isOpen
                  ? <ChevronUp   className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {isOpen && (
                <div className="bg-background px-5 pb-4 pt-2">
                  <div className="space-y-3.5">
                    {section.checks.map((check) => (
                      <div key={check.id} className="flex items-start gap-3">
                        {check.pass
                          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                          : <XCircle      className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}
                        <span className={cn(
                          "flex-1 text-[13px] leading-snug",
                          check.pass
                            ? "text-muted-foreground line-through decoration-muted-foreground/30"
                            : "text-foreground"
                        )}>
                          {check.message}
                        </span>
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setVisibleTip((t) => t === check.id ? null : check.id)}
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                          {visibleTip === check.id && (
                            <div className="absolute right-0 top-6 z-20 w-52 rounded-lg border border-border bg-popover p-2.5 shadow-lg">
                              <p className="text-[11px] leading-relaxed text-muted-foreground">
                                {TOOLTIPS[check.id] ?? "Improving this factor can help your content rank higher."}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showAiModal && tripData.id && (
        <SeoAiModal
          tripId={tripData.id}
          image={image}
          current={liveFields}
          cache={aiModalCache}
          onCache={setAiModalCache}
          onClose={() => setShowAiModal(false)}
          onSaved={(result) => {
            setFocusKeyword(result.fields.seoKeyword ?? "")
            setSeoTitle(result.fields.seoTitle ?? "")
            setMetaDesc(result.fields.seoMetaDescription ?? "")
            setBodyOverlay(result.fields.seoBody ?? "")
            setHighlightsOverlay(result.fields.seoHighlights ?? [])
            setSlugOverlay(result.fields.seoSlug ?? "")
            setOptimizedOverlay(result.seoOptimizedAt)
            setEditSnippet(true) // lock auto-sync so persisted SEO isn't overwritten by form fields
            setShowAiModal(false)
          }}
        />
      )}
    </div>
  )
}
