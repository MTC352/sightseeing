"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ArrowRightLeft,
  PlusCircle,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { diffLines } from "@/lib/diff"

type FieldKey =
  | "label"
  | "description"
  | "system_prompt"
  | "model"
  | "temperature"
  | "max_tokens"
  | "extra_config"

type FieldDiff = {
  field: FieldKey
  migration: string
  current: string | null
  differs: boolean
}

type Comparison = {
  system_key: string
  label: string
  status: "missing" | "identical" | "different"
  fields: FieldDiff[]
}

const FIELD_LABELS: Record<FieldKey, string> = {
  label: "Label",
  description: "Description",
  system_prompt: "System prompt",
  model: "Model",
  temperature: "Temperature",
  max_tokens: "Max tokens",
  extra_config: "Extra config (JSON)",
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy migration value"}
    </button>
  )
}

function FieldDiffView({ field }: { field: FieldDiff }) {
  const current = field.current ?? ""
  const isMultiline =
    field.field === "system_prompt" ||
    field.field === "extra_config" ||
    field.field === "description"

  if (isMultiline && field.differs) {
    const lines = diffLines(current, field.migration)
    return (
      <pre className="max-h-72 overflow-auto rounded bg-gray-900 p-3 text-xs leading-relaxed">
        {lines.map((l, idx) => (
          <div
            key={idx}
            className={
              l.type === "add"
                ? "bg-green-500/15 text-green-300"
                : l.type === "remove"
                  ? "bg-red-500/15 text-red-300"
                  : "text-gray-400"
            }
          >
            <span className="select-none pr-2 text-gray-500">
              {l.type === "add" ? "+" : l.type === "remove" ? "−" : " "}
            </span>
            {l.text || " "}
          </div>
        ))}
      </pre>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Current (this DB)
        </p>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          {field.current === null ? "— (no row yet)" : current || "—"}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Migration (saved value)
        </p>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-gray-800">
          {field.migration || "—"}
        </pre>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Comparison["status"] }) {
  if (status === "missing") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <PlusCircle className="h-3 w-3" /> Not in DB
      </span>
    )
  }
  if (status === "identical") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Up to date
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
      <ArrowRightLeft className="h-3 w-3" /> Differs
    </span>
  )
}

export default function AiConfigDiff() {
  const [rows, setRows] = useState<Comparison[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/db-migrations/ai-configs", { cache: "no-store" })
      if (res.status === 403) throw new Error("Superadmin access required.")
      if (!res.ok) throw new Error(`Failed to load comparison (${res.status})`)
      const body = await res.json()
      setRows(body.comparison as Comparison[])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function applyOne(key: string) {
    if (
      !window.confirm(
        `Overwrite the "${key}" AI System row in THIS database with the migration's saved values? This replaces the current prompt, model, settings and extra config for this system.`,
      )
    ) {
      return
    }
    setApplying(key)
    setNotice(null)
    setError(null)
    try {
      const res = await fetch("/api/admin/db-migrations/ai-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: [key] }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? `Apply failed (${res.status})`)
      setNotice(`Applied "${key}": ${body.result?.detail ?? "done"}.`)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(null)
    }
  }

  const diffCount = rows?.filter((r) => r.status !== "identical").length ?? 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Compare AI System prompts (migration vs this DB)
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Each system shows the migration&apos;s saved value against what&apos;s currently
            in this database. Overwrite a single prompt, copy values to edit manually, or use
            the &quot;Overwrite all&quot; toggle above to replace everything at once.
          </p>
        </div>
        <button
          onClick={load}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading comparison…
        </div>
      ) : rows && rows.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-gray-500">
            {diffCount === 0
              ? "Every AI System matches the migration snapshot."
              : `${diffCount} of ${rows.length} system(s) differ from the migration snapshot.`}
          </p>
          <div className="space-y-2">
            {rows.map((r) => {
              const isOpen = expanded.has(r.system_key)
              const changedFields = r.fields.filter(
                (f) => f.differs || (r.status === "missing" && f.migration),
              )
              return (
                <div key={r.system_key} className="rounded-md border border-gray-200">
                  <button
                    type="button"
                    onClick={() => toggle(r.system_key)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                      {r.system_key}
                    </code>
                    <span className="text-sm font-medium text-gray-800">{r.label}</span>
                    <span className="ml-auto">
                      <StatusBadge status={r.status} />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-gray-100 px-3 py-3">
                      {changedFields.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No differences — this system matches the migration snapshot.
                        </p>
                      ) : (
                        changedFields.map((f) => (
                          <div key={f.field}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-700">
                                {FIELD_LABELS[f.field]}
                              </span>
                              <CopyButton value={f.migration} />
                            </div>
                            <FieldDiffView field={f} />
                          </div>
                        ))
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => applyOne(r.system_key)}
                          disabled={applying !== null || r.status === "identical"}
                          className="flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {applying === r.system_key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          )}
                          {r.status === "missing"
                            ? "Insert this row from migration"
                            : "Overwrite this row from migration"}
                        </button>
                        <Link
                          href={`/admin/ai-systems/${r.system_key}`}
                          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Edit manually
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="py-4 text-center text-xs text-gray-400">No AI System configs in the snapshot.</p>
      )}
    </div>
  )
}
