"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, AlertCircle, Sparkles, Wrench, Gauge, RotateCcw } from "lucide-react"
import { PromptRevisions } from "@/components/admin/prompt-revisions"
import { ActiveProviderBadge, useActiveAiProvider } from "@/components/admin/active-ai-provider"
import {
  DEFAULT_SEO_OPTIMIZE_PROMPT,
  DEFAULT_SEO_FIX_PROMPT,
  DEFAULT_SEO_ANALYZE_PROMPT,
} from "@/lib/ai/seo-prompts"

interface SeoForm {
  optimize: string
  fix: string
  analyze: string
}

const DEFAULTS: SeoForm = {
  optimize: DEFAULT_SEO_OPTIMIZE_PROMPT,
  fix: DEFAULT_SEO_FIX_PROMPT,
  analyze: DEFAULT_SEO_ANALYZE_PROMPT,
}

export default function SeoAiPage() {
  const router = useRouter()
  const { provider: activeProvider } = useActiveAiProvider()
  const [form, setForm] = useState<SeoForm>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/seo-config")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setForm((prev) => ({
          optimize: typeof data?.optimize === "string" ? data.optimize : prev.optimize,
          fix: typeof data?.fix === "string" ? data.fix : prev.fix,
          analyze: typeof data?.analyze === "string" ? data.analyze : prev.analyze,
        }))
      })
      .catch(() => setError("Could not load current prompts."))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/seo-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error("Failed to save")
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  function restoreDefault(field: keyof SeoForm) {
    const ok = window.confirm(
      "Replace this prompt with the recommended default? Your current text will be overwritten — after saving you can still restore it from Revisions.",
    )
    if (!ok) return
    setForm((f) => ({ ...f, [field]: DEFAULTS[field] }))
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"

  const sections: {
    field: keyof SeoForm
    promptKind: string
    icon: typeof Sparkles
    iconClass: string
    title: string
    blurb: React.ReactNode
    rows: number
  }[] = [
    {
      field: "optimize",
      promptKind: "optimizePrompt",
      icon: Sparkles,
      iconClass: "text-primary",
      title: "Optimize — System Prompt",
      blurb: (
        <>
          Powers the <strong>&quot;Optimize SEO via AI&quot;</strong> button on a trip&apos;s SEO tab. The trip&apos;s
          source content is appended at runtime; the model returns the focus keyword, title, meta
          description, body, highlights and slug as JSON. The deterministic RankMath-style scoring and
          post-fix guarantees always run afterwards and are <em>not</em> editable here.
        </>
      ),
      rows: 18,
    },
    {
      field: "fix",
      promptKind: "fixPrompt",
      icon: Wrench,
      iconClass: "text-amber-500",
      title: "Fix — Shared System Prompt",
      blurb: (
        <>
          Applied to every <strong>one-click AI Fix</strong> (add a power word / sentiment word / number
          to the title, expand content, shorten paragraphs, write a meta description). This is shared
          guidance for all fix types — the specific instruction for each fix is generated automatically.
        </>
      ),
      rows: 8,
    },
    {
      field: "analyze",
      promptKind: "analyzePrompt",
      icon: Gauge,
      iconClass: "text-emerald-500",
      title: "Analyze — System Prompt",
      blurb: (
        <>
          Powers the <strong>SEO analysis / recommendations</strong> panel. Must instruct the model to
          return the exact JSON shape the UI expects (overall score, keyword opportunities, improvements,
          strengths, missing keywords, AI-search optimization). Changing the JSON structure can break the
          panel — edit the guidance, keep the shape.
        </>
      ),
      rows: 18,
    },
  ]

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8 flex items-start gap-4">
        <button
          type="button"
          onClick={() => router.push("/admin/ai-systems")}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">AI Systems</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">SEO Optimizer</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Edit the creative instructions for all three AI SEO tools on the trip edit page. Every save is
            captured in revision history, so you can revert any prompt to an earlier version at any time.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            saved ? "bg-emerald-500/15 text-emerald-600" : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3">
        <p className="text-xs text-muted-foreground">
          The AI provider and model are resolved automatically from the active provider — no API keys or
          model picking needed here.
        </p>
        <ActiveProviderBadge provider={activeProvider} />
      </div>

      <div className="max-w-3xl space-y-6">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.field} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.iconClass}`} />
                  <h2 className="text-sm font-semibold text-foreground">{s.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => restoreDefault(s.field)}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                    title="Replace with the recommended default prompt"
                  >
                    <RotateCcw className="h-3 w-3" /> Default
                  </button>
                  <PromptRevisions
                    systemKey="seo"
                    promptKind={s.promptKind}
                    currentText={form[s.field]}
                    onActivate={(text) => setForm((f) => ({ ...f, [s.field]: text }))}
                  />
                </div>
              </div>
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{s.blurb}</p>
              <textarea
                rows={s.rows}
                className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
                value={form[s.field]}
                onChange={(e) => setForm((f) => ({ ...f, [s.field]: e.target.value }))}
                placeholder="Loading current prompt…"
                disabled={loading}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground/60">{form[s.field].length} chars</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
