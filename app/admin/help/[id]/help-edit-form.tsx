"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import type { HelpArticle, HelpAttachment } from "@/lib/admin-store"
import { Save, ArrowLeft, Check, AlertCircle, X, Upload, FolderOpen, FileText, Loader2, Trash2, Sparkles } from "lucide-react"
import Link from "next/link"

const PUBLIC_CATEGORIES = ["Booking", "Payments", "Cancellation", "Accessibility", "General", "Getting Here", "Tickets", "Groups", "App", "City Tours", "Meeting Points", "Languages"]
const ADMIN_CATEGORIES = ["Getting Started", "Dashboard", "Trips", "Blog", "Jobs", "Help & FAQ", "Support Tickets", "Pages (CMS)", "AI Systems", "Integrations", "Header / Footer", "Palisis Import", "DB Tracker"]

type MediaRow = {
  id: string
  filename: string
  title: string | null
  url: string
  mime_type: string
  size_bytes: number
}

function formatBytes(n: number): string {
  if (!n) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function HelpEditForm({
  article,
  canUseFiles = false,
  defaultAudience = "public",
}: {
  article: HelpArticle | null
  canUseFiles?: boolean
  defaultAudience?: HelpArticle["audience"]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [form, setForm] = useState<Partial<HelpArticle>>(
    article ?? {
      question: "",
      answer: "",
      category: defaultAudience === "admin" ? "Getting Started" : "General",
      status: "draft",
      order: 99,
      audience: defaultAudience,
    }
  )
  const [attachments, setAttachments] = useState<HelpAttachment[]>(article?.attachments ?? [])

  const audience = form.audience ?? "public"
  const CATEGORIES = audience === "admin" ? ADMIN_CATEGORIES : PUBLIC_CATEGORIES

  // ── AI article writer ──────────────────────────────────────────────────────
  const [showAi, setShowAi] = useState(false)
  const [aiGoal, setAiGoal] = useState("")
  const [aiNotes, setAiNotes] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!aiGoal.trim() && !aiNotes.trim()) {
      setAiError("Describe the article's goal (or paste notes) so the AI knows what to write.")
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch("/api/admin/help/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: aiGoal,
          notes: aiNotes,
          audience,
          category: form.category,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAiError(body.error ?? `Generation failed (${res.status})`)
        return
      }
      setForm((f) => ({
        ...f,
        question: body.question ?? f.question,
        answer: body.answer ?? f.answer,
      }))
      setShowAi(false)
    } catch {
      setAiError("Network error — please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  function set<K extends keyof HelpArticle>(key: K, value: HelpArticle[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // ── Attachments ───────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  function addAttachment(a: HelpAttachment) {
    setAttachments((list) => (list.some((x) => x.url === a.url) ? list : [...list, a]))
  }
  function removeAttachment(idOrUrl: string) {
    setAttachments((list) => list.filter((a) => a.id !== idOrUrl && a.url !== idOrUrl))
  }

  async function handleUploadFile(file: File) {
    setUploading(true)
    setAttachError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/help/upload", { method: "POST", body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAttachError(body.error ?? `Upload failed (${res.status})`)
        return
      }
      addAttachment({
        id: body.id,
        filename: body.filename,
        title: body.title ?? body.filename,
        url: body.url,
        mimeType: body.mime_type,
        sizeBytes: body.size_bytes,
      })
    } catch {
      setAttachError("Network error during upload.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleSave() {
    if (!form.question?.trim() || !form.answer?.trim()) {
      setSaveError("Question and answer are required before saving.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const method = article ? "PATCH" : "POST"
      const url = article ? `/api/admin/help/${article.id}` : `/api/admin/help`
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachments }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Save failed (${res.status})`)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (!article) {
        router.push("/admin/help")
        router.refresh()
      } else {
        router.refresh()
      }
    } catch {
      setSaveError("Network error — please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  return (
    <div className="mx-auto max-w-2xl">
      {saveError && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      {/* Topbar */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/admin/help"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Help & FAQ
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !form.question?.trim() || !form.answer?.trim()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved" : saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold text-foreground">
          {article ? "Edit Article" : "New Help Article"}
        </h2>

        {/* Audience + Category row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Audience</label>
            <select
              value={audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as HelpArticle["audience"], category: e.target.value === "admin" ? "Getting Started" : "General" }))}
              className={inputClass}
            >
              <option value="public">Public — shown on /help to all visitors</option>
              <option value="admin">Admin only — shown in /admin/docs, hidden from public</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category ?? (audience === "admin" ? "Getting Started" : "General")}
              onChange={(e) => set("category", e.target.value)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status + Order row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Status</label>
            <select
              value={form.status ?? "draft"}
              onChange={(e) => set("status", e.target.value as HelpArticle["status"])}
              className={inputClass}
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Order</label>
            <input
              type="number"
              min={1}
              value={form.order ?? 99}
              onChange={(e) => set("order", Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        {/* AI article writer */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          {!showAi ? (
            <button
              type="button"
              onClick={() => { setShowAi(true); setAiError(null) }}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Sparkles className="h-4 w-4" />
              Write this article with AI
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
                </p>
                <button type="button" onClick={() => setShowAi(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Describe what the article should cover. Optionally paste rough notes or draft text and the AI will turn it into a clean {audience === "admin" ? "admin documentation" : "help"} article. It fills the title and answer below — you can edit before saving.
              </p>

              {aiError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{aiError}</span>
                  <button type="button" onClick={() => setAiError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}

              <div>
                <label className={labelClass}>Goal of the article</label>
                <input
                  type="text"
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  placeholder="e.g. Explain how to add Google reviews to a single trip"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Notes or draft text (optional)</label>
                <textarea
                  rows={4}
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  placeholder="Paste any bullet points, steps, or rough text the AI should base the article on..."
                  className={`${inputClass} resize-y`}
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={aiLoading || (!aiGoal.trim() && !aiNotes.trim())}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiLoading ? "Generating..." : "Generate article"}
              </button>
            </div>
          )}
        </div>

        {/* Question */}
        <div>
          <label className={labelClass}>Question <span className="text-destructive">*</span></label>
          <input
            type="text"
            value={form.question ?? ""}
            onChange={(e) => set("question", e.target.value)}
            placeholder="e.g. How do I cancel my booking?"
            className={inputClass}
          />
        </div>

        {/* Answer */}
        <div>
          <label className={labelClass}>Answer <span className="text-destructive">*</span></label>
          <textarea
            rows={6}
            value={form.answer ?? ""}
            onChange={(e) => set("answer", e.target.value)}
            placeholder="Write a clear, helpful answer..."
            className={`${inputClass} resize-y`}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">
            Plain text. Keep answers concise and actionable.
          </p>
        </div>

        {/* Attachments */}
        <div>
          <label className={labelClass}>Document attachments</label>
          <p className="mb-2 text-[11px] text-muted-foreground/60">
            Attach documents (PDF, etc.) that visitors can download from this article.
          </p>

          {attachError && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{attachError}</span>
              <button type="button" onClick={() => setAttachError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {attachments.length > 0 && (
            <ul className="mb-3 space-y-2">
              {attachments.map((a) => (
                <li key={a.id || a.url} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-foreground hover:underline">
                      {a.title || a.filename}
                    </a>
                    <p className="truncate text-[11px] text-muted-foreground">{a.filename}{a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ""}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id || a.url)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove attachment"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUploadFile(f)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading..." : "Upload file"}
            </button>
            {canUseFiles && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <FolderOpen className="h-4 w-4" />
                Select from Files
              </button>
            )}
          </div>
        </div>
      </div>

      {showPicker && canUseFiles && (
        <FilePickerModal
          onClose={() => setShowPicker(false)}
          onPick={(m) => {
            addAttachment({
              id: m.id,
              filename: m.filename,
              title: m.title ?? m.filename,
              url: m.url,
              mimeType: m.mime_type,
              sizeBytes: m.size_bytes,
            })
            setShowPicker(false)
          }}
        />
      )}
    </div>
  )
}

function FilePickerModal({ onClose, onPick }: { onClose: () => void; onPick: (m: MediaRow) => void }) {
  const [files, setFiles] = useState<MediaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/media")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load files")
      setFiles(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = q.trim()
    ? files.filter((f) => `${f.title ?? ""} ${f.filename}`.toLowerCase().includes(q.toLowerCase()))
    : files

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-bold text-foreground">Select from Files</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-border p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No files found.</p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onPick(f)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-secondary/40"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{f.title || f.filename}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{f.filename} · {formatBytes(f.size_bytes)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
