"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Database,
  CheckCircle2,
  Circle,
  Play,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"

type MigrationStatus = {
  id: string
  name: string
  description: string
  applied: boolean
  appliedAt: string | null
}

type StatusResponse = {
  trackingTableMissing: boolean
  migrations: MigrationStatus[]
}

type RunResult =
  | { id: string; ok: true; recorded: boolean; inserted: number; skipped: number; detail: string }
  | { id: string; ok: false; error: string }

export default function DbMigrationsPage() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<RunResult[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/db-migrations", { cache: "no-store" })
      if (res.status === 403) throw new Error("Superadmin access required.")
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      setData((await res.json()) as StatusResponse)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runSelected() {
    if (selected.size === 0) return
    setRunning(true)
    setResults(null)
    setError(null)
    try {
      const res = await fetch("/api/admin/db-migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `Run failed (${res.status})`)
      setResults(body.results as RunResult[])
      setSelected(new Set())
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Database className="h-6 w-6 text-indigo-600" />
            Data Migrations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Version-controlled <strong>content</strong> migrations (articles, AI prompts,
            settings). Run them against this environment&apos;s database. On the published
            site this targets the <strong>live</strong> DB. Schema changes (new tables/columns)
            are handled separately by Publish — these migrations never alter the schema.
          </p>
        </div>
        <button
          onClick={load}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {data?.trackingTableMissing && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The <code className="rounded bg-amber-100 px-1">data_migrations</code> tracking
            table doesn&apos;t exist in this database yet. <strong>Publish the app</strong> to
            create it (and any other new tables). You can still run migrations now — they apply
            idempotently — but applied-status won&apos;t be recorded until the table exists.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading migrations…
        </div>
      ) : (
        <div className="space-y-3">
          {data?.migrations.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600"
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                    {m.id}
                  </code>
                  <span className="font-medium text-gray-900">{m.name}</span>
                  {m.applied ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> Applied
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      <Circle className="h-3 w-3" /> Pending
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{m.description}</p>
                {m.appliedAt && (
                  <p className="mt-1 text-xs text-gray-400">
                    Last applied: {new Date(m.appliedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </label>
          ))}

          {data?.migrations.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              No data migrations defined.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={runSelected}
          disabled={running || selected.size === 0}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run selected{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
        <span className="text-xs text-gray-400">
          Re-running an applied migration is safe — it won&apos;t duplicate data.
        </span>
      </div>

      {results && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Run results</h2>
          <ul className="space-y-1.5 text-sm">
            {results.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span className="text-gray-700">
                  <code className="text-xs">{r.id}</code> —{" "}
                  {r.ok ? (
                    <>
                      {r.detail}
                      {!r.recorded && " (status not recorded — publish to enable tracking)"}
                    </>
                  ) : (
                    <span className="text-red-700">{r.error}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
