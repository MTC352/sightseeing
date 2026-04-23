"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Save, Check, Bot, AlertCircle, Settings2, ChevronRight } from "lucide-react"

const MODELS = [
  { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (Anthropic)" },
  { value: "anthropic/claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Anthropic)" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)" },
  { value: "google/gemini-3-flash", label: "Gemini 3 Flash (Google)" },
]

const SYSTEM_LABELS: Record<string, { label: string; hint: string }> = {
  planner: {
    label: "Trip Planner",
    hint: "Used on /planner. Has access to the full trip catalog, weather, cart, and group data. Supports tools: searchTrips, showWeather, offerCoupon, showTransitPlanner, buildItinerary, addToCart.",
  },
  chat: {
    label: "Trip Chat",
    hint: "Used on individual trip detail pages (/trip/[id]). Receives the specific trip context as part of the system prompt.",
  },
  help: {
    label: "Help & FAQ Chat",
    hint: "Used on /help. Handles booking, payment, and cancellation queries. Should be factual and conservative (low temperature).",
  },
}

const DEFAULT_CONFIG = {
  systemPrompt: "",
  model: "anthropic/claude-opus-4.6",
  temperature: 0.7,
  maxTokens: 1024,
}

export default function AiSystemSettingsPage({ params }: { params: Promise<{ system: string }> }) {
  const { system } = use(params)
  const meta = SYSTEM_LABELS[system] ?? { label: system, hint: "" }
  const router = useRouter()

  const [form, setForm] = useState({ ...DEFAULT_CONFIG })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useState(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        const config = s?.ai?.[system]
        if (config) setForm({ ...DEFAULT_CONFIG, ...config })
      })
      .catch(() => {})
  })

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "ai", data: { system, ...form } }),
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

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

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
          <h1 className="mt-1 text-2xl font-bold text-foreground">{meta.label}</h1>
          {meta.hint && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{meta.hint}</p>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
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

      <div className="max-w-2xl space-y-6">
        {/* System prompt */}
        <div className="rounded-xl border border-border bg-card p-5">
          <label className={labelClass}>System Prompt</label>
          <textarea
            rows={8}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            placeholder="You are a helpful assistant for sightseeing.lu…"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">
            {form.systemPrompt.length} chars · Dynamic context (weather, catalog, user preferences) is injected at runtime.
          </p>
        </div>

        {/* Model + Temperature + Max tokens */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Model Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Model</label>
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className={inputClass}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                Temperature
                <span className="ml-1.5 font-normal text-muted-foreground/60">— controls creativity ({form.temperature})</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
                <span>Precise (0)</span>
                <span>Balanced (0.5)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            <div>
              <label className={labelClass}>Max Tokens</label>
              <input
                type="number"
                min={128}
                max={8192}
                step={128}
                value={form.maxTokens}
                onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) || 1024 }))}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/60">Maximum tokens per response. Higher = longer answers, higher cost.</p>
            </div>
          </div>
        </div>

        {/* Planner-specific settings */}
        {system === "planner" && (
          <Link
            href="/admin/ai-systems/planner/behavior"
            className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-secondary/30"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Planner Behavior Settings</h3>
                <p className="text-xs text-muted-foreground">
                  Configure itinerary scheduling, buffer times, meal breaks, and AI optimization priorities
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </Link>
        )}

        {/* Info box */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Changes take effect immediately for new conversations. Active conversations use the prompt that was current when they started. The AI Gateway handles provider routing — no separate API keys needed for supported providers.
          </p>
        </div>
      </div>
    </div>
  )
}
