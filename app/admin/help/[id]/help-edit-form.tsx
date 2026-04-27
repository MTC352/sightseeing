"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { HelpArticle } from "@/lib/admin-store"
import { Save, ArrowLeft, Check, AlertCircle, X } from "lucide-react"
import Link from "next/link"

const CATEGORIES = ["Booking", "Payments", "Cancellation", "Accessibility", "General"]

export function HelpEditForm({ article }: { article: HelpArticle | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [form, setForm] = useState<Partial<HelpArticle>>(
    article ?? {
      question: "",
      answer: "",
      category: "General",
      status: "draft",
      order: 99,
    }
  )

  function set<K extends keyof HelpArticle>(key: K, value: HelpArticle[K]) {
    setForm((f) => ({ ...f, [key]: value }))
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
        body: JSON.stringify(form),
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

        {/* Category + Status + Order row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category ?? "General"}
              onChange={(e) => set("category", e.target.value)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
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
      </div>
    </div>
  )
}
