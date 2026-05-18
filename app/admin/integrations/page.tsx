"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Save, Check, Eye, EyeOff, ExternalLink, AlertCircle, Cloud, Map, Bot, Zap, Globe, Star, RefreshCw, Calendar } from "lucide-react"

interface ApiKeyField {
  key: string
  label: string
  placeholder: string
  hint: string
  docsUrl?: string
  testable?: boolean
  secret?: boolean
  inputType?: "text" | "number"
}

const SECTIONS: { id: string; title: string; icon: typeof Cloud; fields: ApiKeyField[] }[] = [
  {
    id: "weather",
    title: "OpenWeather",
    icon: Cloud,
    fields: [
      {
        key: "openWeather",
        label: "API Key",
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        hint: "Used to show live weather on the hero section and trip planner. Get a free key at openweathermap.org.",
        docsUrl: "https://openweathermap.org/api",
        testable: true,
        secret: true,
      },
    ],
  },
  {
    id: "mapbox",
    title: "Mapbox",
    icon: Map,
    fields: [
      {
        key: "mapbox",
        label: "Public Token",
        placeholder: "pk.eyJ1IjoiLi4uIn0…",
        hint: "Used for the sightseeing map widget. Set NEXT_PUBLIC_MAPBOX_TOKEN in Vercel env vars for client-side access.",
        docsUrl: "https://docs.mapbox.com/api/overview/",
        testable: false,
        secret: true,
      },
    ],
  },
  {
    id: "ai",
    title: "AI Providers",
    icon: Bot,
    fields: [
      {
        key: "anthropic",
        label: "Anthropic API Key",
        placeholder: "sk-ant-…",
        hint: "Optional — the Vercel AI Gateway handles Anthropic by default. Only set if using a direct connection.",
        docsUrl: "https://console.anthropic.com/",
        secret: true,
      },
      {
        key: "openai",
        label: "OpenAI API Key",
        placeholder: "sk-…",
        hint: "Optional — the Vercel AI Gateway handles OpenAI by default.",
        docsUrl: "https://platform.openai.com/api-keys",
        secret: true,
      },
    ],
  },
  {
    id: "palisis",
    title: "Palisis / TourCMS",
    icon: RefreshCw,
    fields: [
      {
        key: "palisis",
        label: "API Key",
        placeholder: "e.g. abcdef123456789",
        hint: "Your TourCMS private API key — found in TourCMS → Configuration → API Settings.",
        docsUrl: "https://www.tourcms.com/support/api/mp/",
        testable: true,
        secret: true,
      },
      {
        key: "palisisChannelId",
        label: "Channel ID",
        placeholder: "e.g. 3930",
        hint: "Numeric channel ID from TourCMS → API Settings. Required for all API calls and the connectivity test.",
        secret: false,
        inputType: "number",
      },
      {
        key: "palisisMarketplaceId",
        label: "Marketplace ID",
        placeholder: "e.g. 0  (use 0 if not a marketplace agent)",
        hint: "Your marketplace agent ID — leave blank or 0 if you are accessing TourCMS as a Tour Operator directly.",
        secret: false,
        inputType: "number",
      },
    ],
  },
  {
    id: "google",
    title: "Google Reviews",
    icon: Star,
    fields: [
      {
        key: "googlePlaceId",
        label: "Google Place ID",
        placeholder: "ChIJ85BI1wLFlEcRJpsBgCkl8gA",
        hint: "Find your Place ID at developers.google.com/maps/documentation/places/web-service/place-id",
      },
      {
        key: "googleReviews",
        label: "Google Places API Key",
        placeholder: "AIza…",
        hint: "Used to display live Google reviews on the homepage and experience pages.",
        docsUrl: "https://developers.google.com/maps/documentation/places/web-service",
        testable: true,
      },
    ],
  },
  {
    id: "weglot",
    title: "Weglot Translation",
    icon: Globe,
    fields: [
      {
        key: "weglot",
        label: "Weglot API Key",
        placeholder: "wg_…",
        hint: "Enables multi-language support. Full Weglot configuration is available on the dedicated settings page.",
        docsUrl: "https://weglot.com/documentation",
      },
    ],
  },
]

type ApiKeys = Record<string, string>

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<ApiKeys>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail">>({})
  const [error, setError] = useState("")
  const [dsToggling, setDsToggling] = useState(false)
  const [dsIntervalSaving, setDsIntervalSaving] = useState(false)
  const [dsIntervalSaved, setDsIntervalSaved] = useState(false)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => setKeys(s?.apiKeys ?? {}))
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: keys }),
      })
      if (!res.ok) throw new Error()

      const intPayload = Object.entries(keys).map(([k, v]) => ({ key: k, value: v, enabled: true }))
      await fetch("/api/admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intPayload),
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleDsAutoUpdate(enabled: boolean) {
    setDsToggling(true)
    setKeys((k) => ({ ...k, departing_soon_auto_update: enabled ? "true" : "false" }))
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "apiKeys",
          data: { departing_soon_auto_update: enabled ? "true" : "false" },
        }),
      })
    } catch {
      setKeys((k) => ({ ...k, departing_soon_auto_update: enabled ? "false" : "true" }))
    } finally {
      setDsToggling(false)
    }
  }

  async function saveDsInterval() {
    setDsIntervalSaving(true)
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "apiKeys",
          data: { departing_soon_interval: keys.departing_soon_interval ?? "300" },
        }),
      })
      setDsIntervalSaved(true)
      setTimeout(() => setDsIntervalSaved(false), 2500)
    } catch { /* ignore */ } finally {
      setDsIntervalSaving(false)
    }
  }

  async function testKey(fieldKey: string) {
    setTesting(fieldKey)
    try {
      let url = `/api/admin/test-key?service=${encodeURIComponent(fieldKey)}&key=${encodeURIComponent(keys[fieldKey] ?? "")}`
      if (fieldKey === "palisis") {
        if (keys.palisisChannelId) url += `&channelId=${encodeURIComponent(keys.palisisChannelId)}`
        if (keys.palisisMarketplaceId) url += `&marketplaceId=${encodeURIComponent(keys.palisisMarketplaceId)}`
      }
      const res = await fetch(url)
      const data = (await res.json()) as { ok: boolean }
      setTestResult((p) => ({ ...p, [fieldKey]: data.ok ? "ok" : "fail" }))
    } catch {
      setTestResult((p) => ({ ...p, [fieldKey]: "fail" }))
    } finally {
      setTesting(null)
      setTimeout(() => setTestResult((p) => { const n = { ...p }; delete n[fieldKey]; return n }), 4000)
    }
  }

  const inputBase =
    "flex-1 rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Settings</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Integrations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage API keys and third-party service connections.</p>
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
          {saved ? "Saved!" : saving ? "Saving…" : "Save All"}
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.id} className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <section.icon className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
              {section.id === "weglot" && (
                <Link
                  href="/admin/integrations/weglot"
                  className="ml-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Full settings <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              {section.id === "palisis" && (
                <Link
                  href="/admin/palisis"
                  className="ml-auto flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Import panel <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            <div className="space-y-5 p-5">
              {section.fields.map((field) => {
                const isSecret = field.secret !== false
                return (
                <div key={field.key}>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{field.label}</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isSecret ? (shown[field.key] ? "text" : "password") : "text"}
                        value={keys[field.key] ?? ""}
                        onChange={(e) => setKeys((k) => ({ ...k, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className={inputBase}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                    {isSecret && (
                    <button
                      type="button"
                      onClick={() => setShown((p) => ({ ...p, [field.key]: !p[field.key] }))}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label={shown[field.key] ? "Hide key" : "Show key"}
                    >
                      {shown[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    )}
                    {field.testable && (
                      <button
                        type="button"
                        onClick={() => testKey(field.key)}
                        disabled={testing === field.key}
                        className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                          testResult[field.key] === "ok"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : testResult[field.key] === "fail"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {testing === field.key ? "Testing…" : testResult[field.key] === "ok" ? "Connected" : testResult[field.key] === "fail" ? "Failed" : "Test"}
                      </button>
                    )}
                    {field.docsUrl && (
                      <a
                        href={field.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label="View docs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/60">{field.hint}</p>
                </div>
              )})}
            </div>
          </div>
        ))}

        {/* ── Departing Soon ──────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Calendar className="h-4 w-4 text-muted-foreground/50" />
            <h2 className="text-sm font-semibold text-foreground">Departing Soon Block</h2>
            <p className="ml-auto text-[11px] text-muted-foreground/60">Homepage widget settings</p>
          </div>
          <div className="space-y-5 p-5">

            {/* Auto-update toggle */}
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Auto-Update</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/60">
                    When enabled, the Departing Soon block on the homepage polls for fresh
                    departures from Palisis while the page is open — at the interval set below.
                    When disabled, data is only refreshed on page load.
                  </p>
                </div>
                <label className="ml-6 flex shrink-0 cursor-pointer items-center gap-2.5">
                  <span className={`text-xs font-semibold ${keys.departing_soon_auto_update === "true" ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {keys.departing_soon_auto_update === "true" ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={keys.departing_soon_auto_update === "true"}
                    disabled={dsToggling}
                    onClick={() => toggleDsAutoUpdate(keys.departing_soon_auto_update !== "true")}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
                      keys.departing_soon_auto_update === "true" ? "bg-emerald-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        keys.departing_soon_auto_update === "true" ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            {/* Refresh interval */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Refresh Interval
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={Math.max(1, Math.round(parseInt(keys.departing_soon_interval ?? "300", 10) / 60)) || 5}
                    onChange={(e) => {
                      const mins = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 5))
                      setKeys((k) => ({ ...k, departing_soon_interval: String(mins * 60) }))
                    }}
                    className={`${inputBase} w-24 pr-12`}
                  />
                  <span className="absolute right-3 text-xs text-muted-foreground/50">min</span>
                </div>
                <button
                  type="button"
                  onClick={saveDsInterval}
                  disabled={dsIntervalSaving}
                  className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                    dsIntervalSaved
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {dsIntervalSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : <><Save className="h-3.5 w-3.5" /> Save</>}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/60">
                How often the homepage widget re-fetches live departure data from Palisis when
                auto-update is on. Default is 5 minutes. Keep this at 5+ minutes to avoid
                hammering the Palisis API. Data is also cached server-side between requests.
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
