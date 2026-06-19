"use client"

import { useState } from "react"
import { Lock } from "lucide-react"

/**
 * Public password gate UI. Rendered server-side by the root layout (so the
 * protected page HTML is never sent) whenever frontend protection is enabled and
 * the visitor has no valid `site_access` cookie. Submitting the correct password
 * sets the cookie via /api/site-access and reloads into the real site.
 */
export function SiteAccessGate() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(false)
    try {
      const res = await fetch("/api/site-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.reload()
        return
      }
      setError(true)
      setPassword("")
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl border border-border bg-card p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Site Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">This site is currently private</p>
          <p className="mt-2 text-xs text-muted-foreground">Enter the password to continue</p>
        </div>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
          className={`w-full rounded-lg border bg-background px-4 py-3 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 ${
            error
              ? "border-destructive focus:ring-destructive/20"
              : "border-border focus:ring-primary/30"
          }`}
          autoFocus
        />
        {error && (
          <p className="mt-2 text-center text-xs text-destructive">Incorrect password</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
          Access valid for 7 days
        </p>
      </form>
    </div>
  )
}
