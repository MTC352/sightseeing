"use client"

/**
 * SEO Optimizer — RankMath Pro-style widget for the trip admin edit page.
 *
 * Features:
 *   • SERP preview (Google-style URL / title / description)
 *   • Edit Snippet panel (editable SEO title + meta description)
 *   • Focus Keyword input — drives all keyword-based checks live
 *   • Overall SEO score with circular gauge
 *   • 4 accordion sections: Basic SEO · Additional · Title Readability · Content Readability
 *   • Every check: ✓ green pass / ✗ red error icon + help tooltip
 *   • "Fix with AI" badge for AI-fixable checks → calls /api/admin/seo-fix
 */

import React, { useState, useMemo, useCallback, useEffect } from "react"
import type { AdminTrip } from "@/lib/admin-store"
import {
  ChevronDown, ChevronUp, CheckCircle2, XCircle, HelpCircle,
  Sparkles, Loader2, Eye, Edit3,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Word lists ────────────────────────────────────────────────────────────────

const POWER_WORDS = new Set([
  "ultimate", "proven", "powerful", "essential", "best", "top", "complete",
  "definitive", "comprehensive", "exclusive", "premium", "incredible", "master",
  "revolutionary", "effective", "expert", "leading", "premier", "outstanding",
  "remarkable", "exceptional", "unbeatable", "advanced", "professional",
])

const SENTIMENT_WORDS = new Set([
  "beautiful", "stunning", "breathtaking", "unforgettable", "incredible", "amazing",
  "wonderful", "magnificent", "spectacular", "unique", "exciting", "thrilling",
  "fascinating", "charming", "lovely", "exceptional", "extraordinary", "outstanding",
  "superb", "fantastic", "perfect", "delightful", "remarkable", "memorable",
  "scenic", "authentic", "iconic", "vibrant", "magical",
])

// ── Pure helpers ──────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length
}

function countOccurrences(text: string, kw: string): number {
  if (!kw || !text) return 0
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
  return (text.match(re) ?? []).length
}

function hasWordFrom(text: string, words: Set<string>): boolean {
  const lower = text.toLowerCase()
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`).test(lower)) return true
  }
  return false
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Check {
  id: string
  pass: boolean
  message: string
  aiFixable?: boolean
  fixType?: string
}

interface SectionDef {
  id: string
  label: string
  checks: Check[]
}

interface Props {
  tripData: Partial<AdminTrip>
  onApplyOptimization: (field: keyof AdminTrip, value: unknown) => void
}

// ── Tooltip copy ──────────────────────────────────────────────────────────────

const TOOLTIPS: Record<string, string> = {
  "kw-in-title":      "Search engines give extra weight to keywords in the title tag. Including your focus keyword signals relevance.",
  "kw-in-meta":       "The meta description appears in search results. Having your keyword helps searchers recognise your content as relevant.",
  "kw-in-url":        "URLs with keywords are more readable and carry slight SEO weight. Use hyphens to separate words.",
  "kw-in-intro":      "Mentioning your keyword in the first 100 characters signals its importance to search engines.",
  "kw-in-content":    "Your focus keyword should appear naturally at least once throughout the body of your content.",
  "content-length":   "Longer, more comprehensive content tends to rank higher. Aim for 600 or more words.",
  "kw-in-headings":   "Keywords in subheadings (H2/H3) help search engines understand the structure of your content.",
  "image-alt":        "Alt text on images helps search engines index visual content and improves accessibility.",
  "keyword-density":  "Keyword density between 0.5–2.5% is ideal. Too little won't help; too much looks spammy.",
  "url-length":       "Short, descriptive URLs are easier to read, share, and understand by search engines.",
  "external-links":   "Linking to authoritative external sources adds credibility and helps search engines understand context.",
  "dofollow-links":   "DoFollow links pass link equity. Make sure your external links aren't set to nofollow unnecessarily.",
  "internal-links":   "Internal links help search engines discover more of your site and distribute link equity.",
  "kw-set":           "A focus keyword lets you target a specific search query and drives all keyword-based checks.",
  "kw-at-title-start":"Having your keyword at the beginning of the title gives it more SEO weight.",
  "title-sentiment":  "Emotional words (positive or negative) increase click-through rates from search results.",
  "title-power-word": "Power words like 'Ultimate', 'Best', or 'Essential' make titles more compelling and clickable.",
  "title-number":     "Numbers in titles attract attention and suggest specific, structured content (e.g. 'Top 5 Spots').",
  "toc":              "Structured sections or a table of contents improve UX and help search engines understand hierarchy.",
  "short-paragraphs": "Short paragraphs (3-4 sentences) are easier to read, especially on mobile, and improve engagement.",
  "rich-media":       "Images and videos improve engagement metrics which can positively impact search rankings.",
}

// ── Score colours ─────────────────────────────────────────────────────────────

function scoreColors(score: number) {
  if (score >= 80) return { text: "text-emerald-500", ring: "stroke-emerald-500", pill: "bg-emerald-500/10 text-emerald-600", label: "Good" }
  if (score >= 60) return { text: "text-amber-500",  ring: "stroke-amber-500",  pill: "bg-amber-500/10 text-amber-600",   label: "Needs Work" }
  return              { text: "text-red-500",    ring: "stroke-red-500",    pill: "bg-red-500/10 text-red-600",       label: "Poor" }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SEOOptimizer({ tripData, onApplyOptimization }: Props) {
  const [focusKeyword, setFocusKeyword] = useState("")
  const [seoTitle,    setSeoTitle]    = useState(tripData.title ?? "")
  const [metaDesc,    setMetaDesc]    = useState((tripData.description ?? "").slice(0, 160))
  const [editSnippet, setEditSnippet] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["basic"]))
  const [aiLoading,  setAiLoading]   = useState<string | null>(null)
  const [aiError,    setAiError]     = useState<string | null>(null)
  const [visibleTip, setVisibleTip]  = useState<string | null>(null)

  useEffect(() => {
    if (tripData.title && !editSnippet) setSeoTitle(tripData.title)
  }, [tripData.title, editSnippet])

  // ── Derived values ──────────────────────────────────────────────────────────
  const kw          = focusKeyword.toLowerCase().trim()
  const permalink   = tripData.permalink ?? tripData.id ?? ""
  const description = tripData.description ?? ""
  const image       = tripData.image ?? ""
  const highlights  = tripData.highlights ?? []
  const url         = `https://sightseeing.lu/trip/${permalink}`

  const words   = useMemo(() => wordCount(description), [description])
  const kwCount = useMemo(() => countOccurrences(description, kw), [description, kw])
  const density = words > 0 ? (kwCount / words) * 100 : 0

  // ── Build all checks ────────────────────────────────────────────────────────
  const sections: SectionDef[] = useMemo(() => {
    const tl = seoTitle.toLowerCase()
    const dl = description.toLowerCase()
    const ml = metaDesc.toLowerCase()
    const pl = permalink.toLowerCase()

    const basic: Check[] = [
      { id: "kw-in-title",   pass: !!kw && tl.includes(kw),                                                          message: "Add Focus Keyword to the SEO title." },
      { id: "kw-in-meta",    pass: !!kw && ml.includes(kw),                                                          message: "Add Focus Keyword to your SEO Meta Description." },
      { id: "kw-in-url",     pass: !!kw && pl.includes(kw.replace(/\s+/g, "-")),                                     message: "Use Focus Keyword in the URL." },
      { id: "kw-in-intro",   pass: !!kw && dl.slice(0, 100).includes(kw),                                            message: "Use Focus Keyword at the beginning of your content." },
      { id: "kw-in-content", pass: !!kw && dl.includes(kw),                                                          message: "Use Focus Keyword in the content." },
      { id: "content-length",pass: words >= 600,  aiFixable: words < 600, fixType: "content-expand",
        message: `Content is ${words} words long. Consider using at least 600 words.` },
    ]

    const additional: Check[] = [
      { id: "kw-in-headings",  pass: !!kw && highlights.some((h) => h.toLowerCase().includes(kw)),                   message: "Use Focus Keyword in subheadings like H2, H3, H4, etc." },
      { id: "image-alt",       pass: !!image,                                                                         message: "Add an image with your Focus Keyword as alt text." },
      { id: "keyword-density", pass: !!kw && density >= 0.5 && density <= 2.5,
        message: `Keyword Density is ${density.toFixed(1)}%. Aim for around 1% Keyword Density.` },
      { id: "url-length",      pass: permalink.length > 0 && permalink.length <= 75,
        message: permalink.length <= 75 ? `URL is ${permalink.length} characters long. Kudos!` : `URL is ${permalink.length} characters long. Consider shortening it.` },
      { id: "external-links",  pass: /https?:\/\/[^s]/.test(description),                                            message: "Link out to external resources." },
      { id: "dofollow-links",  pass: /https?:\/\/[^s]/.test(description),                                            message: "Add DoFollow links pointing to external resources." },
      { id: "internal-links",  pass: /\/(trip|blog|explore|departures|help)\//.test(description),                    message: "Add internal links in your content." },
      { id: "kw-set",          pass: !!kw,                                                                            message: "Set a Focus Keyword for this content." },
    ]

    const titleReadability: Check[] = [
      { id: "kw-at-title-start", pass: !!kw && (tl.startsWith(kw) || tl.indexOf(kw) < Math.ceil(tl.length / 2)),   message: "Use the Focus Keyword near the beginning of SEO title." },
      { id: "title-sentiment",   pass: hasWordFrom(seoTitle, SENTIMENT_WORDS), aiFixable: true, fixType: "title-sentiment",
        message: "Your title doesn't contain a positive or a negative sentiment word." },
      { id: "title-power-word",  pass: hasWordFrom(seoTitle, POWER_WORDS),    aiFixable: true, fixType: "title-power-word",
        message: "Your title doesn't contain a power word. Add at least one." },
      { id: "title-number",      pass: /\d/.test(seoTitle),                   aiFixable: true, fixType: "title-number",
        message: "Your SEO title doesn't contain a number." },
    ]

    const contentReadability: Check[] = [
      { id: "toc",             pass: highlights.length >= 3,                                                          message: "You don't seem to be using a Table of Contents plugin." },
      { id: "short-paragraphs",
        pass: !description.split(/\n\n+/).some((p) => wordCount(p) > 100),
        aiFixable: description.split(/\n\n+/).some((p) => wordCount(p) > 100), fixType: "short-paragraphs",
        message: "At least one paragraph is long. Consider using short paragraphs." },
      { id: "rich-media",      pass: !!image,                                                                         message: "You are not using rich media like images or videos." },
    ]

    return [
      { id: "basic",      label: "Basic SEO",           checks: basic },
      { id: "additional", label: "Additional",           checks: additional },
      { id: "title",      label: "Title Readability",    checks: titleReadability },
      { id: "content",    label: "Content Readability",  checks: contentReadability },
    ]
  }, [kw, seoTitle, metaDesc, description, permalink, image, highlights, words, density])

  // ── Score ──────────────────────────────────────────────────────────────────
  const allChecks    = sections.flatMap((s) => s.checks)
  const passingCount = allChecks.filter((c) => c.pass).length
  const totalCount   = allChecks.length
  const score        = totalCount > 0 ? Math.round((passingCount / totalCount) * 100) : 0
  const colors       = scoreColors(score)
  const circleR      = 28
  const circleC      = 2 * Math.PI * circleR
  const strokeDash   = (score / 100) * circleC

  // ── AI fix ─────────────────────────────────────────────────────────────────
  const fixWithAI = useCallback(async (fixType: string) => {
    setAiLoading(fixType)
    setAiError(null)
    try {
      const currentValue =
        fixType.startsWith("title")      ? seoTitle :
        fixType === "meta-description"   ? metaDesc :
                                           description

      const res = await fetch("/api/admin/seo-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixType, currentValue, focusKeyword,
          tripData: { title: seoTitle, description, category: tripData.category, city: tripData.city },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "AI request failed")
      if (!data.result) throw new Error("No result from AI")

      if (fixType.startsWith("title")) {
        setSeoTitle(data.result)
        onApplyOptimization("title", data.result)
      } else if (fixType === "meta-description") {
        setMetaDesc(data.result.slice(0, 160))
      } else {
        onApplyOptimization("description", data.result)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed")
      setTimeout(() => setAiError(null), 4000)
    } finally {
      setAiLoading(null)
    }
  }, [seoTitle, metaDesc, description, focusKeyword, tripData.category, tripData.city, onApplyOptimization])

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">

      {/* ── Header: score + title ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-border px-5 py-4">
        {/* Circular gauge */}
        <div className="relative h-14 w-14 shrink-0">
          <svg className="h-14 w-14 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={circleR} fill="none" strokeWidth="6" className="stroke-border" />
            <circle
              cx="32" cy="32" r={circleR} fill="none" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circleC}`}
              className={colors.ring}
            />
          </svg>
          <span className={cn("absolute inset-0 flex items-center justify-center text-xs font-bold", colors.text)}>
            {score}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">SEO Optimizer</h3>
          <p className="text-[11px] text-muted-foreground">{passingCount}/{totalCount} checks passing</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", colors.pill)}>
          {colors.label}
        </span>
      </div>

      {/* ── AI error toast ────────────────────────────────────────────────── */}
      {aiError && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-2.5 text-xs text-destructive">
          {aiError}
        </div>
      )}

      {/* ── SERP preview ─────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</span>
          <div className="flex gap-2">
            <button
              onClick={() => setEditSnippet((v) => !v)}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary/60 transition-colors"
            >
              {editSnippet ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
              {editSnippet ? "Preview" : "Edit Snippet"}
            </button>
          </div>
        </div>

        {!editSnippet ? (
          /* Google-style SERP card */
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
          /* Snippet editor */
          <div className="space-y-3">
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
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="SEO title…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                Meta Description
                <span className={cn(metaDesc.length > 160 ? "text-red-500" : "text-muted-foreground")}>
                  {metaDesc.length}/160
                </span>
              </label>
              <textarea
                rows={3}
                value={metaDesc}
                onChange={(e) => setMetaDesc(e.target.value.slice(0, 160))}
                placeholder="Meta description (max 160 chars)…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { onApplyOptimization("title", seoTitle); setEditSnippet(false) }}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Apply to Form
              </button>
              <button
                onClick={() => fixWithAI("meta-description")}
                disabled={!!aiLoading}
                className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-600 hover:bg-violet-500/20 transition-colors disabled:opacity-50 dark:text-violet-400"
              >
                {aiLoading === "meta-description" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                AI Meta
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Focus Keyword ─────────────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-4">
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Focus Keyword
        </label>
        <input
          type="text"
          value={focusKeyword}
          onChange={(e) => setFocusKeyword(e.target.value)}
          placeholder="e.g. Luxembourg city tour"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {focusKeyword && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Density: <span className={cn(density >= 0.5 && density <= 2.5 ? "text-emerald-500" : "text-amber-500")}>{density.toFixed(1)}%</span>
            {" · "}{kwCount} occurrence{kwCount !== 1 ? "s" : ""} in {words} words
          </p>
        )}
      </div>

      {/* ── Accordions ───────────────────────────────────────────────────── */}
      <div className="divide-y divide-border">
        {sections.map((section) => {
          const errors = section.checks.filter((c) => !c.pass).length
          const isOpen = openSections.has(section.id)

          return (
            <div key={section.id}>
              {/* Section header */}
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
                  ? <ChevronUp  className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {/* Check list */}
              {isOpen && (
                <div className="bg-background px-5 pb-4 pt-2">
                  <div className="space-y-3.5">
                    {section.checks.map((check) => (
                      <div key={check.id} className="flex items-start gap-3">

                        {/* Pass / fail icon */}
                        {check.pass
                          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                          : <XCircle      className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}

                        {/* Message + AI fix button */}
                        <div className="min-w-0 flex-1">
                          <span className={cn(
                            "text-[13px] leading-snug",
                            check.pass ? "text-muted-foreground line-through decoration-muted-foreground/30" : "text-foreground"
                          )}>
                            {check.message}
                          </span>

                          {/* "Fix with AI" — only for fixable failing checks */}
                          {check.aiFixable && !check.pass && check.fixType && (
                            <button
                              onClick={() => fixWithAI(check.fixType!)}
                              disabled={!!aiLoading}
                              className="mt-1.5 flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-600 transition-colors hover:bg-violet-200 disabled:opacity-50 dark:bg-violet-500/15 dark:text-violet-400 dark:hover:bg-violet-500/25"
                            >
                              {aiLoading === check.fixType
                                ? <Loader2  className="h-3 w-3 animate-spin" />
                                : <Sparkles className="h-3 w-3" />}
                              {aiLoading === check.fixType ? "Fixing…" : "Fix with AI"}
                            </button>
                          )}
                        </div>

                        {/* Help tooltip */}
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
    </div>
  )
}
