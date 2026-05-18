"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Save, Check, Eye, EyeOff, ExternalLink, AlertCircle,
  Cloud, Map, Bot, Zap, Globe, Star, RefreshCw, Calendar,
  KeyRound, Settings2,
} from "lucide-react"

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
type Tab = "keys" | "settings"

const inputBase =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("keys")
  const [keys, setKeys] = useState<ApiKeys>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail">>({})
  const [error, setError] = useState("")
  const [dsToggling, setDsToggling] = useState(false)
  const [dsSaving, setDsSaving] = useState<"discovery" | "availability" | null>(null)
  const [dsSavedKey, setDsSavedKey] = useState<string | null>(null)
  const [dsRefreshing, setDsRefreshing] = useState<"discovery" | "availability" | null>(null)
  const [dsStatus, setDsStatus] = useState<{
    tourcmsConfigured: boolean | null
    lastDiscoveryAt: string | null
    lastAvailabilityAt: string | null
    tripsChecked?: number
    failedTripCount?: number
  }>({ tourcmsConfigured: null, lastDiscoveryAt: null, lastAvailabilityAt: null })

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        const apiKeys = (s?.apiKeys ?? {}) as ApiKeys
        // One-time migration: old key → new key
        if (apiKeys.departing_soon_interval && !apiKeys.departing_soon_discovery_interval_seconds) {
          apiKeys.departing_soon_discovery_interval_seconds = apiKeys.departing_soon_interval
        }
        setKeys(apiKeys)
      })
      .catch(() => {})
    refreshDsStatus()
  }, [])

  async function refreshDsStatus() {
    try {
      const res = await fetch("/api/departing-soon", { cache: "no-store" })
      const data = await res.json()
      setDsStatus({
        tourcmsConfigured: data.tourcmsConfigured ?? null,
        lastDiscoveryAt: data.lastDiscoveryAt ?? null,
        lastAvailabilityAt: data.lastAvailabilityAt ?? null,
        tripsChecked: data.tripsChecked,
        failedTripCount: data.failedTripCount,
      })
    } catch { /* ignore */ }
  }

  async function refreshNow(kind: "discovery" | "availability") {
    setDsRefreshing(kind)
    try {
      const url = kind === "discovery"
        ? "/api/cron/refresh-discovery?force=1"
        : "/api/admin/refresh-availability"
      await fetch(url, { method: "POST" })
      await refreshDsStatus()
    } catch { /* ignore */ }
    finally { setDsRefreshing(null) }
  }

  async function saveDsKey(key: string, value: string, kind: "discovery" | "availability") {
    setDsSaving(kind)
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: { [key]: value } }),
      })
      setDsSavedKey(key)
      setTimeout(() => setDsSavedKey(null), 2500)
    } catch { /* ignore */ }
    finally { setDsSaving(null) }
  }

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

  function fmtTs(iso: string | null): string {
    if (!iso) return "never"
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return new Date(iso).toLocaleString("en-GB")
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
      setTimeout(
        () => setTestResult((p) => { const n = { ...p }; delete n[fieldKey]; return n }),
        4000
      )
    }
  }

  const dsDiscoverySec = parseInt(keys.departing_soon_discovery_interval_seconds ?? keys.departing_soon_interval ?? "300", 10) || 300
  const dsAvailSec     = parseInt(keys.departing_soon_auto_update_interval_seconds ?? "30", 10) || 30
  const dsAvailTtlSec  = parseInt(keys.departing_soon_availability_ttl_seconds ?? "20", 10) || 20

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Settings</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Integrations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage API keys and third-party service connections.
          </p>
        </div>
        {tab === "keys" && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
              saved
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save All"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("keys")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "keys"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" />
          API Keys
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "settings"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      {/* ── API KEYS TAB ─────────────────────────────────────────── */}
      {tab === "keys" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-44">Service</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-36">Field</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Value</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SECTIONS.flatMap((section) =>
                section.fields.map((field, fi) => {
                  const isSecret = field.secret !== false
                  return (
                    <tr key={field.key} className="group hover:bg-muted/20 transition-colors">
                      {/* Service name — only show on first field of a section */}
                      <td className="px-5 py-4 align-top">
                        {fi === 0 ? (
                          <div className="flex items-center gap-2">
                            <section.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                            <span className="font-medium text-foreground text-xs">{section.title}</span>
                          </div>
                        ) : null}
                        {fi === 0 && (section.id === "weglot" || section.id === "palisis") && (
                          <Link
                            href={section.id === "weglot" ? "/admin/integrations/weglot" : "/admin/palisis"}
                            className="mt-1 flex items-center gap-1 text-[10px] font-medium text-primary hover:underline ml-5"
                          >
                            {section.id === "weglot" ? "Full settings" : "Import panel"}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </td>

                      {/* Field label */}
                      <td className="px-5 py-4 align-top">
                        <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/50 max-w-[160px]">
                          {field.hint}
                        </p>
                      </td>

                      {/* Value input */}
                      <td className="px-5 py-4 align-top">
                        <div className="relative">
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
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-1.5">
                          {isSecret && (
                            <button
                              type="button"
                              onClick={() => setShown((p) => ({ ...p, [field.key]: !p[field.key] }))}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              aria-label={shown[field.key] ? "Hide" : "Show"}
                              title={shown[field.key] ? "Hide" : "Show"}
                            >
                              {shown[field.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {field.testable && (
                            <button
                              type="button"
                              onClick={() => testKey(field.key)}
                              disabled={testing === field.key}
                              title="Test connection"
                              className={`flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                                testResult[field.key] === "ok"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                  : testResult[field.key] === "fail"
                                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                                  : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                              }`}
                            >
                              <Zap className="h-3 w-3" />
                              {testing === field.key
                                ? "…"
                                : testResult[field.key] === "ok"
                                ? "OK"
                                : testResult[field.key] === "fail"
                                ? "Fail"
                                : "Test"}
                            </button>
                          )}
                          {field.docsUrl && (
                            <a
                              href={field.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Documentation"
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SETTINGS TAB ─────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="space-y-5">

          {/* Departing Soon Block */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Calendar className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">Departing Soon Block</h2>
              <span className="ml-auto text-[11px] text-muted-foreground/50">Homepage widget</span>
            </div>

            {/* Missing credentials banner */}
            {dsStatus.tourcmsConfigured === false && (
              <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                TourCMS credentials missing — the widget is hidden on the public site. Add the
                Palisis API key + Channel ID on the API Keys tab to enable it.
              </div>
            )}

            {/* Status row */}
            <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-3 text-xs">
              <div>
                <span className="font-medium text-muted-foreground">Last discovery: </span>
                <span className="text-foreground">{fmtTs(dsStatus.lastDiscoveryAt)}</span>
                {dsStatus.tripsChecked !== undefined && (
                  <span className="ml-2 text-muted-foreground/60">
                    ({dsStatus.tripsChecked - (dsStatus.failedTripCount ?? 0)}/{dsStatus.tripsChecked} tours ok)
                  </span>
                )}
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Last availability: </span>
                <span className="text-foreground">{fmtTs(dsStatus.lastAvailabilityAt)}</span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-48">Setting</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground w-72">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">

                {/* Auto-update toggle */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4 align-middle">
                    <span className="text-xs font-medium text-foreground">Auto-Update</span>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <p className="text-xs text-muted-foreground">
                      When ON, the auto-update cron refreshes availability for the cached top-5
                      slots every <strong>{dsAvailSec}s</strong>. When OFF, availability is only
                      refreshed when the homepage is loaded (read-time, TTL-gated).
                    </p>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={keys.departing_soon_auto_update === "true"}
                        disabled={dsToggling}
                        onClick={() => toggleDsAutoUpdate(keys.departing_soon_auto_update !== "true")}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                          keys.departing_soon_auto_update === "true" ? "bg-emerald-500" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                            keys.departing_soon_auto_update === "true" ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className={`text-xs font-semibold ${keys.departing_soon_auto_update === "true" ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {keys.departing_soon_auto_update === "true" ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Discovery interval */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4 align-middle">
                    <span className="text-xs font-medium text-foreground">Discovery Refresh Interval</span>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <p className="text-xs text-muted-foreground">
                      How often the heavy discovery cron rebuilds the top-5 candidate slots
                      (one datesndeals + up-to-3 checkavail per published trip). Keep ≥ 5 min.
                    </p>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={60} max={3600} step={30}
                          value={dsDiscoverySec}
                          onChange={(e) => {
                            const sec = Math.max(60, Math.min(3600, parseInt(e.target.value, 10) || 300))
                            setKeys((k) => ({ ...k, departing_soon_discovery_interval_seconds: String(sec) }))
                          }}
                          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                        />
                        <span className="absolute right-3 text-xs text-muted-foreground/50 pointer-events-none">sec</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveDsKey("departing_soon_discovery_interval_seconds", String(dsDiscoverySec), "discovery")}
                        disabled={dsSaving === "discovery"}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                          dsSavedKey === "departing_soon_discovery_interval_seconds"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {dsSavedKey === "departing_soon_discovery_interval_seconds"
                          ? <><Check className="h-3.5 w-3.5" /> Saved</>
                          : <><Save className="h-3.5 w-3.5" /> Save</>}
                      </button>
                      <button
                        type="button"
                        onClick={() => refreshNow("discovery")}
                        disabled={dsRefreshing === "discovery"}
                        title="Force a discovery rebuild now"
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${dsRefreshing === "discovery" ? "animate-spin" : ""}`} />
                        Refresh now
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Availability auto-update interval */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4 align-middle">
                    <span className="text-xs font-medium text-foreground">Availability Auto-Update Interval</span>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <p className="text-xs text-muted-foreground">
                      How often the auto-update cron refreshes spaces-remaining for the cached
                      top-5 (5 parallel checkavail calls). Only runs when Auto-Update is ON.
                    </p>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={15} max={300} step={5}
                          value={dsAvailSec}
                          onChange={(e) => {
                            const sec = Math.max(15, Math.min(300, parseInt(e.target.value, 10) || 30))
                            setKeys((k) => ({ ...k, departing_soon_auto_update_interval_seconds: String(sec) }))
                          }}
                          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                        />
                        <span className="absolute right-3 text-xs text-muted-foreground/50 pointer-events-none">sec</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveDsKey("departing_soon_auto_update_interval_seconds", String(dsAvailSec), "availability")}
                        disabled={dsSaving === "availability"}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                          dsSavedKey === "departing_soon_auto_update_interval_seconds"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {dsSavedKey === "departing_soon_auto_update_interval_seconds"
                          ? <><Check className="h-3.5 w-3.5" /> Saved</>
                          : <><Save className="h-3.5 w-3.5" /> Save</>}
                      </button>
                      <button
                        type="button"
                        onClick={() => refreshNow("availability")}
                        disabled={dsRefreshing === "availability"}
                        title="Refresh spaces-remaining now"
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${dsRefreshing === "availability" ? "animate-spin" : ""}`} />
                        Refresh now
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Availability TTL */}
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4 align-middle">
                    <span className="text-xs font-medium text-foreground">Read-Time Availability TTL</span>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <p className="text-xs text-muted-foreground">
                      Minimum age before a homepage hit can trigger a fresh availability refresh.
                      Acts as the dedupe guard against thundering herds (default 20s).
                    </p>
                  </td>
                  <td className="px-5 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={10} max={120} step={5}
                          value={dsAvailTtlSec}
                          onChange={(e) => {
                            const sec = Math.max(10, Math.min(120, parseInt(e.target.value, 10) || 20))
                            setKeys((k) => ({ ...k, departing_soon_availability_ttl_seconds: String(sec) }))
                          }}
                          className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                        />
                        <span className="absolute right-3 text-xs text-muted-foreground/50 pointer-events-none">sec</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveDsKey("departing_soon_availability_ttl_seconds", String(dsAvailTtlSec), "availability")}
                        disabled={dsSaving === "availability"}
                        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                          dsSavedKey === "departing_soon_availability_ttl_seconds"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {dsSavedKey === "departing_soon_availability_ttl_seconds"
                          ? <><Check className="h-3.5 w-3.5" /> Saved</>
                          : <><Save className="h-3.5 w-3.5" /> Save</>}
                      </button>
                    </div>
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
