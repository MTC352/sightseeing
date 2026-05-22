"use client"

/**
 * Trip Planner Chat admin page.
 *
 * Manages everything that powers the conversational planner on /planner —
 * which used to live as sections 2 & 3 of the "Trip Chat" admin page but is
 * now a first-class sibling so per-trip chat and planner chat settings are
 * fully separate.
 *
 * Two things are configured here:
 *   1. Planner Conversation system prompt — appended to the hardcoded
 *      /api/planner prompt as "CUSTOM INSTRUCTIONS FROM ADMIN".
 *   2. Planner Onboarding Form — groups / interests / durations / budgets
 *      / multi-day max-days cap that drive the /planner first-time wizard.
 *
 * Per-trip chat settings (system prompt + model knobs for /trip/[id]) live
 * separately on /admin/ai-systems/chat.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, Bot, AlertCircle, Plus, Trash2, RotateCcw, Wand2 } from "lucide-react"
import { PromptRevisions } from "@/components/admin/prompt-revisions"

const PLANNER_PROMPT_SUGGESTION = `You are the dedicated trip-planning assistant for sightseeing.lu. Keep replies short, warm, and conversational (1–2 sentences). Surface real, bookable trips from the catalog. Never invent prices, durations, or availability — call the right tool instead. When the user is ready, propose an itinerary; otherwise keep narrowing options with one focused follow-up question.`

type Option = { value: string; label: string }
type PlannerForm = {
  groups: Option[]
  interests: Option[]
  durations: Option[]
  budgets: Option[]
  maxMultiDayDays: number
}
const DEFAULT_PLANNER_FORM: PlannerForm = {
  groups: [
    { value: "solo", label: "Solo" },
    { value: "couple", label: "Couple" },
    { value: "family", label: "Family with kids" },
    { value: "friends", label: "Friends group" },
  ],
  interests: [
    { value: "food", label: "Food & Drinks" },
    { value: "culture", label: "History & Culture" },
    { value: "outdoor", label: "Outdoor & Nature" },
    { value: "night", label: "Nightlife" },
    { value: "sport", label: "Active & Sports" },
    { value: "indoor", label: "Hidden Gems" },
  ],
  durations: [
    { value: "1-2h", label: "1-2 hours" },
    { value: "half-day", label: "Half day" },
    { value: "full-day", label: "Full day" },
    { value: "multi-day", label: "Multi-day trip" },
  ],
  budgets: [
    { value: "casual", label: "Keep it casual" },
    { value: "mid-range", label: "Mid-range" },
    { value: "premium", label: "Treat ourselves" },
  ],
  maxMultiDayDays: 2,
}

export default function TripPlannerChatAdminPage() {
  const router = useRouter()

  const [plannerPrompt, setPlannerPrompt] = useState("")
  const [plannerForm, setPlannerForm] = useState<PlannerForm>(DEFAULT_PLANNER_FORM)
  const [initialPrompt, setInitialPrompt] = useState<string>(PLANNER_PROMPT_SUGGESTION)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Load planner overrides + form options from the dedicated endpoint.
  // Tolerant of missing fields — first-time setup falls back to the
  // suggested prompt and the default form options.
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/chat-planner-config")
      .then((r) => r.json())
      .catch(() => null)
      .then((planner) => {
        if (cancelled) return
        let nextPrompt = PLANNER_PROMPT_SUGGESTION
        if (planner) {
          if (typeof planner.plannerSystemPrompt === "string" && planner.plannerSystemPrompt.trim().length > 0) {
            nextPrompt = planner.plannerSystemPrompt
          }
          if (planner.plannerForm) setPlannerForm({ ...DEFAULT_PLANNER_FORM, ...planner.plannerForm })
        }
        setPlannerPrompt(nextPrompt)
        setInitialPrompt(nextPrompt)
      })
    return () => { cancelled = true }
  }, [])

  const promptDirty = plannerPrompt !== initialPrompt

  // Esc closes the confirm modal so keyboard users can dismiss without mouse.
  useEffect(() => {
    if (!confirmOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [confirmOpen])

  function onSaveClick() {
    setError("")
    if (promptDirty) {
      setConfirmOpen(true)
    } else {
      void doSave()
    }
  }

  async function doSave() {
    setConfirmOpen(false)
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/chat-planner-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerSystemPrompt: plannerPrompt,
          plannerForm,
        }),
      })
      if (!res.ok) throw new Error("save failed")
      setInitialPrompt(plannerPrompt)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
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
          <h1 className="mt-1 text-2xl font-bold text-foreground">Trip Planner Chat</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Controls the conversational planner on /planner — admin prompt overrides plus the onboarding form shown on the visitor's first visit.
          </p>
        </div>
        <button
          type="button"
          onClick={onSaveClick}
          disabled={saving}
          data-testid="planner-save-button"
          className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            saved ? "bg-emerald-500/15 text-emerald-600" : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save all"}
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="max-w-3xl space-y-8">
        {/* ── 1. Planner conversation prompt ───────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Planner Conversation (/planner)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Custom instructions appended to the planner's hardcoded system prompt. Use this to add operator-specific tone, restrictions, or seasonal nudges. Leave empty to use the defaults baked into /api/planner.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className={labelClass + " mb-0"}>Planner system prompt (admin override)</label>
              <div className="flex items-center gap-2">
                <PromptRevisions
                  systemKey="chat"
                  promptKind="plannerSystemPrompt"
                  currentText={plannerPrompt}
                  onActivate={(text) => setPlannerPrompt(text)}
                />
                <button
                  type="button"
                  onClick={() => setPlannerPrompt(PLANNER_PROMPT_SUGGESTION)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Replace with a sane default starting point"
                >
                  <Wand2 className="h-3 w-3" /> Load default suggestion
                </button>
              </div>
            </div>
            <textarea
              rows={8}
              data-testid="planner-system-prompt"
              className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
              value={plannerPrompt}
              onChange={(e) => setPlannerPrompt(e.target.value)}
              placeholder="(optional) Extra instructions for the planner AI…"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              {plannerPrompt.length} chars · Appended after the hardcoded planner prompt. Dynamic context (weather, cart, group, behaviour) stays managed in code.
            </p>
          </div>
        </section>

        {/* ── 2. Planner onboarding form ───────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Planner Onboarding Form</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Options visitors see in the first-time wizard on /planner. You can rename labels and add/remove options. <strong>Values are stable slugs</strong> (lowercase, a–z 0–9 and dashes only) — changing a value resets visitors who had it saved. Icons stay code-mapped by value; new values get a generic icon.
            </p>
          </div>

          <OptionListEditor
            title="Group types"
            help="Asked first. Family / Friends also trigger a party-size sub-step."
            options={plannerForm.groups}
            defaultOption={{ value: "new-group", label: "New group" }}
            onChange={(v) => setPlannerForm((f) => ({ ...f, groups: v }))}
            onReset={() => setPlannerForm((f) => ({ ...f, groups: DEFAULT_PLANNER_FORM.groups }))}
          />
          <OptionListEditor
            title="Interests"
            help="Visitors pick up to 3. Keep this list short."
            options={plannerForm.interests}
            defaultOption={{ value: "new-interest", label: "New interest" }}
            onChange={(v) => setPlannerForm((f) => ({ ...f, interests: v }))}
            onReset={() => setPlannerForm((f) => ({ ...f, interests: DEFAULT_PLANNER_FORM.interests }))}
          />
          <OptionListEditor
            title="Durations"
            help="The 'multi-day' value is required (it controls the day-count stepper) and will be auto-restored if removed."
            options={plannerForm.durations}
            defaultOption={{ value: "new-duration", label: "New duration" }}
            onChange={(v) => setPlannerForm((f) => ({ ...f, durations: v }))}
            onReset={() => setPlannerForm((f) => ({ ...f, durations: DEFAULT_PLANNER_FORM.durations }))}
          />
          <OptionListEditor
            title="Budgets"
            help="Shown after duration."
            options={plannerForm.budgets}
            defaultOption={{ value: "new-budget", label: "New budget" }}
            onChange={(v) => setPlannerForm((f) => ({ ...f, budgets: v }))}
            onReset={() => setPlannerForm((f) => ({ ...f, budgets: DEFAULT_PLANNER_FORM.budgets }))}
          />

          <div className="rounded-xl border border-border bg-card p-5">
            <label className={labelClass}>Multi-day trip — maximum days</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min={2} max={14} step={1}
                value={plannerForm.maxMultiDayDays}
                onChange={(e) => setPlannerForm((f) => ({
                  ...f,
                  maxMultiDayDays: Math.max(2, Math.min(14, parseInt(e.target.value) || 2)),
                }))}
                className={`${inputClass} max-w-[120px]`}
              />
              <span className="text-xs text-muted-foreground">days (2–14)</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              Caps the stepper shown after picking "Multi-day trip". Also enforced server-side when building itineraries.
            </p>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Changes take effect immediately for new planner conversations and new onboarding sessions. Active conversations keep the prompt that was current when they started.
          </p>
        </div>
      </div>

      {/* Confirm-before-save modal — only when the prompt itself changed. */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-save-title"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 id="confirm-save-title" className="text-base font-semibold text-foreground">
                  Update live planner prompt?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This will change how the planner AI responds in real visitor conversations.
                  Existing chats keep their current prompt; new planner sessions start using the updated prompt immediately.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doSave()}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Yes, update prompt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Option list editor (same as the version that used to live inside
 *  the Trip Chat page). Slugs are auto-normalised on blur so admins
 *  don't accidentally save spaces or upper-case that would break the
 *  server-side allow-list. */
function OptionListEditor({
  title, help, options, defaultOption, onChange, onReset,
}: {
  title: string
  help: string
  options: Option[]
  defaultOption: Option
  onChange: (next: Option[]) => void
  onReset: () => void
}) {
  function update(i: number, patch: Partial<Option>) {
    onChange(options.map((o, idx) => idx === i ? { ...o, ...patch } : o))
  }
  function remove(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...options, { ...defaultOption }])
  }
  function normaliseSlug(s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">{help}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt.value}
              onChange={(e) => update(i, { value: e.target.value })}
              onBlur={(e) => update(i, { value: normaliseSlug(e.target.value) })}
              placeholder="slug"
              className="w-32 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground focus:border-primary/50 focus:outline-none"
            />
            <input
              type="text"
              value={opt.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label shown to visitor"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove option"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add option
        </button>
      </div>
    </div>
  )
}
