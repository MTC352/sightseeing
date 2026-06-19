"use client"

import { useEffect, useState } from "react"
import { Save, Check, AlertCircle, Cookie } from "lucide-react"

interface CookieCategory {
  enabled: boolean
  defaultOn: boolean
  title: string
  description: string
}

interface CookieSettings {
  enabled: boolean
  title: string
  message: string
  privacyUrl: string
  necessaryTitle: string
  necessaryDescription: string
  categories: {
    functional: CookieCategory
    marketing: CookieCategory
  }
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  textarea,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  textarea?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
    </div>
  )
}

/**
 * Admin "Cookie Consent" panel (Admin Settings → Cookie Consent tab).
 * Configures the public cookie banner copy, the privacy link, and which optional
 * tracking categories are offered (and whether they start enabled). The banner
 * actually enforces these choices — blocked categories never load their scripts.
 */
export function CookieSettings() {
  const [settings, setSettings] = useState<CookieSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/admin/cookie-settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data: CookieSettings) => setSettings(data))
      .catch(() => setError("Could not load cookie settings."))
  }, [])

  function patch(p: Partial<CookieSettings>) {
    setSettings((s) => (s ? { ...s, ...p } : s))
  }
  function patchCategory(key: "functional" | "marketing", p: Partial<CookieCategory>) {
    setSettings((s) =>
      s
        ? { ...s, categories: { ...s.categories, [key]: { ...s.categories[key], ...p } } }
        : s,
    )
  }

  async function save() {
    if (!settings) return
    setError("")
    setSaving(true)
    try {
      const res = await fetch("/api/admin/cookie-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Save failed")
      }
      const updated = (await res.json()) as CookieSettings
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        {error ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        ) : (
          <>
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-20 animate-pulse rounded bg-muted/60" />
          </>
        )}
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

      {/* Banner copy */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Cookie className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Cookie Consent Banner</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Control the cookie banner shown to visitors. Choices are enforced — blocked
                categories never load their tracking scripts.
              </p>
            </div>

            <Toggle
              checked={settings.enabled}
              onChange={(v) => patch({ enabled: v })}
              label="Show the cookie consent banner"
            />
            {!settings.enabled && (
              <p className="text-xs text-amber-600">
                The banner is hidden — all cookies (including marketing/affiliate trackers)
                load without asking visitors for consent.
              </p>
            )}

            <TextField label="Banner title" value={settings.title} onChange={(v) => patch({ title: v })} />
            <TextField
              label="Banner message"
              value={settings.message}
              onChange={(v) => patch({ message: v })}
              textarea
            />
            <TextField
              label="Privacy policy link"
              value={settings.privacyUrl}
              onChange={(v) => patch({ privacyUrl: v })}
              placeholder="/privacy"
            />
          </div>
        </div>
      </div>

      {/* Strictly necessary (locked) */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Strictly necessary</h3>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Always on
          </span>
        </div>
        <TextField
          label="Category title"
          value={settings.necessaryTitle}
          onChange={(v) => patch({ necessaryTitle: v })}
        />
        <TextField
          label="Category description"
          value={settings.necessaryDescription}
          onChange={(v) => patch({ necessaryDescription: v })}
          textarea
        />
      </div>

      {/* Optional categories */}
      {(["functional", "marketing"] as const).map((key) => {
        const cat = settings.categories[key]
        return (
          <div key={key} className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-semibold capitalize text-foreground">
              {key === "functional" ? "Functional cookies" : "Marketing & affiliate cookies"}
            </h3>
            <Toggle
              checked={cat.enabled}
              onChange={(v) => patchCategory(key, { enabled: v })}
              label="Offer this category in the banner"
            />
            <Toggle
              checked={cat.defaultOn}
              onChange={(v) => patchCategory(key, { defaultOn: v })}
              label="Pre-select (toggle on by default)"
            />
            <TextField
              label="Category title"
              value={cat.title}
              onChange={(v) => patchCategory(key, { title: v })}
            />
            <TextField
              label="Category description"
              value={cat.description}
              onChange={(v) => patchCategory(key, { description: v })}
              textarea
            />
          </div>
        )
      })}

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
        {saved ? "Saved!" : saving ? "Saving…" : "Save Cookie Settings"}
      </button>
    </div>
  )
}
