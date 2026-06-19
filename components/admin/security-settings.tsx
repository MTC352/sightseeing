"use client"

import { useEffect, useState } from "react"
import { Save, Check, AlertCircle, ShieldCheck, Eye, EyeOff } from "lucide-react"

/**
 * Superadmin "Security" panel (Admin Settings → Security tab).
 * Toggles the public-frontend password gate on/off and sets the access password.
 */
export function SecuritySettings() {
  const [enabled, setEnabled] = useState(false)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/admin/security")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: { enabled: boolean; password: string }) => {
        setEnabled(!!data.enabled)
        setPassword(data.password ?? "")
      })
      .catch(() => setError("Could not load security settings."))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setError("")
    if (enabled && password.trim().length < 4) {
      setError("Password must be at least 4 characters when protection is enabled.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/security", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Save failed")
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-20 animate-pulse rounded bg-muted/60" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground">Frontend Protection</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              When enabled, the public website is hidden behind a password screen.
              Visitors must enter the password below before any page is shown.
              The admin panel always stays accessible via its own login.
            </p>

            {/* Enable toggle */}
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <span className="text-sm font-medium text-foreground">
                Require a password to view the site
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  enabled ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            {/* Password field */}
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Access password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter access password"
                  disabled={!enabled}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 pr-11 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Changing the password signs every visitor out, so they must re-enter the new one.
              </p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
          saved
            ? "bg-emerald-500/15 text-emerald-600"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saved ? "Saved!" : saving ? "Saving…" : "Save Security Settings"}
      </button>
    </div>
  )
}
