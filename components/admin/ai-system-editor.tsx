"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Save, Check, Bot, AlertCircle, Settings2, ChevronRight, Wand2 } from "lucide-react"
import { PromptRevisions } from "@/components/admin/prompt-revisions"
import { ActiveProviderBadge, useActiveAiProvider } from "@/components/admin/active-ai-provider"
import { EditorBodySkeleton } from "@/components/admin/ai-system-skeleton"
import { TRIP_ITINERARY_SYSTEM_PROMPT } from "@/lib/ai/trip-itinerary-prompt"

export const SYSTEM_LABELS: Record<string, { label: string; hint: string }> = {
  planner: {
    label: "Trip Planner",
    hint: "Used on /planner. Has access to the full trip catalog, weather, cart, and group data. Supports tools: searchTrips, showWeather, offerCoupon, buildItinerary, addToCart.",
  },
  chat: {
    label: "Per-Trip Chat",
    hint: "Part of Single Trip AIs. Used on individual trip detail pages (/trip/[id]). At runtime it receives: the full current trip context, all published trips catalog, blog articles, and open job listings as a knowledge base. For complex itinerary questions it redirects to /planner. Use the system prompt to customise tone, restrict topics, or add operator-specific instructions.",
  },
  trip_itinerary: {
    label: "Itinerary Generator",
    hint: 'Part of Single Trip AIs. Powers "Generate Itinerary with AI" on the trip edit page — builds the step-by-step itinerary shown on the public trip page, with optional map locations. Locations geocode to Luxembourg by default. Uses the active AI provider; switching providers remaps the model.',
  },
  help: {
    label: "Help & FAQ Chat",
    hint: "Used on /help. Handles booking, payment, and cancellation queries. Should be factual and conservative (low temperature).",
  },
  blog: {
    label: "Blog Content Generator",
    hint: "Used on the blog post edit page. Generates SEO & AEO optimized articles via OpenAI GPT-4o, plus cover images via DALL-E 2. Requires an OpenAI API key in the Integrations settings.",
  },
  outdoor_today: {
    label: "Best Outdoor Experiences",
    hint: "Powers the 'Best Outdoor Experiences Today' section on the homepage. Receives today's weather, current time, available timeslots, trip descriptions, and details. Ranks trips by weather suitability and upcoming availability. Results are cached for 10 minutes.",
  },
}

export const DEFAULT_PROMPT_SUGGESTIONS: Record<string, string> = {
  trip_itinerary: TRIP_ITINERARY_SYSTEM_PROMPT,
  blog: `You are an expert SEO and AEO (Answer Engine Optimization) content writer for a Luxembourg tourism website called "Sightseeing Luxembourg".

  Generate a high-quality, engaging blog post with SEO best practices: compelling keyword-rich title, structured H2/H3 headings, natural keyword placement, 1200-1800 words, strong CTA.

  AEO: Direct answers to likely questions, FAQ section (3-5 Q&As), structured lists, conversational language.

  CONTENT GUIDELINES:
  - Focus on Luxembourg tourism, activities, culture, food, and travel
  - Be informative, engaging, and helpful to tourists
  - Include practical tips and local insights
  - Mention specific places, experiences, or tours when relevant
  - Write in a warm, welcoming tone

  OUTPUT FORMAT — metadata block first, then full Markdown:
  ---
  TITLE: [suggested title]
  SLUG: [url-friendly-slug]
  EXCERPT: [2-3 sentence excerpt]
  READ_TIME: [X min read]
  IMAGE_PROMPT: [detailed DALL-E cover image prompt, photorealistic Luxembourg travel photography style]
  ---

  Then the full Markdown article.`,
}

const DEFAULT_CONFIG = {
  systemPrompt: "",
  model: "anthropic/claude-opus-4.6",
  temperature: 0.7,
  maxTokens: 1024,
}

/**
 * Self-contained editor for a single AI system (prompt + model config + Save).
 * Used both by the dynamic /admin/ai-systems/[system] route and by grouped
 * pages (e.g. "Single Trip AIs") that render several editors as tabs on one
 * internal page. It owns its own fetch/save lifecycle keyed by `system`, so
 * multiple instances stay independent.
 */
export function AiSystemEditor({ system }: { system: string }) {
  const meta = SYSTEM_LABELS[system] ?? { label: system, hint: "" }
  const { provider: activeProvider, models: MODELS, ready } = useActiveAiProvider()

  const [form, setForm] = useState({ ...DEFAULT_CONFIG })
  const [displayCount, setDisplayCount] = useState(2)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        if (cancelled) return
        const config = s?.ai?.[system]
        const suggestion = DEFAULT_PROMPT_SUGGESTIONS[system]
        if (config) {
          // Pre-fill with the built-in default when no prompt has been saved yet,
          // so the admin edits FROM the prompt that's actually in effect.
          const merged = { ...DEFAULT_CONFIG, ...config }
          if (!String(merged.systemPrompt ?? "").trim() && suggestion) {
            merged.systemPrompt = suggestion
          }
          setForm(merged)
          if (system === "outdoor_today") {
            const count = config?.extra?.display_count
            if (typeof count === "number") setDisplayCount(count)
          }
        } else if (suggestion) {
          // No DB row at all — still show the built-in default as the starting point.
          setForm((f) => ({ ...f, systemPrompt: suggestion }))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [system])

  const defaultSuggestion = DEFAULT_PROMPT_SUGGESTIONS[system]

  function loadDefaultSuggestion() {
    if (!defaultSuggestion) return
    const current = form.systemPrompt.trim()
    if (current && current !== defaultSuggestion.trim()) {
      const ok = window.confirm("Replace the current system prompt with the default suggestion? Your current text will be overwritten (you can still restore it from Revisions after saving).")
      if (!ok) return
    }
    setForm((f) => ({ ...f, systemPrompt: defaultSuggestion }))
  }

  async function save() {
    setSaving(true)
    setError("")
    try {
      const payload: Record<string, unknown> = { system, ...form }
      if (system === "outdoor_today") payload.displayCount = displayCount
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "ai", data: payload }),
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

  // Hold the skeleton until BOTH the saved config and the active provider are
  // known, so the form renders once with real data (no blank → default → data flash).
  if (!loaded || !ready) return <EditorBodySkeleton />

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{meta.label}</h2>
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
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className={labelClass + " mb-0"}>System Prompt</label>
            <div className="flex items-center gap-2">
              {defaultSuggestion && (
                <button
                  type="button"
                  onClick={loadDefaultSuggestion}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="Replace the prompt with a recommended default"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Load default suggestion
                </button>
              )}
              <PromptRevisions
                systemKey={system}
                promptKind="systemPrompt"
                currentText={form.systemPrompt}
                onActivate={(text) => setForm((f) => ({ ...f, systemPrompt: text }))}
              />
            </div>
          </div>
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

        {/* Best Outdoor Experiences — display count */}
        {system === "outdoor_today" && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Display Settings</h2>
            <div>
              <label className={labelClass}>
                Number of Trips to Display
                <span className="ml-1.5 font-normal text-muted-foreground/60">— shown next to the weather card</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                value={displayCount}
                onChange={(e) => setDisplayCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 2)))}
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                Default: 2. The section fetches up to 2× this number as candidates and shows the top-ranked ones.
              </p>
            </div>
          </div>
        )}

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
