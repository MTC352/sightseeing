"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Activity, RefreshCw, AlertCircle, ChevronDown, ChevronRight,
  LogIn, LogOut, Plus, Pencil, Trash2, Download, Settings as SettingsIcon, UserCog, FileText,
} from "lucide-react"

interface ActivityEntry {
  id: number
  user_id: string | null
  user_name: string | null
  user_email: string | null
  user_role: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  context: Record<string, unknown> | null
  created_at: string
}

interface Actor {
  id: string
  name: string | null
  email: string | null
}

function verbOf(action: string): string {
  return action.includes(".") ? action.split(".")[1] : action
}

function iconFor(action: string) {
  if (action === "auth.login") return LogIn
  if (action === "auth.logout") return LogOut
  if (action.startsWith("palisis")) return Download
  if (action.startsWith("user")) return UserCog
  if (action.startsWith("settings") || action.startsWith("integration") || action.startsWith("file_rule")) return SettingsIcon
  const verb = verbOf(action)
  if (verb === "create" || verb === "upload") return Plus
  if (verb === "update" || verb === "restore") return Pencil
  if (verb === "delete") return Trash2
  return FileText
}

function styleFor(action: string): string {
  const verb = verbOf(action)
  if (action === "auth.login") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
  if (action === "auth.logout") return "border-muted bg-secondary text-muted-foreground"
  if (verb === "delete") return "border-destructive/30 bg-destructive/10 text-destructive"
  if (verb === "create" || verb === "upload") return "border-blue-500/30 bg-blue-500/10 text-blue-600"
  if (action.startsWith("palisis")) return "border-violet-500/30 bg-violet-500/10 text-violet-600"
  return "border-amber-500/30 bg-amber-500/10 text-amber-600"
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityEntry[]>([])
  const [actors, setActors] = useState<Actor[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [userId, setUserId] = useState("")
  const [action, setAction] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const url = `/api/admin/activity?limit=400${userId ? `&userId=${encodeURIComponent(userId)}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`
      const res = await fetch(url)
      const data = (await res.json()) as { logs?: ActivityEntry[]; actors?: Actor[]; actions?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to load activity")
      setLogs(data.logs ?? [])
      setActors(data.actors ?? [])
      setActions(data.actions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity")
    } finally {
      setLoading(false)
    }
  }, [userId, action])

  useEffect(() => { void load() }, [load])

  function fmtTime(ts: string) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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

  const grouped = logs.reduce<{ day: string; entries: ActivityEntry[] }[]>((acc, log) => {
    const day = dayKey(log.created_at)
    const last = acc[acc.length - 1]
    if (last && last.day === day) last.entries.push(log)
    else acc.push({ day, entries: [log] })
    return acc
  }, [])

  return (
    <div className="space-y-6 p-6 lg:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Activity className="h-6 w-6 text-primary" />
            Recent Activity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit trail of admin activity — logins, content changes (create / update / delete), settings &amp; integration changes, user management, and Palisis importer runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">User:</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="">All users</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.email ?? a.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Action:</span>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {(userId || action) && (
          <button
            type="button"
            onClick={() => { setUserId(""); setAction("") }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
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
          <Activity className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">No activity recorded yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Logins and admin changes will appear here automatically as they happen.
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
                const Icon = iconFor(log.action)
                return (
                  <div key={log.id} className="rounded-lg border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => hasDetail && setExpanded((p) => ({ ...p, [log.id]: !p[log.id] }))}
                      className="flex w-full items-start gap-3 p-3 text-left"
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${styleFor(log.action)}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{log.summary}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{log.action}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {log.user_name ?? log.user_email ?? "System"}
                          </span>
                          {log.user_role && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase">{log.user_role}</span>
                          )}
                          <span>·</span>
                          <span>{fmtTime(log.created_at)}</span>
                        </div>
                      </div>
                      {hasDetail && (
                        isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                               : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
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
