"use client"

/**
 * Trip Field Editability panel — compact, collapsible.
 *
 * Rendered inside `/admin/integrations` (Trip Fields tab). Read-only is UI-only;
 * Palisis sync (lib/palisis-sync.ts) still writes every field to our DB.
 */
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { TRIP_FIELDS, type FieldMode, type TripFieldPolicy } from "@/lib/trip-field-policy"

export default function TripFieldsPanel() {
  const [policy, setPolicy] = useState<TripFieldPolicy>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState<"all" | "palisis" | "local">("all")
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch("/api/admin/settings/trip-fields")
      .then(r => r.json())
      .then(j => setPolicy(j.policy ?? {}))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, typeof TRIP_FIELDS>()
    const q = query.trim().toLowerCase()
    for (const f of TRIP_FIELDS) {
      if (filter !== "all" && f.source !== filter) continue
      if (q && !f.label.toLowerCase().includes(q) && !f.key.toLowerCase().includes(q)) continue
      const arr = map.get(f.group) ?? []
      arr.push(f)
      map.set(f.group, arr)
    }
    return Array.from(map.entries())
  }, [filter, query])

  // Auto-collapse all groups by default; expand all when searching.
  useEffect(() => {
    if (query.trim()) {
      const next: Record<string, boolean> = {}
      for (const [g] of groups) next[g] = true
      setOpen(next)
    }
  }, [query, groups])

  function toggleGroup(g: string) {
    setOpen(p => ({ ...p, [g]: !p[g] }))
  }

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

  function expandAll(v: boolean) {
    const next: Record<string, boolean> = {}
    for (const [g] of groups) next[g] = v
    setOpen(next)
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
    return <div className="text-xs text-muted-foreground">Loading…</div>
  }

  // Group-level summary helpers
  const summary = (fields: typeof TRIP_FIELDS) => {
    let edit = 0
    let ro = 0
    for (const f of fields) {
      if (policy[f.key] === "readonly") ro++
      else edit++
    }
    return { edit, ro, total: fields.length }
  }

  return (
    <div className="space-y-3">
      {/* Compact toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fields…"
            className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          {(["all", "palisis", "local"] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-2 py-1 font-medium transition-colors ${
                filter === k
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "all" ? "All" : k === "palisis" ? "Palisis" : "Local"}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1 text-[11px]">
          <button
            onClick={() => expandAll(true)}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Expand all
          </button>
          <button
            onClick={() => expandAll(false)}
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Collapse all
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="ml-auto h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {/* Collapsible groups */}
      <div className="space-y-2">
        {groups.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No fields match your filter.
          </div>
        )}
        {groups.map(([group, fields]) => {
          const isOpen = !!open[group]
          const s = summary(fields)
          return (
            <section key={group} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "" : "-rotate-90"
                  }`}
                />
                <span className="text-xs font-semibold text-foreground">{group}</span>
                <span className="text-[10px] text-muted-foreground">
                  {s.total} field{s.total !== 1 ? "s" : ""}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px]">
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700">
                    {s.edit} editable
                  </span>
                  <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700">
                    {s.ro} read-only
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border">
                  <div className="flex items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-1.5 text-[10px]">
                    <span className="text-muted-foreground">Bulk:</span>
                    <button
                      onClick={() => bulkSet(fields.map(f => f.key), "editable")}
                      className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700"
                    >
                      All editable
                    </button>
                    <button
                      onClick={() => bulkSet(fields.map(f => f.key), "readonly")}
                      className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-700"
                    >
                      All read-only
                    </button>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {fields.map(f => {
                      const mode: FieldMode =
                        policy[f.key] === "readonly" ? "readonly" : "editable"
                      return (
                        <li
                          key={f.key}
                          className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/20"
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              f.source === "palisis" ? "bg-blue-500" : "bg-emerald-500"
                            }`}
                            title={f.source}
                          />
                          <span className="truncate text-xs font-medium text-foreground">
                            {f.label}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground/60">
                            {f.key}
                          </span>
                          <div className="ml-auto flex shrink-0 overflow-hidden rounded-md border border-border text-[10px]">
                            <button
                              onClick={() => setMode(f.key, "editable")}
                              className={`px-2 py-0.5 font-medium transition-colors ${
                                mode === "editable"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Editable
                            </button>
                            <button
                              onClick={() => setMode(f.key, "readonly")}
                              className={`border-l border-border px-2 py-0.5 font-medium transition-colors ${
                                mode === "readonly"
                                  ? "bg-amber-500/15 text-amber-700"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Read-only
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
