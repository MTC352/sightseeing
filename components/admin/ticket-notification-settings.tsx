"use client"

import { useEffect, useState } from "react"
import { Mail, Loader2, Check, AlertCircle } from "lucide-react"

/**
 * Admin Settings → "Ticket notifications": which addresses are emailed about
 * new support tickets and replies. Ticket authors are emailed separately about
 * status changes and replies (lib/ticket-email.ts).
 */
export function TicketNotificationSettings() {
  const [value, setValue] = useState("")
  const [saved, setSaved] = useState("")
  const [smtpConfigured, setSmtpConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/admin/tickets/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { emails: string[]; smtpConfigured: boolean }) => {
        const v = d.emails.join(", ")
        setValue(v)
        setSaved(v)
        setSmtpConfigured(d.smtpConfigured)
      })
      .catch(() => setMsg({ ok: false, text: "Could not load ticket notification settings." }))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/tickets/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: value }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((d as { error?: string }).error ?? "Save failed")
      const v = (d as { emails: string[] }).emails.join(", ")
      setValue(v)
      setSaved(v)
      setMsg({ ok: true, text: "Saved" })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
        <div className="min-w-[220px] flex-1">
          <h2 className="text-sm font-semibold text-foreground">Ticket notifications</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            These addresses are emailed when a support ticket is created or replied to. The ticket author is
            also emailed about replies and status changes. Nobody is emailed about their own action.
            Separate several addresses with commas.
          </p>
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setMsg(null) }}
            disabled={loading}
            placeholder="hello@sightseeing.lu, support@sightseeing.lu"
            className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {!value.trim() && !loading && (
            <p className="mt-1.5 text-[11px] text-amber-600">No addresses — new tickets and replies won&apos;t notify anyone (authors still get their updates).</p>
          )}
          {!smtpConfigured && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600">
              <AlertCircle className="h-3 w-3" /> SMTP is not configured on the server (SMTP_HOST / SMTP_FROM in .env) — no emails will be sent.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-end">
          {msg && (
            <span className={`text-[11px] font-medium ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || value === saved}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
