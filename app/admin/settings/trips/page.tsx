"use client"

/**
 * /admin/settings/trips
 *
 * Per-field editability policy for the trip edit form.
 * Read-only fields here are still updated by Palisis sync — this only
 * affects the admin UI.
 */
import { useEffect, useMemo, useState } from "react"
import { TRIP_FIELDS, type FieldMode, type TripFieldPolicy } from "@/lib/trip-field-policy"

export default function TripFieldsSettingsPage() {
  const [policy, setPolicy] = useState<TripFieldPolicy>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState<"all" | "palisis" | "local">("all")

  useEffect(() => {
    fetch("/api/admin/settings/trip-fields")
      .then(r => r.json())
      .then(j => setPolicy(j.policy ?? {}))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, typeof TRIP_FIELDS>()
    for (const f of TRIP_FIELDS) {
      if (filter !== "all" && f.source !== filter) continue
      const arr = map.get(f.group) ?? []
      arr.push(f)
      map.set(f.group, arr)
    }
    return Array.from(map.entries())
  }, [filter])

  function setMode(key: string, mode: FieldMode) {
    setPolicy(p => ({ ...p, [key]: mode }))
    setSaved(false)
  }

  function bulkSet(keys: string[], mode: FieldMode) {
    setPolicy(p => {
      const next = { ...p }
      for (const k of keys) next[k] = mode
      return next
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch("/api/admin/settings/trip-fields", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      })
      if (res.ok) {
        const j = await res.json()
        setPolicy(j.policy ?? policy)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose which fields admins can edit on the trip edit page. Read-only fields are still updated
          automatically by every Palisis sync — this only controls the editing UI.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Filter:</span>
        {(["all", "palisis", "local"] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              filter === k ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? "All fields" : k === "palisis" ? "Palisis-sourced" : "Local-only"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map(([group, fields]) => (
          <section key={group} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">{group}</h2>
              <div className="flex gap-1.5 text-[10px]">
                <button
                  onClick={() => bulkSet(fields.map(f => f.key), "editable")}
                  className="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  All editable
                </button>
                <button
                  onClick={() => bulkSet(fields.map(f => f.key), "readonly")}
                  className="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  All read-only
                </button>
              </div>
            </div>
            <ul className="space-y-2">
              {fields.map(f => {
                const mode: FieldMode = policy[f.key] === "readonly" ? "readonly" : "editable"
                return (
                  <li key={f.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{f.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          f.source === "palisis" ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"
                        }`}>
                          {f.source}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">{f.key}</div>
                    </div>
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[11px]">
                      <button
                        onClick={() => setMode(f.key, "editable")}
                        className={`px-2.5 py-1 font-medium transition-colors ${
                          mode === "editable" ? "bg-emerald-500/15 text-emerald-700" : "bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Editable
                      </button>
                      <button
                        onClick={() => setMode(f.key, "readonly")}
                        className={`border-l border-border px-2.5 py-1 font-medium transition-colors ${
                          mode === "readonly" ? "bg-amber-500/15 text-amber-700" : "bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Read-only
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
