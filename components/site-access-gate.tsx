"use client"

import { useEffect, useState } from "react"
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
  // The interactive password input is rendered only after mount. Password-manager
  // extensions (LastPass, etc.) inject DOM nodes into password fields, which would
  // cause a hydration mismatch if the input existed during SSR/hydration. Rendering
  // it client-side after mount avoids the hydration comparison entirely.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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
        // Password-manager extensions (LastPass, etc.) inject DOM nodes around
        // the password field after SSR, which React would otherwise flag as a
        // hydration mismatch. Suppress it for this form only.
        suppressHydrationWarning
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Site Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">This site is currently private</p>
          <p className="mt-2 text-xs text-muted-foreground">Enter the password to continue</p>
        </div>
        {mounted ? (
          <>
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
          </>
        ) : (
          // Static, non-interactive placeholder matching the input/button layout
          // so SSR and first client render are identical (no extension target,
          // no hydration mismatch, no layout shift before mount).
          <>
            <div
              aria-hidden
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-lg tracking-widest text-muted-foreground/40"
            >
              ••••••
            </div>
            <div
              aria-hidden
              className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground opacity-60"
            >
              Unlock
            </div>
          </>
        )}
        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
          Access valid for 7 days
        </p>
      </form>
    </div>
  )
}
