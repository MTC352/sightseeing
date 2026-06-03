"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, AlertCircle, Route, Lightbulb } from "lucide-react"
import { PromptRevisions } from "@/components/admin/prompt-revisions"
import { ActiveProviderBadge, useActiveAiProvider } from "@/components/admin/active-ai-provider"

interface ItineraryForm {
  systemPrompt: string
  tipsPrompt: string
  model: string
  temperature: number
  maxTokens: number
  showCarWidget: boolean
  showHotelWidget: boolean
  maxMultiDayDays: number
}

const DEFAULTS: ItineraryForm = {
  systemPrompt: "",
  tipsPrompt: "",
  model: "anthropic/claude-haiku-4-5-20251001",
  temperature: 0.5,
  maxTokens: 2048,
  showCarWidget: true,
  showHotelWidget: true,
  maxMultiDayDays: 2,
}

export default function ItineraryAiPage() {
  const router = useRouter()
  const { provider: activeProvider, models: MODELS } = useActiveAiProvider()
  const [form, setForm] = useState<ItineraryForm>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/itinerary-config")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setForm((prev) => ({
          ...prev,
          ...data,
          temperature: typeof data?.temperature === "number" ? data.temperature : prev.temperature,
          maxTokens: typeof data?.maxTokens === "number" ? data.maxTokens : prev.maxTokens,
          showCarWidget: data?.showCarWidget !== false,
          showHotelWidget: data?.showHotelWidget !== false,
          maxMultiDayDays: typeof data?.maxMultiDayDays === "number" && data.maxMultiDayDays >= 2
            ? Math.min(14, Math.floor(data.maxMultiDayDays))
            : prev.maxMultiDayDays,
        }))
      })
      .catch(() => setError("Could not load current settings."))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/itinerary-config", {
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
          <h1 className="mt-1 text-2xl font-bold text-foreground">Manage Trip Planner</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Controls the Smart Itinerary builder on /planner. Live Palisis timeslots, trip metadata, the visitor&apos;s
            chosen date and their saved preferences are always injected at runtime — your prompt sees them as <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">{"{{tripMenuLines}}"}</code>,
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">{"{{visitDate}}"}</code>,
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">{"{{visitorProfile}}"}</code> etc.
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

      <div className="max-w-3xl space-y-6">
        {/* Build Itinerary Prompt */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Build Itinerary — System Prompt</h2>
            </div>
            <PromptRevisions
              systemKey="itinerary"
              promptKind="systemPrompt"
              currentText={form.systemPrompt}
              onActivate={(text) => setForm((f) => ({ ...f, systemPrompt: text }))}
            />
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Available placeholders (filled at runtime from live data):{" "}
            <code className="font-mono">{"{{visitDate}}"}</code>,{" "}
            <code className="font-mono">{"{{visitPretty}}"}</code>,{" "}
            <code className="font-mono">{"{{dayStartTime}}"}</code>,{" "}
            <code className="font-mono">{"{{dayEndTime}}"}</code>,{" "}
            <code className="font-mono">{"{{travelMethodLabel}}"}</code>,{" "}
            <code className="font-mono">{"{{bufferTimeBetweenStops}}"}</code>,{" "}
            <code className="font-mono">{"{{maxStopsPerDay}}"}</code>,{" "}
            <code className="font-mono">{"{{tripMenuLines}}"}</code>,{" "}
            <code className="font-mono">{"{{unavailableLines}}"}</code>,{" "}
            <code className="font-mono">{"{{mealBreaksBlock}}"}</code>,{" "}
            <code className="font-mono">{"{{cityTravelMatrix}}"}</code>.
          </p>
          <p className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            <strong>New planning rules baked into the default prompt:</strong> the model now reads each
            trip&apos;s short description + tags to enforce time-of-day suitability (nightlife → 18:00+,
            sunrise → before 10:00, outdoor → daylight), uses{" "}
            <code className="font-mono">{"{{cityTravelMatrix}}"}</code> for realistic inter-city
            travel gaps, and sequences trips along a one-direction geographic arc (no zig-zags).
            If your saved prompt was edited before these rules existed, consider clicking <em>Reset to default</em>
            in the revision history above — or paste the new rules into your custom prompt.
            Overpacked carts (e.g. 5 trips with &quot;half-day&quot;) are now caught BEFORE the prompt
            ever runs and returned to the visitor as a structured choice (full-day / multi-day / drop trips).
          </p>
          <textarea
            rows={18}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            placeholder="Loading current prompt…"
            disabled={loading}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">{form.systemPrompt.length} chars</p>
        </div>

        {/* Tips of the day */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-foreground">Tips of the Day — Prompt</h2>
            </div>
            <PromptRevisions
              systemKey="itinerary"
              promptKind="tipsPrompt"
              currentText={form.tipsPrompt}
              onActivate={(text) => setForm((f) => ({ ...f, tipsPrompt: text }))}
            />
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Appended to the build prompt and used to populate the <strong>&quot;Tips for your day&quot;</strong> panel under
            the itinerary. The model returns these as a short array.
          </p>
          <textarea
            rows={6}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
            value={form.tipsPrompt}
            onChange={(e) => setForm((f) => ({ ...f, tipsPrompt: e.target.value }))}
            placeholder="Generate 3-5 short practical tips for the visitor's day…"
            disabled={loading}
          />
        </div>

        {/* Multi-day trip cap */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Multi-day trip — max days</h2>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Controls the maximum number of days a visitor can pick when they choose &quot;Multi-day trip&quot; in
            the planner onboarding. Range: 2–14. Default: 2.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={2}
              max={14}
              step={1}
              value={form.maxMultiDayDays}
              onChange={(e) => setForm((f) => ({ ...f, maxMultiDayDays: Math.max(2, Math.min(14, parseInt(e.target.value) || 2)) }))}
              className={`${inputClass} max-w-[120px]`}
              disabled={loading}
              aria-label="Maximum multi-day days"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>

        {/* Cross-sell widgets are temporarily disabled on the planner.
            Hidden from admin until the feature is brought back. The
            underlying DB fields + form state are kept so re-enabling
            later requires no migration. */}

        {/* Model configuration */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Model Configuration</h2>
            <ActiveProviderBadge provider={activeProvider} />
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Model</label>
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className={inputClass}
                disabled={loading}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Temperature
                <span className="ml-1.5 font-normal text-muted-foreground/60">— ({form.temperature})</span>
              </label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-primary"
                disabled={loading}
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
                <span>Precise (0)</span><span>Balanced (0.5)</span><span>Creative (1)</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Max Tokens</label>
              <input
                type="number" min={256} max={8192} step={128}
                value={form.maxTokens}
                onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) || 2048 }))}
                className={inputClass}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
