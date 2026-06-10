"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  RefreshCw, Download, CheckCircle2, XCircle,
  Info, ArrowLeft, ChevronDown, ChevronUp, Clock, Terminal,
  TriangleAlert,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ImportResult {
  ok: boolean
  imported?: number
  skipped?: number
  updated?: number
  total?: number
  apiErrors?: number
  note?: string
  error?: string
  log?: string[]
}

interface SyncLogEntry {
  id: string
  trigger_type: string
  action: string
  note: string | null
  changes: {
    ok?: boolean
    total?: number
    imported?: number
    updated?: number
    skipped?: number
    api_errors?: number
    override_mode?: boolean
    duration_ms?: number
    error?: string
    log?: string[]
    products?: { regiondoId: string; title: string; action: string; error?: string }[]
  } | null
  created_at: string
}

export default function RegiondoPage() {
  const [importing, setImporting]       = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError]   = useState("")
  const [showLog, setShowLog]           = useState(false)
  const [logs, setLogs]                 = useState<SyncLogEntry[]>([])
  const [logsLoading, setLogsLoading]   = useState(true)
  const [expandedLog, setExpandedLog]   = useState<string | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [confirmOpen, setConfirmOpen]   = useState(false)

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res  = await fetch("/api/admin/regiondo-logs?limit=5")
      const data = await res.json()
      if (data.ok) setLogs(data.logs ?? [])
    } catch { /* ignore */ } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  async function runImport(override = false) {
    setImporting(true)
    setImportResult(null)
    setImportError("")
    setShowLog(false)
    try {
      const res  = await fetch("/api/admin/regiondo-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override }),
      })
      const data = await res.json() as ImportResult
      setImportResult(data)
      if (!data.ok) setImportError(data.error ?? "Import failed — see log for details.")
      await fetchLogs()
    } catch {
      setImportError("Request failed — check your DMO / Regiondo keys in Admin Settings.")
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
            <Download className="h-6 w-6 text-primary" /> DMO Import
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Import trips from DMO (Regiondo) into our database.
          </p>
        </div>
      </div>

      {/* One-way notice */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2.5 text-xs text-blue-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>One-way only.</strong> DMO/Regiondo is the upstream source of truth — we never push data
          back. Only the <strong>static</strong> product catalog (descriptions, prices, variations &amp; ticket
          types) is stored. Live availability (dates, timeslots, remaining quantity) is fetched at view time
          and never persisted.
        </span>
      </div>

      {/* Action card */}
      <div className="grid gap-5 sm:grid-cols-2">

        {/* Import catalog */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Import Catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull the full product catalog from DMO/Regiondo and create new trips.
            Existing DMO trips are skipped unless you run an override import.
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
                Override existing DMO trips
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Re-fetch and overwrite all matching <strong>DMO (Regiondo)</strong> trips already in the
                database. Palisis trips are never touched. Leave unchecked to skip existing trips.
              </p>
            </div>
          </label>

          <button
            type="button"
            onClick={() => {
              if (overrideMode) {
                setConfirmOpen(true)
              } else {
                runImport(false)
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
                  Override DMO trip data — this cannot be undone
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    <p>
                      All existing <strong className="text-foreground">DMO (Regiondo)</strong> trips that match
                      a Regiondo product will be <strong className="text-foreground">overwritten</strong> —
                      titles, descriptions, prices, images, variations and ticket types. This cannot be undone.
                    </p>
                    <p className="text-muted-foreground">
                      <strong>Palisis trips are never affected</strong> — the override is scoped exclusively to
                      DMO/Regiondo trips. New trips will be created as normal.
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
                    runImport(true)
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

        {/* Credentials hint card */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Credentials</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The importer authenticates with your Regiondo Platform API <strong>Public Key</strong> and{" "}
            <strong>Secret Key</strong>. Add and test them in Admin Settings before running an import.
          </p>
          <Link
            href="/admin/integrations"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Manage DMO / Regiondo keys →
          </Link>
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
          <button
            type="button"
            onClick={fetchLogs}
            disabled={logsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {logsLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No import runs yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const c = log.changes ?? {}
              const expanded = expandedLog === log.id
              return (
                <li key={log.id} className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setExpandedLog(expanded ? null : log.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    {c.ok
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {log.note ?? log.action}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("en-GB")}
                        {c.override_mode ? " · override" : ""}
                      </p>
                    </div>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
                  </button>

                  {expanded && (
                    <div className="mt-3 space-y-2 rounded-lg bg-secondary/40 p-3 text-[11px]">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span><strong className="text-foreground">{c.total ?? 0}</strong> total</span>
                        <span><strong className="text-emerald-600">{c.imported ?? 0}</strong> imported</span>
                        <span><strong className="text-blue-600">{c.updated ?? 0}</strong> updated</span>
                        <span><strong>{c.skipped ?? 0}</strong> skipped</span>
                        {(c.api_errors ?? 0) > 0 && <span><strong className="text-amber-600">{c.api_errors}</strong> API errors</span>}
                      </div>
                      {c.error && <p className="text-destructive">{c.error}</p>}
                      {c.log && c.log.length > 0 && (
                        <pre className="max-h-40 overflow-y-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          {c.log.join("\n")}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
