"use client"

import { useCallback, useEffect, useState } from "react"
import { ScrollText, RefreshCw, Trash2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react"

interface ErrorLog {
  id: number
  source: string
  level: "error" | "warn" | "info"
  message: string
  status_code: number | null
  context: Record<string, unknown> | null
  created_at: string
}

const levelStyles: Record<string, string> = {
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-600",
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [source, setSource] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const url = `/api/admin/logs?limit=300${source ? `&source=${encodeURIComponent(source)}` : ""}`
      const res = await fetch(url)
      const data = (await res.json()) as { logs?: ErrorLog[]; sources?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to load logs")
      setLogs(data.logs ?? [])
      setSources(data.sources ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs")
    } finally {
      setLoading(false)
    }
  }, [source])

  // Pre-filter from the URL (e.g. /admin/logs?source=tourcms) so deep links
  // from other pages land on the right source. Read after mount to avoid any
  // server/client hydration mismatch.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("source")
    if (s) setSource(s)
  }, [])

  useEffect(() => { void load() }, [load])

  async function clearLogs() {
    if (!confirm(source ? `Clear all logs for "${source}"?` : "Clear ALL error logs?")) return
    setClearing(true)
    try {
      const url = `/api/admin/logs${source ? `?source=${encodeURIComponent(source)}` : ""}`
      const res = await fetch(url, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to clear logs")
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <ScrollText className="h-6 w-6 text-primary" />
            Error Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            API, AI and integration failures captured site-wide (e.g. invalid Anthropic keys, TourCMS/Palisis or weather outages, failed key tests).
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSource("")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            source === "" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          All sources
        </button>
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors ${
              source === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No errors logged</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Errors will appear here automatically whenever an API, AI or integration call fails.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.day} className="space-y-2">
              <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/90 px-1 py-1 backdrop-blur">
                <h2 className="text-sm font-semibold text-foreground">{group.day}</h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                  {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              {group.entries.map((log) => {
                const isOpen = expanded[log.id]
                const hasDetail = log.context && Object.keys(log.context).length > 0
                return (
              <div key={log.id} className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => hasDetail && setExpanded((p) => ({ ...p, [log.id]: !p[log.id] }))}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  {hasDetail ? (
                    isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                           : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${levelStyles[log.level] ?? levelStyles.error}`}>
                        {log.level}
                      </span>
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">{log.source}</span>
                      {log.status_code != null && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">HTTP {log.status_code}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{fmtTime(log.created_at)}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-foreground">{log.message}</p>
                  </div>
                </button>
                {isOpen && hasDetail && (
                  <pre className="mx-3 mb-3 max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                )}
              </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
