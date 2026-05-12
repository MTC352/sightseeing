"use client"

import { useState } from "react"
import Link from "next/link"
import { RefreshCw, Download, CheckCircle2, XCircle, AlertCircle, Info, ArrowLeft, Calendar } from "lucide-react"

interface ImportResult {
  ok: boolean
  imported?: number
  skipped?: number
  total?: number
  note?: string
  updated?: number
  slots?: { tripId: string; tripTitle: string; date: string; spotsAvailable: number; spotsTotal: number }[]
}

export default function PalisisPage() {
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState("")
  const [syncError, setSyncError] = useState("")

  async function runImport() {
    setImporting(true)
    setImportResult(null)
    setImportError("")
    try {
      const res = await fetch("/api/admin/palisis-import", { method: "POST" })
      const data = await res.json()
      setImportResult(data)
    } catch {
      setImportError("Request failed — check your Palisis API key in Integrations.")
    } finally {
      setImporting(false)
    }
  }

  async function runSync() {
    setSyncing(true)
    setSyncResult(null)
    setSyncError("")
    try {
      const res = await fetch("/api/admin/palisis-availability", { method: "POST" })
      const data = await res.json()
      setSyncResult(data)
    } catch {
      setSyncError("Request failed — check your Palisis API key in Integrations.")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-6 lg:p-10">
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
            <RefreshCw className="h-6 w-6 text-primary" /> Palisis Import
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Import trips and sync availability from the Palisis booking engine.</p>
        </div>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Trips are imported from TourCMS into our database and served from there — no live Palisis calls are made on the public site.
          Configure your API key and Channel ID in{" "}
          <Link href="/admin/integrations" className="text-primary underline-offset-2 hover:underline">Integrations</Link>{" "}
          before running an import.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Import catalog */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Import Catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull the full trip catalog from Palisis and create new trips in draft status for review.
          </p>

          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className={`h-4 w-4 ${importing ? "animate-bounce" : ""}`} />
            {importing ? "Importing…" : "Run Import"}
          </button>

          {importError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5 shrink-0" /> {importError}
            </div>
          )}

          {importResult && (
            <div className={`mt-3 rounded-lg border px-4 py-3 text-xs ${importResult.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-destructive/20 bg-destructive/10"}`}>
              <div className="flex items-center gap-2 font-medium">
                {importResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className={importResult.ok ? "text-emerald-600" : "text-destructive"}>
                  {importResult.ok ? "Import complete" : "Import failed"}
                </span>
              </div>
              {importResult.ok && (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>{importResult.imported} trips imported · {importResult.skipped} skipped · {importResult.total} in catalog</p>
                  {importResult.note && <p className="text-muted-foreground/60 italic">{importResult.note}</p>}
                </div>
              )}
              {importResult.ok && (
                <Link href="/admin/trips" className="mt-2 flex items-center gap-1 text-primary hover:underline">
                  Review new trips →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Sync availability */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Calendar className="h-5 w-5 text-amber-600" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Sync Availability</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Update departure slots and available spots for all existing trips without a full re-import.
          </p>

          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Availability"}
          </button>

          {syncError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5 shrink-0" /> {syncError}
            </div>
          )}

          {syncResult && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600">Availability updated</span>
              </div>
              <p className="mt-1.5 text-muted-foreground">{syncResult.updated} slot records refreshed</p>
              {syncResult.note && <p className="mt-1 text-muted-foreground/60 italic">{syncResult.note}</p>}

              {syncResult.slots && syncResult.slots.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-2 py-1.5 text-left text-muted-foreground/60">Trip</th>
                        <th className="px-2 py-1.5 text-left text-muted-foreground/60">Date</th>
                        <th className="px-2 py-1.5 text-right text-muted-foreground/60">Spots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncResult.slots.slice(0, 8).map((s, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]">{s.tripTitle.split(" ").slice(0, 3).join(" ")}</td>
                          <td className="px-2 py-1.5 font-mono text-muted-foreground">{s.date}</td>
                          <td className={`px-2 py-1.5 text-right font-semibold ${s.spotsAvailable === 0 ? "text-destructive" : s.spotsAvailable < 4 ? "text-amber-600" : "text-emerald-600"}`}>
                            {s.spotsAvailable}/{s.spotsTotal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Webhook hint */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-foreground">Automate with Webhooks</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Configure Palisis to POST to{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                /api/admin/palisis-availability
              </code>{" "}
              on each booking to keep availability in sync automatically. Contact your Palisis account manager to set up webhook triggers.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
