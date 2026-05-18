"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Save, Check, Eye, EyeOff, ExternalLink, AlertCircle,
  Cloud, Map, Bot, Zap, Globe, Star, RefreshCw, Calendar,
  KeyRound, Settings2, ChevronDown, Info,
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
  const [dsCollapsed, setDsCollapsed] = useState(false)
  const [dsDirty, setDsDirty] = useState(false)
  const [dsSavedAll, setDsSavedAll] = useState(false)
  const [dsStatus, setDsStatus] = useState<{
    tourcmsConfigured: boolean | null
    lastDiscoveryAt: string | null
    lastAvailabilityAt: string | null
    discoveryExpiresAt?: string | null
    daysFetched?: number
    totalSlotsCached?: number
    tripsChecked?: number
    failedTripCount?: number
  }>({ tourcmsConfigured: null, lastDiscoveryAt: null, lastAvailabilityAt: null })

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        const apiKeys = (s?.apiKeys ?? {}) as ApiKeys
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
        discoveryExpiresAt: data.discoveryExpiresAt ?? null,
        daysFetched: data.daysFetched,
        totalSlotsCached: data.totalSlotsCached,
        tripsChecked: data.tripsChecked,
        failedTripCount: data.failedTripCount,
      })
    } catch { /* ignore */ }
  }

  async function refreshNow(kind: "discovery" | "availability") {
    setDsRefreshing(kind)
    try {
      const url = kind === "discovery"
        ? "/api/admin/refresh-discovery"
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

  /** Saves all editable Departing Soon numeric settings in one PATCH. */
  async function saveAllDsSettings() {
    setDsSaving("discovery")
    try {
      const payload = {
        departing_soon_slot_count: String(dsSlotCount),
        departing_soon_discovery_window_days: String(dsWindowDays),
        departing_soon_availability_ttl_seconds: String(dsAvailTtlSec),
        departing_soon_auto_update_interval_seconds: String(dsAvailSec),
      }
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: payload }),
      })
      setDsDirty(false)
      setDsSavedAll(true)
      setTimeout(() => setDsSavedAll(false), 2500)
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
    return toggleDsBool("departing_soon_auto_update", enabled)
  }

  /** Generic boolean toggle for any departing_soon_* flag. Optimistic + revert on failure. */
  async function toggleDsBool(key: string, enabled: boolean) {
    setDsToggling(true)
    setKeys((k) => ({ ...k, [key]: enabled ? "true" : "false" }))
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "apiKeys",
          data: { [key]: enabled ? "true" : "false" },
        }),
      })
    } catch {
      setKeys((k) => ({ ...k, [key]: enabled ? "false" : "true" }))
    } finally {
      setDsToggling(false)
    }
  }

  function fmtTs(iso: string | null): string {
    if (!iso) return "never"
    const ts = new Date(iso).getTime()
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff >= 0) {
      if (diff < 60) return `${diff}s ago`
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      return new Date(iso).toLocaleString("en-GB")
    }
    // future
    const fwd = -diff
    if (fwd < 60) return `in ${fwd}s`
    if (fwd < 3600) return `in ${Math.floor(fwd / 60)}m`
    if (fwd < 86400) return `in ${Math.floor(fwd / 3600)}h`
    const days = Math.floor(fwd / 86400)
    const hours = Math.floor((fwd % 86400) / 3600)
    return hours > 0 ? `in ${days}d ${hours}h` : `in ${days}d`
  }

  /** CSS-only tooltip that actually appears on hover (title= attribute is unreliable on tiny SVG icons). */
  function InfoTip({ text }: { text: string }) {
    return (
      <span className="relative inline-flex group">
        <Info className="h-3 w-3 cursor-help text-muted-foreground/50 group-hover:text-foreground transition-colors" />
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden -translate-x-1/2 whitespace-normal rounded-md border border-border bg-popover px-3 py-2 text-[11px] font-normal leading-relaxed text-popover-foreground shadow-lg group-hover:block w-64">
          {text}
        </span>
      </span>
    )
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

  const dsWindowDays     = parseInt(keys.departing_soon_discovery_window_days ?? "7", 10) || 7
  const dsAvailSec       = parseInt(keys.departing_soon_auto_update_interval_seconds ?? "30", 10) || 30
  const dsAvailTtlSec    = parseInt(keys.departing_soon_availability_ttl_seconds ?? "20", 10) || 20
  const dsSlotCount      = parseInt(keys.departing_soon_slot_count ?? "5", 10) || 5
  // Defaults: widget ON, show-availability ON, auto-update OFF
  const dsWidgetEnabled  = (keys.departing_soon_widget_enabled ?? "true") === "true"
  const dsShowAvail      = (keys.departing_soon_show_availability ?? "true") === "true"

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

          {/* Departing Soon Block — collapsible */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setDsCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              aria-expanded={!dsCollapsed}
            >
              <Calendar className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">Departing Soon Block</h2>
              <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dsWidgetEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dsWidgetEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                {dsWidgetEnabled ? "On" : "Off"}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground/50">Homepage widget</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground/60 transition-transform ${dsCollapsed ? "" : "rotate-180"}`} />
            </button>
            {!dsCollapsed && (
            <>
            

            {/* Missing credentials banner */}
            {dsStatus.tourcmsConfigured === false && (
              <div className="border-b border-destructive/20 bg-destructive/10 px-5 py-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                TourCMS credentials missing — the widget is hidden on the public site. Add the
                Palisis API key + Channel ID on the API Keys tab to enable it.
              </div>
            )}

            {/* Compact status strip */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border bg-muted/20 px-5 py-2.5 text-[11px] text-muted-foreground">
              <span><span className="text-muted-foreground/60">Last updated:</span> <strong className="text-foreground">{fmtTs(dsStatus.lastDiscoveryAt)}</strong></span>
              {dsStatus.tripsChecked !== undefined && (
                <span className="text-muted-foreground/60">{dsStatus.tripsChecked - (dsStatus.failedTripCount ?? 0)}/{dsStatus.tripsChecked} tours</span>
              )}
              {dsStatus.discoveryExpiresAt && (
                <span><span className="text-muted-foreground/60">Next auto-refresh:</span> <strong className="text-foreground">{fmtTs(dsStatus.discoveryExpiresAt ?? null)}</strong></span>
              )}
              {typeof dsStatus.totalSlotsCached === "number" && (
                <span><span className="text-muted-foreground/60">Stored departures:</span> <strong className="text-foreground">{dsStatus.totalSlotsCached}</strong></span>
              )}
              <span className="ml-auto"><span className="text-muted-foreground/60">Availability checked:</span> <strong className="text-foreground">{fmtTs(dsStatus.lastAvailabilityAt)}</strong></span>
            </div>

            {/* ── Settings cascade ─────────────────────────────────── */}
            <div className="divide-y divide-border">

              {/* ROW 1 — Show Widget on Homepage (master) */}
              <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                <label className="flex items-center gap-2 md:min-w-[260px]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dsWidgetEnabled}
                    disabled={dsToggling}
                    onClick={() => toggleDsBool("departing_soon_widget_enabled", !dsWidgetEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${dsWidgetEnabled ? "bg-emerald-500" : "bg-muted"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${dsWidgetEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <span className="text-xs font-medium text-foreground select-none">Show Widget on Homepage</span>
                  <InfoTip text="Master on/off switch. When OFF, the homepage widget is completely hidden and both refresh paths skip all Palisis calls — zero API usage from this feature." />
                </label>
                {!dsWidgetEnabled && (
                  <span className="text-[11px] text-muted-foreground italic md:ml-auto">
                    All other settings are disabled while the widget is hidden.
                  </span>
                )}
              </div>

              {/* When widget is ON, reveal everything else */}
              {dsWidgetEnabled && (
                <>
                  {/* ROW 2 — No. of Trips + Dates & Deals Store Interval + Refresh Discovery */}
                  <div className="flex flex-wrap items-end gap-4 px-5 py-4">
                    <div className="flex flex-col gap-1.5 min-w-[180px]">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">No. of Trips to Show</label>
                        <InfoTip text="How many upcoming departures appear in the widget (3–10). Discovery scans every published trip, then keeps the earliest N (one per trip)." />
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={3} max={10} step={1}
                          value={dsSlotCount}
                          onChange={(e) => {
                            const n = Math.max(3, Math.min(10, parseInt(e.target.value, 10) || 5))
                            setKeys((k) => ({ ...k, departing_soon_slot_count: String(n) }))
                            setDsDirty(true)
                          }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-12"
                        />
                        <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">trips</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 min-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dates and Deals Store Interval</label>
                        <InfoTip text="How many days of upcoming departures to pre-fetch from Palisis. One datesndeals call per trip covers the whole window. The cache stays valid until the window expires — no periodic job. Use Refresh Discovery to rebuild on demand." />
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={3} max={30} step={1}
                          value={dsWindowDays}
                          onChange={(e) => {
                            const n = Math.max(3, Math.min(30, parseInt(e.target.value, 10) || 7))
                            setKeys((k) => ({ ...k, departing_soon_discovery_window_days: String(n) }))
                            setDsDirty(true)
                          }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-12"
                        />
                        <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">days</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => refreshNow("discovery")}
                      disabled={dsRefreshing === "discovery"}
                      title="Re-fetch the full window of dates+deals for every trip"
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${dsRefreshing === "discovery" ? "animate-spin" : ""}`} />
                      Refresh Discovery
                    </button>
                  </div>

                  {/* ROW 3 — Show Availability toggle (always visible when widget on) */}
                  <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                    <label className="flex items-center gap-2 md:min-w-[260px]">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={dsShowAvail}
                        disabled={dsToggling}
                        onClick={() => toggleDsBool("departing_soon_show_availability", !dsShowAvail)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${dsShowAvail ? "bg-emerald-500" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${dsShowAvail ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <span className="text-xs font-medium text-foreground select-none">Show Timeslot Availability</span>
                      <InfoTip text="When ON, cards display real-time spaces-remaining (Limited availability / Only N left). When OFF, those pills are hidden AND the availability refresh stops — saves up to ~14,400 Palisis calls/day." />
                    </label>

                    {/* Read-Time Availability TTL — paired side-by-side with the toggle */}
                    {dsShowAvail && (
                      <div className="flex items-end gap-2 md:ml-auto">
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Read-Time Availability TTL</label>
                            <InfoTip text="Minimum age before a homepage hit can trigger a fresh availability refresh. Acts as a dedupe guard against thundering herds (default 20s)." />
                          </div>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min={10} max={120} step={5}
                              value={dsAvailTtlSec}
                              onChange={(e) => {
                                const sec = Math.max(10, Math.min(120, parseInt(e.target.value, 10) || 20))
                                setKeys((k) => ({ ...k, departing_soon_availability_ttl_seconds: String(sec) }))
                                setDsDirty(true)
                              }}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                            />
                            <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">sec</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => refreshNow("availability")}
                          disabled={dsRefreshing === "availability"}
                          title="Refresh spaces-remaining for the currently displayed slots"
                          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${dsRefreshing === "availability" ? "animate-spin" : ""}`} />
                          Refresh Now
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ROW 4 — Auto-Update Availability toggle + Interval (when ON) */}
                  {dsShowAvail && (
                    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                      <label className="flex items-center gap-2 md:min-w-[260px]">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={keys.departing_soon_auto_update === "true"}
                          disabled={dsToggling}
                          onClick={() => toggleDsAutoUpdate(keys.departing_soon_auto_update !== "true")}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${
                            keys.departing_soon_auto_update === "true" ? "bg-emerald-500" : "bg-muted"
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${keys.departing_soon_auto_update === "true" ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                        <span className="text-xs font-medium text-foreground select-none">Auto-Update Availability</span>
                        <InfoTip text="When ON, a background job refreshes spaces-remaining for the currently displayed slots every N seconds. When OFF, availability refreshes lazily on each homepage hit (TTL-gated)." />
                      </label>

                      {keys.departing_soon_auto_update === "true" && (
                        <div className="flex items-end gap-2 md:ml-auto">
                          <div className="flex flex-col gap-1.5 min-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Auto-Update Availability Interval</label>
                              <InfoTip text="How often the background job refreshes spaces-remaining for the currently displayed slots. Lower values = more accurate, higher API usage." />
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                min={15} max={300} step={5}
                                value={dsAvailSec}
                                onChange={(e) => {
                                  const sec = Math.max(15, Math.min(300, parseInt(e.target.value, 10) || 30))
                                  setKeys((k) => ({ ...k, departing_soon_auto_update_interval_seconds: String(sec) }))
                                  setDsDirty(true)
                                }}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                              />
                              <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">sec</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer — single Save button per widget */}
            <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/10 px-5 py-3">
              {dsDirty && !dsSavedAll && (
                <span className="text-[11px] font-medium text-amber-600">Unsaved changes</span>
              )}
              <button
                type="button"
                onClick={saveAllDsSettings}
                disabled={dsSaving !== null || (!dsDirty && !dsSavedAll)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  dsSavedAll
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {dsSavedAll ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {dsSavedAll ? "Saved" : dsSaving ? "Saving…" : "Save"}
              </button>
            </div>

            </>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
