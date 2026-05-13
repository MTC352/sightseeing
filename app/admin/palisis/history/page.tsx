"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Clock, Terminal, ChevronLeft, ChevronRight, FileText,
} from "lucide-react"

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

const PAGE_SIZE = 20

export default function PalisisHistoryPage() {
  const [logs, setLogs]               = useState<SyncLogEntry[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const [expandedView, setExpandedView] = useState<Record<string, "summary" | "log">>(
    {}
  )

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const offset = (p - 1) * PAGE_SIZE
      const res    = await fetch(`/api/admin/palisis-logs?limit=${PAGE_SIZE}&offset=${offset}`)
      const data   = await res.json()
      if (data.ok) {
        setLogs(data.logs ?? [])
        setTotal(data.total ?? 0)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPage(page) }, [fetchPage, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function goTo(p: number) {
    if (p < 1 || p > totalPages) return
    setPage(p)
    setExpandedLog(null)
  }

  function toggleView(id: string, view: "summary" | "log") {
    setExpandedView(prev => ({ ...prev, [id]: view }))
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/palisis"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Import History</h1>
            <p className="text-xs text-muted-foreground">
              All Palisis import runs — {total} total
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchPage(page)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-border bg-card">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          <span>Run</span>
          <span className="w-24 text-center">Result</span>
          <span className="w-28 text-right">Date / Time</span>
          <span className="w-16 text-center">Details</span>
        </div>

        {loading ? (
          <div className="space-y-0 divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="h-4 w-4 rounded-full bg-secondary animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded bg-secondary animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-secondary animate-pulse" />
                </div>
                <div className="h-3 w-24 rounded bg-secondary animate-pulse" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <Clock className="h-5 w-5 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No import history yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Run an import from the{" "}
                <Link href="/admin/palisis" className="text-primary underline-offset-2 hover:underline">
                  Palisis page
                </Link>{" "}
                to see entries here.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((entry) => {
              const ch     = entry.changes ?? {}
              const ok     = ch.ok !== false
              const isOpen = expandedLog === entry.id
              const view   = expandedView[entry.id] ?? "summary"

              return (
                <div key={entry.id}>
                  {/* Row */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5">
                    {/* Run info */}
                    <button
                      type="button"
                      onClick={() => setExpandedLog(isOpen ? null : entry.id)}
                      className="flex min-w-0 items-center gap-3 text-left"
                    >
                      {ok
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <XCircle     className="h-4 w-4 shrink-0 text-destructive" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {entry.action === "import_run" ? "Import Run" : entry.action}
                          </span>
                          {ch.import_mode && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {ch.import_mode === "operator" ? "Operator" : "Marketplace"}
                            </span>
                          )}
                        </div>
                        {ok && ch.total != null ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {ch.total} tours · {ch.imported ?? 0} imported · {ch.skipped ?? 0} skipped
                            {ch.duration_ms ? ` · ${(ch.duration_ms / 1000).toFixed(1)}s` : ""}
                          </p>
                        ) : entry.note ? (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">{entry.note}</p>
                        ) : null}
                      </div>
                    </button>

                    {/* Status badge */}
                    <div className="w-24 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        ok
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-destructive/10 text-destructive"
                      }`}>
                        {ok ? "Success" : "Failed"}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="w-28 text-right text-[10px] text-muted-foreground/60">
                      {new Date(entry.created_at).toLocaleString("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>

                    {/* Expand toggle */}
                    <div className="w-16 text-center">
                      <button
                        type="button"
                        onClick={() => setExpandedLog(isOpen ? null : entry.id)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary"
                      >
                        {isOpen
                          ? <ChevronUp   className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isOpen && (
                    <div className="border-t border-border bg-secondary/10 px-5 pb-5 pt-4">
                      {/* View tabs */}
                      <div className="mb-4 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleView(entry.id, "summary")}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            view === "summary"
                              ? "bg-card border border-border text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          <FileText className="h-3 w-3" /> Summary
                        </button>
                        {ch.log && ch.log.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleView(entry.id, "log")}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              view === "log"
                                ? "bg-card border border-border text-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            <Terminal className="h-3 w-3" /> Raw Log
                            <span className="ml-0.5 rounded-full bg-secondary px-1 text-[9px] text-muted-foreground">
                              {ch.log.length}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Summary view */}
                      {view === "summary" && (
                        <div className="space-y-3">
                          {ch.error && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                              {ch.error}
                            </div>
                          )}

                          {/* Stats grid */}
                          {ok && ch.total != null && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {[
                                { label: "Total", value: ch.total ?? 0, color: "text-foreground" },
                                { label: "Imported", value: ch.imported ?? 0, color: "text-emerald-600" },
                                { label: "Skipped", value: ch.skipped ?? 0, color: "text-muted-foreground" },
                                { label: "Errors", value: ch.api_errors ?? 0, color: ch.api_errors ? "text-destructive" : "text-muted-foreground" },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
                                  <p className="text-[10px] text-muted-foreground">{label}</p>
                                  <p className={`mt-0.5 text-lg font-semibold ${color}`}>{value}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tours table */}
                          {ch.tours && ch.tours.length > 0 && (
                            <div className="overflow-hidden rounded-lg border border-border">
                              <table className="w-full text-[10px]">
                                <thead>
                                  <tr className="border-b border-border bg-secondary/50">
                                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground/70">Palisis ID</th>
                                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground/70">Trip</th>
                                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground/70">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ch.tours.map((t, i) => (
                                    <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/20">
                                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{t.palisisId}</td>
                                      <td className="max-w-[240px] truncate px-3 py-1.5 text-muted-foreground">{t.title}</td>
                                      <td className={`px-3 py-1.5 font-medium ${
                                        t.action === "created"           ? "text-emerald-600"
                                        : t.action === "updated"         ? "text-blue-600"
                                        : t.action.includes("error")     ? "text-destructive"
                                        : "text-muted-foreground"
                                      }`}>
                                        {t.action}{t.error ? ` — ${t.error}` : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {!ch.error && !ch.tours?.length && (
                            <p className="text-xs text-muted-foreground">No detail data recorded for this run.</p>
                          )}
                        </div>
                      )}

                      {/* Raw log view */}
                      {view === "log" && ch.log && ch.log.length > 0 && (
                        <pre className="max-h-80 overflow-y-auto rounded-lg border border-border bg-[#0d1117] p-4 font-mono text-[10px] leading-relaxed text-emerald-400">
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

        {/* Pagination footer */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-[11px] text-muted-foreground">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={page === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {/* Page number pills */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && typeof arr[i - 1] === "number" && (p as number) - (arr[i - 1] as number) > 1) {
                    acc.push("…")
                  }
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goTo(p as number)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
                        p === page
                          ? "bg-primary text-primary-foreground font-medium"
                          : "border border-border text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={page === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
