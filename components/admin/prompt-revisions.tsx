"use client"

/**
 * Reusable revision-history UI for any admin-managed AI prompt.
 *
 * Usage:
 *   <PromptRevisions
 *     systemKey="chat"
 *     promptKind="systemPrompt"
 *     currentText={form.systemPrompt}
 *     onActivate={(text) => setForm((f) => ({ ...f, systemPrompt: text }))}
 *   />
 *
 * Behaviour:
 *  - Modal opens on click and lazy-loads revisions for this prompt.
 *  - Lists revisions newest-first with timestamp + truncated preview.
 *  - "Activate" triggers a confirmation step before POSTing to the
 *    activate endpoint and calling onActivate(text) so the parent form
 *    can also reflect the change without a hard reload.
 */

import { useCallback, useEffect, useState } from "react"
import { History, X, AlertTriangle, Check, RotateCcw, Eye } from "lucide-react"

type Revision = {
  id: number
  systemKey: string
  promptKind: string
  promptText: string
  createdAt: string
}

export function PromptRevisions({
  systemKey,
  promptKind,
  currentText,
  onActivate,
  label = "Revisions",
}: {
  systemKey: string
  promptKind: string
  currentText?: string
  onActivate?: (text: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [error, setError] = useState("")
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [activatingId, setActivatingId] = useState<number | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [justActivatedId, setJustActivatedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const r = await fetch(
        `/api/admin/prompt-revisions?systemKey=${encodeURIComponent(systemKey)}&promptKind=${encodeURIComponent(promptKind)}`,
        { cache: "no-store" },
      )
      if (!r.ok) throw new Error("load failed")
      const data = await r.json()
      setRevisions(Array.isArray(data?.revisions) ? data.revisions : [])
    } catch {
      setError("Could not load revisions.")
    } finally {
      setLoading(false)
    }
  }, [systemKey, promptKind])

  useEffect(() => {
    if (open) {
      load()
      setConfirmingId(null)
      setPreviewId(null)
    }
  }, [open, load])

  async function activate(id: number) {
    setActivatingId(id)
    setError("")
    try {
      const r = await fetch(`/api/admin/prompt-revisions/${id}/activate`, { method: "POST" })
      if (!r.ok) throw new Error("activate failed")
      const rev = revisions.find((x) => x.id === id)
      if (rev && onActivate) onActivate(rev.promptText)
      setJustActivatedId(id)
      setConfirmingId(null)
      // Refresh so any new revision row created by the activation flow
      // (deduped server-side) is reflected.
      await load()
      setTimeout(() => setJustActivatedId(null), 2500)
    } catch {
      setError("Could not activate that revision.")
    } finally {
      setActivatingId(null)
    }
  }

  function preview(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return <em className="text-muted-foreground/60">(empty)</em>
    return trimmed.length > 240 ? trimmed.slice(0, 240) + "…" : trimmed
  }

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    } catch { return iso }
  }

  const currentTextTrim = (currentText ?? "").trim()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        title="View prompt revision history"
      >
        <History className="h-3 w-3" /> {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Prompt revision history</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono">{systemKey}</span> · <span className="font-mono">{promptKind}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}

              {loading && (
                <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
              )}

              {!loading && revisions.length === 0 && !error && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No saved revisions yet. The first time you save this prompt, the previous version is captured here.
                </p>
              )}

              <ul className="space-y-3">
                {revisions.map((rev, idx) => {
                  const isCurrent = rev.promptText.trim() === currentTextTrim
                  const isConfirming = confirmingId === rev.id
                  const isActivating = activatingId === rev.id
                  const justActivated = justActivatedId === rev.id
                  const isPreview = previewId === rev.id
                  return (
                    <li
                      key={rev.id}
                      className={`rounded-lg border ${isCurrent ? "border-primary/40 bg-primary/5" : "border-border bg-card"} p-3`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {idx === 0 ? "Latest" : `Revision #${revisions.length - idx}`}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Current
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/70">
                              {fmtTime(rev.createdAt)} · {rev.promptText.length} chars
                            </span>
                          </div>
                          <div className="mt-1.5 whitespace-pre-wrap break-words rounded bg-secondary/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {isPreview ? (rev.promptText || <em className="text-muted-foreground/60">(empty)</em>) : preview(rev.promptText)}
                          </div>
                          {rev.promptText.length > 240 && (
                            <button
                              type="button"
                              onClick={() => setPreviewId(isPreview ? null : rev.id)}
                              className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="h-3 w-3" /> {isPreview ? "Show preview" : "Show full text"}
                            </button>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {justActivated ? (
                            <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-600">
                              <Check className="h-3 w-3" /> Activated
                            </span>
                          ) : isCurrent ? (
                            <span className="text-[10px] text-muted-foreground/60">in use</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingId(rev.id)}
                              disabled={isActivating}
                              className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                            >
                              <RotateCcw className="h-3 w-3" /> Activate
                            </button>
                          )}
                        </div>
                      </div>

                      {isConfirming && (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold">Replace the current prompt with this revision?</p>
                            <p className="mt-0.5 opacity-80">
                              The current prompt will be saved as a new revision automatically, so this is reversible.
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => activate(rev.id)}
                                disabled={isActivating}
                                className="rounded-md bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                {isActivating ? "Activating…" : "Yes, activate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                disabled={isActivating}
                                className="rounded-md border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="border-t border-border bg-secondary/20 px-5 py-2.5 text-[10px] text-muted-foreground">
              Showing up to 50 most recent revisions. New revisions are recorded automatically every time the prompt is saved with a different value.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
