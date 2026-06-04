"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ScrollText,
  RefreshCw,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
} from "lucide-react"

interface ErrorLog {
  id: number
  source: string
  level: "error" | "warn" | "info"
  message: string
  status_code: number | null
  context: Record<string, unknown> | null
  created_at: string
}

type LevelFilter = "warn_error" | "all" | "error" | "warn" | "info"

const PAGE_SIZE = 10

const levelStyles: Record<string, string> = {
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600",
}

const levelOptions: { key: LevelFilter; label: string }[] = [
  { key: "warn_error", label: "Errors & Warnings" },
  { key: "all", label: "All" },
  { key: "error", label: "Error" },
  { key: "warn", label: "Warn" },
  { key: "info", label: "Info" },
]

/** Map the UI level filter to the API `levels` param (empty = no filter). */
function levelsParamFor(filter: LevelFilter): string {
  switch (filter) {
    case "warn_error":
      return "error,warn"
    case "all":
      return ""
    default:
      return filter
  }
}

/** Local-day [start, end) boundaries so "today" matches the admin's clock. */
function todayRange(): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<string>("")
  const [level, setLevel] = useState<LevelFilter>("warn_error")
  const [todayOnly, setTodayOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("offset", String((page - 1) * PAGE_SIZE))
      if (source) params.set("source", source)
      const lvls = levelsParamFor(level)
      if (lvls) params.set("levels", lvls)
      if (todayOnly) {
        const { from, to } = todayRange()
        params.set("from", from)
        params.set("to", to)
      }
      const res = await fetch(`/api/admin/logs?${params.toString()}`)
      const data = (await res.json()) as {
        logs?: ErrorLog[]
        sources?: string[]
        total?: number
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load logs")
      const nextTotal = data.total ?? 0
      setLogs(data.logs ?? [])
      setSources(data.sources ?? [])
      setTotal(nextTotal)
      // If the dataset shrank under us (e.g. day rollover, external deletes)
      // and the current page is now past the end, snap back to the last page —
      // this re-triggers load() and avoids a false "No matching logs" screen.
      const maxPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
      if (nextTotal > 0 && page > maxPage) setPage(maxPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [source, level, todayOnly, page])

  // Pre-filter from the URL (e.g. /admin/logs?source=tourcms) so deep links
  // from other pages land on the right source. Read after mount to avoid any
  // server/client hydration mismatch.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("source")
    if (s) setSource(s)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Any filter change resets to the first page.
  function updateSource(next: string) {
    setSource(next)
    setPage(1)
  }
  function updateLevel(next: LevelFilter) {
    setLevel(next)
    setPage(1)
  }
  function updateTodayOnly(next: boolean) {
    setTodayOnly(next)
    setPage(1)
  }

  async function clearLogs() {
    if (!confirm(source ? `Clear all logs for "${source}"?` : "Clear ALL error logs?")) return
    setClearing(true)
    try {
      const url = `/api/admin/logs${source ? `?source=${encodeURIComponent(source)}` : ""}`
      const res = await fetch(url, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to clear logs")
      setPage(1)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs")
    } finally {
      setClearing(false)
    }
  }

  function fmtTime(ts: string) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch {
      return ts
    }
  }

  function dayKey(ts: string) {
    try {
      return new Date(ts).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    } catch {
      return ts.slice(0, 10)
    }
  }

  // Group logs by calendar day (logs already arrive newest-first).
  const grouped = logs.reduce<{ day: string; entries: ErrorLog[] }[]>((acc, log) => {
    const day = dayKey(log.created_at)
    const last = acc[acc.length - 1]
    if (last && last.day === day) last.entries.push(log)
    else acc.push({ day, entries: [log] })
    return acc
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <ScrollText className="h-6 w-6 text-primary" />
              Error Logs
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              API, AI and integration failures captured site-wide (e.g. invalid Anthropic keys,
              TourCMS/Palisis or weather outages, failed key tests).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void clearLogs()}
              disabled={clearing || logs.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {source ? "Clear filtered" : "Clear all"}
            </button>
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => updateSource("")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  source === ""
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                All sources
              </button>
              {sources.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateSource(s)}
                  className={`rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors ${
                    source === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Level
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {levelOptions.map((opt) => {
                const active = level === opt.key
                const activeCls =
                  opt.key === "error"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : opt.key === "warn"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600"
                      : opt.key === "info"
                        ? "border-blue-500 bg-blue-500/10 text-blue-600"
                        : "border-primary bg-primary/10 text-primary"
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => updateLevel(opt.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active ? activeCls : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Range
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => updateTodayOnly(true)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  todayOnly
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Today only
              </button>
              <button
                type="button"
                onClick={() => updateTodayOnly(false)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  !todayOnly
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                All time
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-foreground">
              {todayOnly ? "No matching logs today" : "No matching logs"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {todayOnly
                ? "Try switching the range to “All time” or widening the level filter."
                : "Errors will appear here automatically whenever an API, AI or integration call fails."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">{rangeStart}</span>–
                <span className="font-medium text-foreground">{rangeEnd}</span> of{" "}
                <span className="font-medium text-foreground">{total}</span>{" "}
                {total === 1 ? "entry" : "entries"}
              </p>
            </div>

            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.day} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{group.day}</h2>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                      {group.entries.length} on this page
                    </span>
                  </div>
                  {group.entries.map((log) => {
                    const isOpen = expanded[log.id]
                    const hasDetail = log.context && Object.keys(log.context).length > 0
                    return (
                      <div key={log.id} className="rounded-lg border border-border bg-card transition-colors hover:border-border/80">
                        <button
                          type="button"
                          onClick={() =>
                            hasDetail && setExpanded((p) => ({ ...p, [log.id]: !p[log.id] }))
                          }
                          className="flex w-full items-start gap-3 p-3.5 text-left"
                        >
                          {hasDetail ? (
                            isOpen ? (
                              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            )
                          ) : (
                            <span className="mt-0.5 h-4 w-4 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                  levelStyles[log.level] ?? levelStyles.error
                                }`}
                              >
                                {log.level}
                              </span>
                              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                {log.source}
                              </span>
                              {log.status_code != null && (
                                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                  HTTP {log.status_code}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {fmtTime(log.created_at)}
                              </span>
                            </div>
                            <p className="mt-1.5 break-words text-sm text-foreground">{log.message}</p>
                          </div>
                        </button>
                        {isOpen && hasDetail && (
                          <pre className="mx-3.5 mb-3.5 max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
              <span className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
