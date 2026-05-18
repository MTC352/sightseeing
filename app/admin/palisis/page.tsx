"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  RefreshCw, Download, CheckCircle2, XCircle,
  Info, ArrowLeft, ChevronDown, ChevronUp, Clock, Terminal,
  TriangleAlert, Webhook, Copy, Check,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ImportResult {
  ok: boolean
  import_mode?: "marketplace" | "operator"
  imported?: number
  skipped?: number
  updated?: number
  total?: number
  apiErrors?: number
  note?: string
  error?: string
  log?: string[]
  slots?: { tripId: string; tripTitle: string; startDate: string; startTime?: string; priceDisplay: string; spacesRemaining: number | null; status: string }[]
}

interface SyncLogEntry {
  id: string
  trigger_type: string
  action: string
  note: string | null
  changes: {
    ok?: boolean
    import_mode?: string
    total?: number
    imported?: number
    updated?: number
    skipped?: number
    api_errors?: number
    duration_ms?: number
    error?: string
    log?: string[]
    tours?: { palisisId: string; title: string; action: string; error?: string }[]
  } | null
  created_at: string
}

export default function PalisisPage() {
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError]   = useState("")
  const [showLog, setShowLog]           = useState(false)
  const [logs, setLogs]                 = useState<SyncLogEntry[]>([])
  const [logsLoading, setLogsLoading]   = useState(true)
  const [expandedLog, setExpandedLog]   = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [confirmOpen, setConfirmOpen]   = useState(false)
  const [autoSync, setAutoSync]         = useState(false)
  const [autoSyncSaving, setAutoSyncSaving] = useState(false)
  const [webhookUrl, setWebhookUrl]     = useState("")
  const [copied, setCopied]             = useState(false)

  // Load auto-sync setting + compute webhook URL on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/webhooks/palisis`)
    }
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(d => {
        const enabled = d?.apiKeys?.palisis_auto_sync === "true"
        setAutoSync(enabled)
      })
      .catch(() => { /* ignore */ })
  }, [])

  async function toggleAutoSync(enabled: boolean) {
    setAutoSyncSaving(true)
    setAutoSync(enabled)
    try {
      await fetch("/api/admin/settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          section: "apiKeys",
          data:    { palisis_auto_sync: enabled ? "true" : "false" },
        }),
      })
    } catch {
      setAutoSync(!enabled)
    } finally {
      setAutoSyncSaving(false)
    }
  }

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res  = await fetch("/api/admin/palisis-logs?limit=5")
      const data = await res.json()
      if (data.ok) setLogs(data.logs ?? [])
    } catch { /* ignore */ } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  async function runImport() {
    setImporting(true)
    setImportResult(null)
    setImportError("")
    setShowLog(false)
    try {
      const res  = await fetch("/api/admin/palisis-import", { method: "POST" })
      const data = await res.json() as ImportResult
      setImportResult(data)
      if (!data.ok) setImportError(data.error ?? "Import failed — see log for details.")
      await fetchLogs()
    } catch {
      setImportError("Request failed — check your API key and Channel ID in Integrations.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Integrations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
            <RefreshCw className="h-6 w-6 text-primary" /> Palisis / TourCMS Import
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Import trips from TourCMS into our database.
          </p>
        </div>
      </div>


      {/* Action cards */}
      <div className="grid gap-5 sm:grid-cols-2">

        {/* Import catalog */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Import Catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull the full trip catalog from TourCMS and create new trips in draft status for review.
            Existing trips are skipped unless you run an override import.
          </p>

          {/* Override checkbox */}
          <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
            overrideMode
              ? "border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20"
              : "border-border bg-secondary/30 hover:bg-secondary/50"
          }`}>
            <input
              type="checkbox"
              checked={overrideMode}
              onChange={(e) => setOverrideMode(e.target.checked)}
              disabled={importing}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
            />
            <div>
              <p className={`text-xs font-semibold ${overrideMode ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                Override existing trips
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Re-fetch and overwrite all matching trips already in the database.
                Leave unchecked to skip existing trips.
              </p>
            </div>
          </label>

          <button
            type="button"
            onClick={() => {
              if (overrideMode) {
                setConfirmOpen(true)
              } else {
                runImport()
              }
            }}
            disabled={importing}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${importing ? "animate-bounce" : ""}`} />
            {importing ? "Importing…" : "Run Import"}
          </button>

          {/* Override confirmation dialog */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="h-5 w-5 shrink-0" />
                  Override trip data — this cannot be undone
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    <p>
                      All existing trips that match a TourCMS tour will be{" "}
                      <strong className="text-foreground">overwritten</strong> — titles, descriptions, prices, images, and tags.
                      This cannot be undone.
                    </p>
                    <p className="text-muted-foreground">
                      New trips will be created in draft status as normal.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmOpen(false)
                    setImporting(true)
                    setImportResult(null)
                    setImportError("")
                    setShowLog(false)
                    fetch("/api/admin/palisis-import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ override: true }),
                    })
                      .then(r => r.json())
                      .then(async (data: ImportResult) => {
                        setImportResult(data)
                        if (!data.ok) setImportError(data.error ?? "Import failed.")
                        await fetchLogs()
                      })
                      .catch(() => setImportError("Request failed."))
                      .finally(() => setImporting(false))
                  }}
                  className="bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-600"
                >
                  Yes, override and import
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {importError && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{importError}</span>
              </div>
            </div>
          )}

          {importResult && (
            <div className={`mt-3 rounded-lg border px-4 py-3 text-xs ${importResult.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-destructive/20 bg-destructive/10"}`}>
              <div className="flex items-center gap-2 font-medium">
                {importResult.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className={importResult.ok ? "text-emerald-600" : "text-destructive"}>
                  {importResult.ok ? "Import complete" : "Import failed"}
                </span>
                {importResult.import_mode && (
                  <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {importResult.import_mode === "operator" ? "Tour Operator" : "Marketplace"} mode
                  </span>
                )}
              </div>

              {importResult.ok && (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span><strong className="text-foreground">{importResult.total}</strong> in catalog</span>
                    <span><strong className="text-emerald-600">{importResult.imported ?? 0}</strong> imported</span>
                    {(importResult.updated ?? 0) > 0 && <span><strong className="text-blue-600">{importResult.updated}</strong> updated</span>}
                    <span><strong className="text-muted-foreground">{importResult.skipped ?? 0}</strong> skipped</span>
                    {(importResult.apiErrors ?? 0) > 0 && <span><strong className="text-amber-600">{importResult.apiErrors}</strong> API errors</span>}
                  </div>
                  {importResult.note && <p className="text-muted-foreground/60 italic">{importResult.note}</p>}
                </div>
              )}

              {importResult.ok && (importResult.imported ?? 0) > 0 && (
                <Link href="/admin/trips" className="mt-2 flex items-center gap-1 text-primary hover:underline">
                  Review new trips →
                </Link>
              )}

              {importResult.log && importResult.log.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowLog(v => !v)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground"
                  >
                    <Terminal className="h-3 w-3" />
                    {showLog ? "Hide" : "Show"} import log
                    {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {showLog && (
                    <pre className="mt-1.5 max-h-40 overflow-y-auto rounded bg-secondary/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {importResult.log.join("\n")}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Auto-Sync via Webhook */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Webhook className="h-5 w-5 text-violet-600" />
            </div>

            {/* Toggle switch */}
            <label className="flex cursor-pointer items-center gap-2.5">
              <span className={`text-xs font-semibold ${autoSync ? "text-emerald-600" : "text-muted-foreground"}`}>
                {autoSync ? "Enabled" : "Disabled"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSync}
                disabled={autoSyncSaving}
                onClick={() => toggleAutoSync(!autoSync)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60 ${
                  autoSync ? "bg-emerald-500" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    autoSync ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          </div>

          <h2 className="text-base font-semibold text-foreground">Auto-Sync via Webhook</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When enabled, Palisis can push trip-update events to our webhook URL and we
            automatically re-fetch and override that single trip. When disabled, incoming
            webhooks are logged but ignored.
          </p>

          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-700">
            <Info className="h-3 w-3" /> One-way only — we never push data back to Palisis.
          </p>

          {/* Webhook URL */}
          <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Webhook URL
              </p>
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                POST
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                {webhookUrl || "Loading…"}
              </code>
              <button
                type="button"
                onClick={copyWebhookUrl}
                disabled={!webhookUrl}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {copied ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy</>
                )}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Configure this URL in TourCMS → Webhooks. Payload should include the tour ID as{" "}
              <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">tour_id</code>.
              Optional auth via <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">x-palisis-secret</code> header.
            </p>
          </div>
        </div>
      </div>

      {/* Import run history */}
      <div className="mt-6 rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground/50" />
            <h2 className="text-sm font-semibold text-foreground">Import History</h2>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Latest 5</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={logsLoading}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${logsLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <Link
              href="/admin/palisis/history"
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              View All
            </Link>
          </div>
        </div>

        {logsLoading ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">
            No import runs yet. Click "Run Import" to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((entry) => {
              const ok      = entry.changes?.ok !== false
              const isOpen  = expandedLog === entry.id
              const ch      = entry.changes ?? {}

              return (
                <div key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedLog(isOpen ? null : entry.id)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-secondary/30"
                  >
                    {ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {entry.action === "import_run" ? "Import Run" : entry.action}
                        </span>
                        {ch.import_mode && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {ch.import_mode === "operator" ? "Operator" : "Marketplace"}
                          </span>
                        )}
                        {ok && ch.total != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {ch.total} tours · {ch.imported ?? 0} imported · {ch.skipped ?? 0} skipped
                            {ch.duration_ms ? ` · ${(ch.duration_ms / 1000).toFixed(1)}s` : ""}
                          </span>
                        )}
                      </div>
                      {entry.note && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{entry.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground/50">
                      <span>{new Date(entry.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border bg-secondary/20 px-5 pb-4 pt-3">
                      {ch.error && (
                        <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {ch.error}
                        </div>
                      )}

                      {ch.tours && ch.tours.length > 0 && (
                        <div className="mb-3 overflow-hidden rounded-lg border border-border">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="border-b border-border bg-secondary/50">
                                <th className="px-2 py-1.5 text-left text-muted-foreground/60">Palisis ID</th>
                                <th className="px-2 py-1.5 text-left text-muted-foreground/60">Trip</th>
                                <th className="px-2 py-1.5 text-left text-muted-foreground/60">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ch.tours.slice(0, 20).map((t, i) => (
                                <tr key={i} className="border-b border-border last:border-0">
                                  <td className="px-2 py-1 font-mono text-muted-foreground">{t.palisisId}</td>
                                  <td className="max-w-[200px] truncate px-2 py-1 text-muted-foreground">{t.title}</td>
                                  <td className={`px-2 py-1 font-medium ${
                                    t.action === "created" ? "text-emerald-600"
                                    : t.action === "updated" ? "text-blue-600"
                                    : t.action.includes("error") ? "text-destructive"
                                    : "text-muted-foreground"
                                  }`}>
                                    {t.action}{t.error ? ` (${t.error})` : ""}
                                  </td>
                                </tr>
                              ))}
                              {ch.tours.length > 20 && (
                                <tr>
                                  <td colSpan={3} className="px-2 py-1.5 text-center text-muted-foreground/60">
                                    +{ch.tours.length - 20} more — check full log below
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {ch.log && ch.log.length > 0 && (
                        <pre className="max-h-48 overflow-y-auto rounded-lg bg-secondary/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {ch.log.join("\n")}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
