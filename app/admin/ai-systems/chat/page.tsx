"use client"

/**
 * Trip Chat admin page (static — takes precedence over the dynamic
 * [system]/page.tsx). Manages the per-trip AI chat shown on every
 * /trip/[id] page: system prompt, model, temperature, max tokens.
 *
 * The Planner Conversation prompt and Planner Onboarding Form used to
 * live on this same screen but were split out into their own dedicated
 * page at /admin/ai-systems/planner-chat so per-trip chat and planner
 * chat settings stay fully separate.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, Bot, AlertCircle, Wand2 } from "lucide-react"
import { PromptRevisions } from "@/components/admin/prompt-revisions"

const MODELS = [
  { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (Anthropic)" },
  { value: "anthropic/claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Anthropic)" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (OpenAI)" },
  { value: "google/gemini-3-flash", label: "Gemini 3 Flash (Google)" },
]

// Default starter prompt — loaded into the textarea on first-time setup
// (when the DB returns an empty prompt) and via "Load default suggestion".
const CHAT_PROMPT_SUGGESTION = `You are the AI concierge for sightseeing.lu, embedded inside a single trip's detail page. You have full context on the current trip (title, description, price, duration, included/excluded items, itinerary, languages, cancellation policy) plus the broader published catalog, blog articles, and open jobs.

Your job:
- Answer questions about THIS trip accurately and concisely (2–4 sentences).
- Never invent prices, dates, or availability — only quote what is in the provided context.
- If the visitor asks about something not covered by this trip, recommend a relevant alternative from the catalog with a short reason.
- For multi-stop itineraries or full-day plans, redirect the user to /planner.
- Be warm, local, and helpful. Use British English. Mention Luxembourg City landmarks naturally when relevant.`

const CHAT_DEFAULTS = {
  systemPrompt: CHAT_PROMPT_SUGGESTION,
  model: "anthropic/claude-opus-4.6",
  temperature: 0.7,
  maxTokens: 1024,
}

export default function TripChatAdminPage() {
  const router = useRouter()

  const [chat, setChat] = useState({ ...CHAT_DEFAULTS })

  // Snapshot of the prompt as it was last loaded from / saved to the DB so
  // we can detect "dirty" edits and only nag with the confirm-before-save
  // modal when the prompt actually changed.
  const [initialPrompt, setInitialPrompt] = useState<string>(CHAT_PROMPT_SUGGESTION)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .catch(() => null)
      .then((settings) => {
        if (cancelled) return
        const chatCfg = settings?.ai?.chat
        const chatNext = chatCfg
          ? {
              ...CHAT_DEFAULTS,
              ...chatCfg,
              systemPrompt:
                typeof chatCfg.systemPrompt === "string" && chatCfg.systemPrompt.trim().length > 0
                  ? chatCfg.systemPrompt
                  : CHAT_PROMPT_SUGGESTION,
            }
          : { ...CHAT_DEFAULTS }
        setChat(chatNext)
        setInitialPrompt(chatNext.systemPrompt)
      })
    return () => { cancelled = true }
  }, [])

  const promptDirty = chat.systemPrompt !== initialPrompt

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
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "ai", data: { system: "chat", ...chat } }),
      })
      if (!res.ok) throw new Error("save failed")
      setInitialPrompt(chat.systemPrompt)
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
          <h1 className="mt-1 text-2xl font-bold text-foreground">Trip Chat</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Controls the AI assistant shown on individual trip detail pages. Planner conversation settings have moved to their own page.
          </p>
        </div>
        <button
          type="button"
          onClick={onSaveClick}
          disabled={saving}
          data-testid="chat-save-button"
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

      <div className="max-w-3xl space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Per-trip Chat (/trip/[id])</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Runs the chat panel on each trip detail page. Receives the full trip context, the published catalog, blog posts, and open jobs at runtime.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className={labelClass + " mb-0"}>System Prompt</label>
              <div className="flex items-center gap-2">
                <PromptRevisions
                  systemKey="chat"
                  promptKind="systemPrompt"
                  currentText={chat.systemPrompt}
                  onActivate={(text) => setChat((f) => ({ ...f, systemPrompt: text }))}
                />
                <button
                  type="button"
                  onClick={() => setChat((f) => ({ ...f, systemPrompt: CHAT_PROMPT_SUGGESTION }))}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Replace with the suggested baseline"
                >
                  <Wand2 className="h-3 w-3" /> Load default suggestion
                </button>
              </div>
            </div>
            <textarea
              rows={6}
              data-testid="chat-system-prompt"
              className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
              value={chat.systemPrompt}
              onChange={(e) => setChat((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="You are a helpful assistant for the current trip…"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              {chat.systemPrompt.length} chars · Dynamic trip / catalog context is injected at runtime.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Model Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Model</label>
                <select
                  value={chat.model}
                  onChange={(e) => setChat((f) => ({ ...f, model: e.target.value }))}
                  className={inputClass}
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Temperature
                  <span className="ml-1.5 font-normal text-muted-foreground/60">({chat.temperature})</span>
                </label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={chat.temperature}
                  onChange={(e) => setChat((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                  className="w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
                  <span>Precise</span><span>Balanced</span><span>Creative</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Max Tokens</label>
                <input
                  type="number" min={128} max={8192} step={128}
                  value={chat.maxTokens}
                  onChange={(e) => setChat((f) => ({ ...f, maxTokens: parseInt(e.target.value) || 1024 }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Looking for the planner conversation prompt or onboarding form?
            <button
              type="button"
              onClick={() => router.push("/admin/ai-systems/planner-chat")}
              className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              Open Trip Planner Chat →
            </button>
          </p>
        </div>
      </div>

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
                  Update live Per-trip Chat prompt?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This will change how the AI responds in real visitor conversations on every trip page.
                  Existing chats keep their current prompt; new chats start using the updated prompt immediately.
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
