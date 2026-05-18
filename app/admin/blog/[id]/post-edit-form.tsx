"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { AdminPost } from "@/lib/admin-store"
import {
  Save, ArrowLeft, Loader2, Wand2, Upload, X, AlertCircle,
  CheckCircle2, Circle, Eye, Check, Plus, ImageIcon, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80)
}

/** Strip the ---...--- metadata block and return just the body. */
function stripMeta(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/m, "").trim()
}

/** Minimal markdown → HTML for the preview modal (admin-only, safe). */
function mdToHtml(md: string): string {
  const text = stripMeta(md)
  const lines = text.split("\n")
  const out: string[] = []
  let inUl = false
  let inOl = false

  function inl(s: string): string {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code style='background:#f3f4f6;padding:0.1em 0.3em;border-radius:3px;font-size:0.82em'>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#4ade80;text-decoration:underline" target="_blank" rel="noopener">$1</a>')
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (inUl && !line.match(/^[-*] /)) { out.push("</ul>"); inUl = false }
    if (inOl && !line.match(/^\d+\. /)) { out.push("</ol>"); inOl = false }

    if (line.startsWith("#### ")) { out.push(`<h4 style="font-size:0.9rem;font-weight:700;margin:1rem 0 0.25rem">${inl(line.slice(5))}</h4>`); continue }
    if (line.startsWith("### "))  { out.push(`<h3 style="font-size:1.05rem;font-weight:700;margin:1.2rem 0 0.3rem">${inl(line.slice(4))}</h3>`); continue }
    if (line.startsWith("## "))   { out.push(`<h2 style="font-size:1.2rem;font-weight:700;margin:1.5rem 0 0.4rem;border-bottom:1px solid #e5e7eb;padding-bottom:0.3rem">${inl(line.slice(3))}</h2>`); continue }
    if (line.startsWith("# "))    { out.push(`<h1 style="font-size:1.5rem;font-weight:800;margin:0 0 0.75rem">${inl(line.slice(2))}</h1>`); continue }
    if (line.match(/^---+$/))     { out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:1.25rem 0">'); continue }
    if (line.startsWith("> "))    { out.push(`<blockquote style="border-left:3px solid #d1d5db;padding:0.5rem 1rem;color:#6b7280;font-style:italic;margin:0.75rem 0">${inl(line.slice(2))}</blockquote>`); continue }

    if (line.match(/^[-*] /)) {
      if (!inUl) { out.push('<ul style="list-style:disc;padding-left:1.5rem;margin:0.5rem 0">'); inUl = true }
      out.push(`<li style="margin:0.2rem 0">${inl(line.replace(/^[-*] /, ""))}</li>`)
      continue
    }
    if (line.match(/^\d+\. /)) {
      if (!inOl) { out.push('<ol style="list-style:decimal;padding-left:1.5rem;margin:0.5rem 0">'); inOl = true }
      out.push(`<li style="margin:0.2rem 0">${inl(line.replace(/^\d+\. /, ""))}</li>`)
      continue
    }

    if (line.trim() === "") { out.push('<div style="height:0.5rem"></div>'); continue }
    out.push(`<p style="margin:0.3rem 0;line-height:1.65">${inl(line)}</p>`)
  }
  if (inUl) out.push("</ul>")
  if (inOl) out.push("</ol>")
  return out.join("\n")
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MilestoneStatus = "pending" | "active" | "done" | "error"
interface MilestoneItem { id: string; label: string; status: MilestoneStatus }

const MILESTONE_DEFS: Omit<MilestoneItem, "status">[] = [
  { id: "init",    label: "Initializing content structure" },
  { id: "writing", label: "Writing SEO-optimized article" },
  { id: "seo",     label: "SEO & AEO optimization applied" },
  { id: "image",   label: "Generating cover image (DALL-E 2)" },
  { id: "ready",   label: "Content ready" },
]

const CATEGORIES = ["Travel Tips", "Food & Drink", "Outdoor & Nature", "Wine & Culture", "Family Travel", "Day Trips", "Photography", "Events"]

// ── Milestone icon ────────────────────────────────────────────────────────────

function MilestoneIcon({ status }: { status: MilestoneStatus }) {
  if (status === "done")    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
  if (status === "active")  return <Loader2      className="h-4 w-4 text-primary animate-spin shrink-0" />
  if (status === "error")   return <AlertCircle  className="h-4 w-4 text-destructive shrink-0" />
  return <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  content:   string
  image:     string
  meta:      { title: string; slug: string; excerpt: string; readTime: string } | null
  onAccept:  () => void
  onAppend:  () => void
  onClose:   () => void
}

function PreviewModal({ content, image, meta, onAccept, onAppend, onClose }: PreviewModalProps) {
  const html = mdToHtml(content)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-secondary/30 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Blog Post Preview</span>
            {meta?.readTime && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {meta.readTime}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Cover image */}
          {image ? (
            <div className="relative h-52 w-full shrink-0 overflow-hidden bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Generated cover" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center bg-secondary/30 text-muted-foreground">
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageIcon className="h-8 w-8 opacity-30" />
                <p className="text-xs">No cover image (add OpenAI key in Integrations to enable DALL-E 2)</p>
              </div>
            </div>
          )}

          {/* Article */}
          <div className="px-8 py-6">
            {/* Meta */}
            {meta?.title && (
              <h1 className="mb-3 text-2xl font-bold leading-tight text-foreground">{meta.title}</h1>
            )}
            {meta?.excerpt && (
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground border-l-2 border-primary pl-3 italic">
                {meta.excerpt}
              </p>
            )}

            {/* Rendered Markdown body */}
            <div
              className="prose-preview text-sm text-foreground"
              style={{ lineHeight: "1.7" }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border bg-secondary/20 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onAppend}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Append to Body
            </button>
            <button
              onClick={onAccept}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Accept &amp; Apply to Form
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Form ─────────────────────────────────────────────────────────────────

export function PostEditForm({ post }: { post: AdminPost | null }) {
  const router = useRouter()

  // Form state
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [form, setForm] = useState<Partial<AdminPost>>(
    post ?? {
      slug: "", title: "", excerpt: "", body: "", image: "", author: "",
      category: "Travel Tips", tags: [], status: "draft",
      publishedAt: new Date().toISOString().slice(0, 10),
      readTime: "5 min read",
    }
  )

  function set<K extends keyof AdminPost>(key: K, value: AdminPost[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // AI Generator state
  const [aiTopic,          setAiTopic]          = useState("")
  const [showAiPanel,      setShowAiPanel]       = useState(true)
  const [generating,       setGenerating]        = useState(false)
  const [generateError,    setGenerateError]     = useState<string | null>(null)
  const [milestones,       setMilestones]        = useState<MilestoneItem[]>(
    MILESTONE_DEFS.map((m) => ({ ...m, status: "pending" }))
  )
  const [generatedContent, setGeneratedContent]  = useState("")
  const [generatedImage,   setGeneratedImage]    = useState("")
  const [generatedMeta,    setGeneratedMeta]     = useState<{
    title: string; slug: string; excerpt: string; readTime: string
  } | null>(null)
  const [showPreview,      setShowPreview]       = useState(false)

  const streamRef = useRef<AbortController | null>(null)
  const streamBoxRef = useRef<HTMLDivElement>(null)

  // Auto-scroll stream preview
  useEffect(() => {
    const el = streamBoxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [generatedContent])

  // ── Event handler ───────────────────────────────────────────────────────
  const handleSseEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "milestone":
        setMilestones((prev) =>
          prev.map((m) =>
            m.id === event.id
              ? { ...m, label: (event.label as string) ?? m.label, status: event.status as MilestoneStatus }
              : m
          )
        )
        break
      case "chunk":
        setGeneratedContent((prev) => prev + (event.text as string))
        break
      case "image":
        setGeneratedImage(event.url as string)
        break
      case "meta":
        setGeneratedMeta({
          title:    (event.title    as string) ?? "",
          slug:     (event.slug     as string) ?? "",
          excerpt:  (event.excerpt  as string) ?? "",
          readTime: (event.readTime as string) ?? "5 min read",
        })
        break
      case "error":
        setGenerateError((event.message as string) ?? "Generation failed")
        break
    }
  }, [])

  // ── Generate ────────────────────────────────────────────────────────────
  async function handleGenerateBlog() {
    if (!aiTopic.trim()) return

    const ctrl = new AbortController()
    streamRef.current = ctrl

    setGenerating(true)
    setGenerateError(null)
    setGeneratedContent("")
    setGeneratedImage("")
    setGeneratedMeta(null)
    setMilestones(MILESTONE_DEFS.map((m) => ({ ...m, status: "pending" })))

    try {
      const res = await fetch("/api/admin/generate-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic, category: form.category }),
        signal: ctrl.signal,
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev = JSON.parse(line.slice(6))
            handleSseEvent(ev)
          } catch { /* ignore */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setGenerateError(err.message ?? "Generation failed")
      }
    } finally {
      setGenerating(false)
      streamRef.current = null
    }
  }

  function cancelGeneration() {
    streamRef.current?.abort()
  }

  // ── Apply content ────────────────────────────────────────────────────────
  function applyContent(appendOnly = false) {
    const body = stripMeta(generatedContent)
    if (appendOnly) {
      set("body", ((form.body ?? "").trim() ? form.body + "\n\n" : "") + body)
    } else {
      if (generatedMeta?.title)    set("title",    generatedMeta.title)
      if (generatedMeta?.slug)     set("slug",     generatedMeta.slug)
      if (generatedMeta?.excerpt)  set("excerpt",  generatedMeta.excerpt)
      if (generatedMeta?.readTime) set("readTime", generatedMeta.readTime)
      if (generatedImage)          set("image",    generatedImage)
      set("body", body)
    }
    setShowPreview(false)
  }

  // ── Image upload ─────────────────────────────────────────────────────────
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed")
      const { url } = await res.json()
      set("image", url)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload image")
    } finally {
      setUploading(false)
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.title?.trim()) { setSaveError("Title is required before saving."); return }
    setSaving(true); setSaveError(null)
    try {
      const method = post ? "PATCH" : "POST"
      const url    = post ? `/api/admin/posts/${post.id}` : `/api/admin/posts`
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { setSaveError((await res.json().catch(() => ({}))).error ?? `Save failed (${res.status})`); return }
      const saved = await res.json()
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      if (!post) { router.push("/admin/blog"); router.refresh() }
      else { if (saved.slug) setForm((f) => ({ ...f, slug: saved.slug })); router.refresh() }
    } catch { setSaveError("Network error — please try again.") }
    finally   { setSaving(false) }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const isDone       = milestones.some((m) => m.id === "ready" && m.status === "done")
  const hasContent   = generatedContent.trim().length > 0

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          content={generatedContent}
          image={generatedImage}
          meta={generatedMeta}
          onAccept={() => applyContent(false)}
          onAppend={() => { applyContent(true); setShowPreview(false) }}
          onClose={() => setShowPreview(false)}
        />
      )}

      <div className="mx-auto max-w-3xl">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin/blog" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to blog
          </Link>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>

        {saveError && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
            <button type="button" onClick={() => setSaveError(null)} className="ml-auto rounded p-0.5 hover:bg-destructive/10">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-6">

          {/* ── AI Content Generator ─────────────────────────────────────── */}
          <section className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent">

            {/* Section header */}
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Wand2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">AI Content Generator</h2>
                  <p className="text-[11px] text-muted-foreground">GPT-4o · SEO &amp; AEO optimized · DALL-E 2 cover image</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiPanel(!showAiPanel)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {showAiPanel ? "Collapse" : "Expand"}
              </button>
            </div>

            {showAiPanel && (
              <div className="border-t border-border/50 px-5 pb-5 pt-4 space-y-4">

                {/* Prompt input */}
                <div>
                  <label className={labelClass}>Topic / Prompt</label>
                  <textarea
                    rows={2}
                    className={inputClass}
                    placeholder="E.g., Best hiking trails in Luxembourg for families with kids"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    disabled={generating}
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground/60">
                    Describe the blog topic. The AI will write a full article with SEO title, meta, and optimized content, then generate a DALL-E 2 cover image.
                  </p>
                </div>

                {/* Generate / Cancel button */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={generating ? cancelGeneration : handleGenerateBlog}
                    disabled={!generating && !aiTopic.trim()}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
                      generating
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {generating ? (
                      <><X className="h-4 w-4" /> Cancel</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Generate Blog Content</>
                    )}
                  </button>

                  {isDone && !generating && (
                    <button
                      type="button"
                      onClick={() => setShowPreview(true)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Preview &amp; Apply
                    </button>
                  )}
                </div>

                {/* Error */}
                {generateError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {generateError}
                  </div>
                )}

                {/* ── Milestone steps ───────────────────────────────────── */}
                {(generating || isDone || generateError) && (
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Generation Progress
                    </p>
                    <div className="space-y-2.5">
                      {milestones.map((ms, i) => (
                        <div key={ms.id} className="flex items-center gap-3">
                          <MilestoneIcon status={ms.status} />
                          <span className={cn(
                            "flex-1 text-[13px] leading-snug",
                            ms.status === "done"    && "text-foreground",
                            ms.status === "active"  && "font-semibold text-foreground",
                            ms.status === "pending" && "text-muted-foreground/50",
                          )}>
                            {ms.label}
                          </span>
                          {ms.status === "done" && ms.id === "image" && generatedImage && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={generatedImage} alt="" className="h-8 w-8 rounded object-cover" />
                          )}
                          {i < milestones.length - 1 && ms.status !== "pending" && (
                            <div className={cn(
                              "absolute left-[1.35rem] h-2.5 w-px",
                              ms.status === "done" ? "bg-emerald-500/30" : "bg-border"
                            )} style={{ marginTop: "1.5rem" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Streaming preview (live) ──────────────────────────── */}
                {generating && hasContent && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Live Preview
                    </p>
                    <div
                      ref={streamBoxRef}
                      className="max-h-52 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3"
                    >
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                        {generatedContent}
                      </pre>
                    </div>
                  </div>
                )}

                {/* ── Quick-apply buttons (shown after generation) ──────── */}
                {isDone && !generating && hasContent && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="flex-1 text-xs text-foreground">
                      Content ready! Open preview to review or apply directly:
                    </span>
                    <button
                      type="button"
                      onClick={() => applyContent(false)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Apply to Form
                    </button>
                    <button
                      type="button"
                      onClick={() => applyContent(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Append to Body
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Post Details ──────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Post Details</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className={labelClass}>Title <span className="text-destructive">*</span></label>
                <input
                  type="text" className={inputClass} placeholder="Post title"
                  value={form.title ?? ""}
                  onChange={(e) => {
                    const title = e.target.value
                    setForm((f) => ({
                      ...f, title,
                      slug: f.slug && f.slug !== toSlug(f.title ?? "") ? f.slug : toSlug(title),
                    }))
                  }}
                />
              </div>
              <div>
                <label className={labelClass}>Slug</label>
                <input type="text" className={inputClass} placeholder="my-post-slug" value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} />
                <p className="mt-1 text-[10px] text-muted-foreground/60">Auto-generated from title. You can customise it.</p>
              </div>
              <div>
                <label className={labelClass}>Excerpt</label>
                <textarea rows={2} className={inputClass} placeholder="Short description shown in the blog listing" value={form.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Category</label>
                  <select className={inputClass} value={form.category ?? "Travel Tips"} onChange={(e) => set("category", e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Author</label>
                  <input type="text" className={inputClass} placeholder="Author name" value={form.author ?? ""} onChange={(e) => set("author", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Published at</label>
                  <input type="date" className={inputClass} value={form.publishedAt ?? ""} onChange={(e) => set("publishedAt", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Read time</label>
                  <input type="text" className={inputClass} placeholder="5 min read" value={form.readTime ?? ""} onChange={(e) => set("readTime", e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Cover Image</label>
                {form.image ? (
                  <div className="relative mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image} alt="Cover preview" className="h-40 w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => set("image", "")}
                      className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/30 px-6 py-8 transition-colors hover:border-primary/40 hover:bg-secondary/50">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="sr-only" disabled={uploading} />
                    {uploading ? (
                      <><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="mt-2 text-sm text-muted-foreground">Uploading...</span></>
                    ) : (
                      <><Upload className="h-8 w-8 text-muted-foreground" /><span className="mt-2 text-sm font-medium text-foreground">Click to upload cover image</span><span className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP or GIF</span></>
                    )}
                  </label>
                )}
              </div>
            </div>
          </section>

          {/* ── Body ──────────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Body (Markdown)</h2>
            <textarea
              rows={16}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
              placeholder="Write your article content here. Markdown is supported."
              value={form.body ?? ""}
              onChange={(e) => set("body", e.target.value)}
            />
          </section>

          {/* ── Publication ───────────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Publication</h2>
            <div>
              <label className={labelClass}>Status</label>
              <select className={`${inputClass} max-w-xs`} value={form.status ?? "draft"} onChange={(e) => set("status", e.target.value as "draft" | "published")}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save Post"}
          </button>
        </div>
      </div>
    </>
  )
}
