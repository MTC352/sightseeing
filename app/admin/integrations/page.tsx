"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Save, Check, Eye, EyeOff, ExternalLink, AlertCircle,
  Cloud, Map, Bot, Zap, Globe, Star, RefreshCw, Calendar,
  KeyRound, Settings2, ChevronDown, Info, Sliders, SlidersHorizontal,
  CheckCircle2, XCircle, Loader2, ShieldCheck, Lock,
} from "lucide-react"
import TripFieldsPanel from "@/components/admin/trip-fields-panel"
import { FileRulesPanel } from "@/components/admin/file-rules-panel"
import { SecuritySettings } from "@/components/admin/security-settings"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  type SearchFilterKey,
  configKeyFor as searchFilterConfigKey,
  readSearchFiltersConfig,
} from "@/lib/search-filters-config"
import {
  AI_PROVIDERS,
  PROVIDER_LABELS,
  type AiProvider,
  effectiveProvider,
} from "@/lib/ai/models"

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
        testable: true,
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
        testable: true,
        secret: true,
      },
      {
        key: "openai",
        label: "OpenAI API Key",
        placeholder: "sk-…",
        hint: "Optional — the Vercel AI Gateway handles OpenAI by default.",
        docsUrl: "https://platform.openai.com/api-keys",
        testable: true,
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
        testable: true,
      },
    ],
  },
]

type ApiKeys = Record<string, string>
type Tab = "keys" | "settings" | "trip-fields" | "file-rules" | "security"

interface TestKeyResponse {
  ok: boolean
  service: string
  status?: number | string
  message: string
  details?: Record<string, unknown>
}

const inputBase =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"

export default function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>("keys")
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [keys, setKeys] = useState<ApiKeys>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, "ok" | "fail">>({})
  const [testModal, setTestModal] = useState<{ fieldKey: string; label: string } | null>(null)
  const [testModalData, setTestModalData] = useState<TestKeyResponse | null>(null)
  const [error, setError] = useState("")
  const [dsToggling, setDsToggling] = useState(false)
  const [dsSaving, setDsSaving] = useState<"discovery" | "availability" | null>(null)
  const [dsSavedKey, setDsSavedKey] = useState<string | null>(null)
  const [dsRefreshing, setDsRefreshing] = useState<"discovery" | "availability" | null>(null)
  const [dsCollapsed, setDsCollapsed] = useState(false)
  const [dsDirty, setDsDirty] = useState(false)
  const [dsSavedAll, setDsSavedAll] = useState(false)
  // LMD
  const [lmdCollapsed, setLmdCollapsed] = useState(false)
  const [lmdDirty, setLmdDirty] = useState(false)
  const [lmdSaving, setLmdSaving] = useState(false)
  const [lmdSaved, setLmdSaved] = useState(false)
  const [lmdToggling, setLmdToggling] = useState(false)
  // Trip Search Filters widget
  const [sfCollapsed, setSfCollapsed] = useState(false)
  const [sfToggling, setSfToggling] = useState(false)
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
    fetch("/api/admin/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setIsSuperadmin(me?.role === FULL_ACCESS_ROLE))
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
        departing_soon_availability_threshold: String(dsAvailThreshold),
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

  /** Toggle lmd_widget_enabled boolean. */
  async function toggleLmd(enabled: boolean) {
    setLmdToggling(true)
    setKeys((k) => ({ ...k, lmd_widget_enabled: enabled ? "true" : "false" }))
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: { lmd_widget_enabled: enabled ? "true" : "false" } }),
      })
    } catch { /* ignore */ }
    finally { setLmdToggling(false) }
  }

  /** Saves all editable LMD numeric settings in one PATCH. */
  async function saveLmdSettings() {
    setLmdSaving(true)
    try {
      const payload = {
        lmd_max_spaces: String(lmdMaxSpaces),
        lmd_max_hours: String(lmdMaxHours),
        lmd_max_cards: String(lmdMaxCards),
      }
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: payload }),
      })
      setLmdDirty(false)
      setLmdSaved(true)
      setTimeout(() => setLmdSaved(false), 2500)
    } catch { /* ignore */ }
    finally { setLmdSaving(false) }
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

  async function testKey(fieldKey: string, label: string) {
    setTesting(fieldKey)
    setTestModal({ fieldKey, label })
    setTestModalData(null)
    try {
      const payload: Record<string, string> = {
        service: fieldKey,
        key: keys[fieldKey] ?? "",
      }
      if (fieldKey === "palisis") {
        if (keys.palisisChannelId) payload.channelId = keys.palisisChannelId
        if (keys.palisisMarketplaceId) payload.marketplaceId = keys.palisisMarketplaceId
      }
      if (fieldKey === "googleReviews" && keys.googlePlaceId) {
        payload.placeId = keys.googlePlaceId
      }
      const res = await fetch("/api/admin/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as TestKeyResponse
      setTestModalData(data)
      setTestResult((p) => ({ ...p, [fieldKey]: data.ok ? "ok" : "fail" }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed"
      setTestModalData({ ok: false, service: fieldKey, message })
      setTestResult((p) => ({ ...p, [fieldKey]: "fail" }))
    } finally {
      setTesting(null)
    }
  }

  const dsWindowDays     = parseInt(keys.departing_soon_discovery_window_days ?? "7", 10) || 7
  const dsAvailSec       = parseInt(keys.departing_soon_auto_update_interval_seconds ?? "30", 10) || 30
  const dsAvailTtlSec    = parseInt(keys.departing_soon_availability_ttl_seconds ?? "20", 10) || 20
  const dsSlotCount      = parseInt(keys.departing_soon_slot_count ?? "5", 10) || 5
  const dsAvailThreshold = parseInt(keys.departing_soon_availability_threshold ?? "15", 10) || 15
  // Defaults: widget ON, show-availability ON, auto-update OFF
  const dsWidgetEnabled  = (keys.departing_soon_widget_enabled ?? "true") === "true"
  const dsShowAvail      = (keys.departing_soon_show_availability ?? "true") === "true"
  // Trip Search Filters — current config derived from apiKeys
  const sfConfig = readSearchFiltersConfig(keys as Record<string, string>)
  async function toggleSearchFilter(name: SearchFilterKey, enabled: boolean) {
    const k = searchFilterConfigKey(name)
    setSfToggling(true)
    setKeys((prev) => ({ ...prev, [k]: enabled ? "true" : "false" }))
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "apiKeys", data: { [k]: enabled ? "true" : "false" } }),
      })
    } catch {
      setKeys((prev) => ({ ...prev, [k]: enabled ? "false" : "true" }))
    } finally {
      setSfToggling(false)
    }
  }

  // LMD derived values
  const lmdEnabled    = (keys.lmd_widget_enabled ?? "true") === "true"
  const lmdMaxSpaces  = parseInt(keys.lmd_max_spaces ?? "3", 10) || 3
  const lmdMaxHours   = parseInt(keys.lmd_max_hours ?? "24", 10) || 24
  const lmdMaxCards   = parseInt(keys.lmd_max_cards ?? "3", 10) || 3

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Admin</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Admin Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage API keys, third-party service connections, and platform settings.
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
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setTab("file-rules")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "file-rules"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Set File upload Rules
          </button>
        )}
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setTab("security")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "security"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            Security
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab("trip-fields")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "trip-fields"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Manage Trip Fields
        </button>
      </div>

      {tab === "trip-fields" && <TripFieldsPanel />}

      {tab === "file-rules" && isSuperadmin && <FileRulesPanel />}

      {tab === "security" && isSuperadmin && <SecuritySettings />}

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
              {SECTIONS.flatMap((section) => {
                const rows = section.fields.map((field, fi) => {
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
                              onClick={() => testKey(field.key, field.label)}
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
                // Active AI provider selector — site-wide. Rendered right under
                // the AI Providers keys so everything AI-related lives together.
                // The chosen provider powers EVERY AI feature; switching
                // auto-remaps each AI System's model to the equivalent tier on
                // save. Only providers with a saved key are selectable.
                if (section.id === "ai") {
                  rows.push(
                    <tr key="ai-provider-selector" className="bg-muted/10">
                      <td colSpan={4} className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                          <span className="text-xs font-semibold text-foreground">Active AI Provider</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/50 max-w-xl">
                          Used for every AI feature across the site. A provider becomes selectable once its
                          API key above is saved. Switching providers auto-remaps each AI System&apos;s model
                          to the equivalent tier.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {AI_PROVIDERS.map((p) => {
                            // Reflect the provider actually used at runtime: if only
                            // one provider has a key it is auto-selected, even when
                            // `ai_provider` still holds the default. Env is unknown
                            // client-side, so the active marker is derived from the
                            // saved DB keys (the source of truth the admin edits here).
                            const active = effectiveProvider(keys, {}) === p
                            const hasKey = !!(keys[p] ?? "").trim()
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setKeys((k) => ({ ...k, ai_provider: p }))}
                                disabled={!hasKey}
                                title={hasKey ? undefined : `Add an ${PROVIDER_LABELS[p]} key first`}
                                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                  active
                                    ? "border-primary/50 bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                                {PROVIDER_LABELS[p]}
                                {active && <span className="text-[10px] font-semibold uppercase tracking-wide">Active</span>}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>,
                  )
                }
                return rows
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SETTINGS TAB ─────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="space-y-5">

          {/* Departing Soon Widget — collapsible */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setDsCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              aria-expanded={!dsCollapsed}
            >
              <Calendar className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">Departing Soon Widget</h2>
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
                  <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[260px_1fr] md:items-end">
                    <div className="flex flex-col gap-1.5">
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

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
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
                  </div>

                  {/* ROW 3 — Show Availability toggle paired with TTL + Refresh */}
                  <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[260px_1fr] md:items-end">
                    <label className="flex items-center gap-2 md:self-center">
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

                    {dsShowAvail && (
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Availability Pill Threshold</label>
                            <InfoTip text="Cards show an availability pill when spaces remaining is below this number. Upper half of the range shows amber, lower half shows red. Default: 15." />
                          </div>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min={1} max={999} step={1}
                              value={dsAvailThreshold}
                              onChange={(e) => {
                                const n = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 15))
                                setKeys((k) => ({ ...k, departing_soon_availability_threshold: String(n) }))
                                setDsDirty(true)
                              }}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-16"
                            />
                            <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">spaces</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
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

                  {/* ROW 4 — Auto-Update Availability toggle + Interval */}
                  {dsShowAvail && (
                    <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[260px_1fr] md:items-end">
                      <label className="flex items-center gap-2 md:self-center">
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
                        <div className="flex flex-col gap-1.5 max-w-md">
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

          {/* ── Last Minute Deals Widget ───────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setLmdCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              aria-expanded={!lmdCollapsed}
            >
              <Zap className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">Last Minute Deals Widget</h2>
              <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${lmdEnabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${lmdEnabled ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                {lmdEnabled ? "On" : "Off"}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground/50">Homepage widget</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground/60 transition-transform ${lmdCollapsed ? "" : "rotate-180"}`} />
            </button>

            {!lmdCollapsed && (
              <>
                <p className="border-b border-border bg-muted/10 px-5 py-3 text-[11px] text-muted-foreground">
                  Shows deals on the homepage when upcoming slots match <strong>all</strong> rules below.
                  Reuses the Departing Soon discovery + availability cache — no extra API calls.
                </p>

                {/* ROW 1 — Enable / Disable */}
                <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-[260px_1fr] md:items-center border-b border-border">
                  <label className="flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={lmdEnabled}
                      disabled={lmdToggling}
                      onClick={() => toggleLmd(!lmdEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed ${lmdEnabled ? "bg-emerald-500" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${lmdEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <span className="text-xs font-medium text-foreground select-none">Show Widget</span>
                    <InfoTip text="When ON, the 'Last Minute Deals' section is shown on the homepage whenever qualifying slots exist. When OFF, the section is hidden entirely." />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Deals are picked from the Departing Soon discovery cache — no extra TourCMS calls.
                  </p>
                </div>

                {/* ROW 2 — Rules */}
                {lmdEnabled && (
                  <div className="border-b border-border px-5 py-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deal Rules — a slot must match ALL conditions</p>
                    <div className="flex flex-wrap gap-4">

                      {/* Max spaces */}
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Spaces remaining ≤</label>
                          <InfoTip text="A slot qualifies as a Last Minute Deal only when spaces remaining is at or below this number. Default: 3." />
                        </div>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min={1} max={500} step={1}
                            value={lmdMaxSpaces}
                            onChange={(e) => {
                              const n = Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 3))
                              setKeys((k) => ({ ...k, lmd_max_spaces: String(n) }))
                              setLmdDirty(true)
                            }}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-16"
                          />
                          <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">spaces</span>
                        </div>
                      </div>

                      {/* Max hours */}
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Departing within</label>
                          <InfoTip text="Only slots departing within this many hours from now qualify. 24h = today, 48h = today + tomorrow, etc. Max 168h (7 days). Default: 24." />
                        </div>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min={1} max={168} step={1}
                            value={lmdMaxHours}
                            onChange={(e) => {
                              const n = Math.max(1, Math.min(168, parseInt(e.target.value, 10) || 24))
                              setKeys((k) => ({ ...k, lmd_max_hours: String(n) }))
                              setLmdDirty(true)
                            }}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-10"
                          />
                          <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">hrs</span>
                        </div>
                      </div>

                      {/* Max cards */}
                      <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Max Cards to Show</label>
                          <InfoTip text="Maximum number of deal cards displayed on the homepage. Qualifying slots are sorted soonest-first. Default: 3." />
                        </div>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min={1} max={12} step={1}
                            value={lmdMaxCards}
                            onChange={(e) => {
                              const n = Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 3))
                              setKeys((k) => ({ ...k, lmd_max_cards: String(n) }))
                              setLmdDirty(true)
                            }}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 pr-14"
                          />
                          <span className="absolute right-3 text-[10px] text-muted-foreground/50 pointer-events-none">cards</span>
                        </div>
                      </div>

                    </div>

                    {/* Rule summary */}
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-[11px] text-muted-foreground">
                      <strong className="text-foreground">Active rule:</strong>{" "}
                      Show up to <strong className="text-foreground">{lmdMaxCards}</strong> deal
                      {lmdMaxCards !== 1 ? "s" : ""} where spaces remaining
                      is <strong className="text-foreground">≤ {lmdMaxSpaces}</strong> and departure
                      is within <strong className="text-foreground">{lmdMaxHours}h</strong> from now.
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/10 px-5 py-3">
                  {lmdDirty && !lmdSaved && (
                    <span className="text-[11px] font-medium text-amber-600">Unsaved changes</span>
                  )}
                  <button
                    type="button"
                    onClick={saveLmdSettings}
                    disabled={lmdSaving || (!lmdDirty && !lmdSaved)}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      lmdSaved
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {lmdSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    {lmdSaved ? "Saved" : lmdSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Trip Search Filters Widget ─────────────────────────────
              Controls which filter widgets appear inside the Filters modal
              on the public /search page. Each toggle persists immediately. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setSfCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 border-b border-border px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              aria-expanded={!sfCollapsed}
            >
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground/50" />
              <h2 className="text-sm font-semibold text-foreground">Trip Search Filters</h2>
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {(Object.values(sfConfig).filter(Boolean) as boolean[]).length} of {Object.keys(sfConfig).length} on
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground/50">/search filter modal</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground/60 transition-transform ${sfCollapsed ? "" : "rotate-180"}`} />
            </button>

            {!sfCollapsed && (
              <>
                <p className="border-b border-border bg-muted/10 px-5 py-3 text-[11px] text-muted-foreground">
                  Toggle which filter widgets appear in the Filters modal on the
                  public Search Results page. Disabled filters are hidden from
                  end users AND ignored by the result list (so stale URL values
                  cannot accidentally hide trips).
                </p>

                <div className="divide-y divide-border">
                  {([
                    {
                      key: "location" as SearchFilterKey,
                      label: "Location",
                      hint: "Address autocomplete input. Uses Mapbox forward geocoding to resolve a lat/lng for the user. Required for the Radius filter to work.",
                    },
                    {
                      key: "radius" as SearchFilterKey,
                      label: "Search radius",
                      hint: "Pills (1 / 2 / 5 / 10 / 20 / 50 km). Filters trips by haversine distance from the resolved user location to each trip's Palisis departure geocode. Disabled when Location is OFF.",
                      requires: "location" as SearchFilterKey,
                    },
                    {
                      key: "price" as SearchFilterKey,
                      label: "Price range",
                      hint: "Min/Max € inputs. Filters trips by their list price (Palisis trip price).",
                    },
                    {
                      key: "rating" as SearchFilterKey,
                      label: "Minimum rating",
                      hint: "HOLD — keep OFF until Google Business linkage is wired up. We need a real rating per trip (from Google Reviews via google_business_url) before this becomes useful. Enabling it now would hide most trips because their rating is 0.",
                      hold: true,
                    },
                    {
                      key: "duration" as SearchFilterKey,
                      label: "Max duration",
                      hint: "Pills (Up to 1h / 2h / 3h / 4h / 6h / 8h / Any). Smart parser handles 'Full Day', 'Half Day', '1 - 2 hours', '75 minutes' and the multi-option strings (e.g. 'Full Day: 7H / Half Day: 4H' → keeps trip if 4h fits). Trips with unknown duration ('TBC', 'check timetable') are kept visible.",
                    },
                    {
                      key: "tags" as SearchFilterKey,
                      label: "Tour Tags",
                      hint: "Multi-select pills built from Palisis trip_tags. Internal flags (e.g. operator-direct-product) are auto-hidden.",
                    },
                    {
                      key: "type" as SearchFilterKey,
                      label: "Tour Type",
                      hint: "Multi-select pills built from Palisis tour_type (e.g. 'Day tour/trip/activity/attraction'). Optional.",
                    },
                  ] as { key: SearchFilterKey; label: string; hint: string; requires?: SearchFilterKey; hold?: boolean }[])
                    .map((row) => {
                      const enabled = sfConfig[row.key]
                      const blocked = row.requires ? !sfConfig[row.requires] : false
                      return (
                        <div key={row.key} className="flex flex-col gap-2 px-5 py-3.5 md:flex-row md:items-start md:gap-4">
                          <label className="flex items-start gap-2 md:min-w-[220px]">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              disabled={sfToggling || blocked}
                              onClick={() => toggleSearchFilter(row.key, !enabled)}
                              className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                enabled ? "bg-emerald-500" : "bg-muted"
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                            </button>
                            <span className="text-xs font-medium text-foreground">
                              {row.label}
                              {row.hold && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                                  Hold
                                </span>
                              )}
                            </span>
                            <InfoTip text={row.hint} />
                          </label>
                          <p className="text-[11px] leading-relaxed text-muted-foreground/70 md:flex-1">
                            {row.hint}
                            {blocked && (
                              <span className="ml-1 font-medium text-amber-600">
                                Enable Location first.
                              </span>
                            )}
                          </p>
                        </div>
                      )
                    })}
                </div>
              </>
            )}
          </div>

        </div>
      )}

      <Dialog open={!!testModal} onOpenChange={(open) => { if (!open) { setTestModal(null); setTestModalData(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {!testModalData ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : testModalData.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {testModal?.label} — {!testModalData ? "Testing…" : testModalData.ok ? "Connection valid" : "Connection failed"}
            </DialogTitle>
            <DialogDescription>
              {!testModalData
                ? "Contacting the provider to validate this key…"
                : "Live result from the provider. Failed tests are also recorded in Logs."}
            </DialogDescription>
          </DialogHeader>

          {testModalData && (
            <div className="space-y-3 text-sm">
              <div
                className={`rounded-lg border p-3 ${
                  testModalData.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {testModalData.message}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Service</dt>
                <dd className="font-mono text-foreground">{testModalData.service}</dd>
                {testModalData.status !== undefined && (
                  <>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-mono text-foreground">{String(testModalData.status)}</dd>
                  </>
                )}
              </dl>

              {testModalData.details && Object.keys(testModalData.details).length > 0 && (
                <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(testModalData.details, null, 2)}
                </pre>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
