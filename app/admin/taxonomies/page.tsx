"use client"

import { useState, useEffect, useCallback } from "react"
import { Save, Plus, X, Tag, RefreshCw, Loader2, AlertCircle } from "lucide-react"

interface TaxItem {
  id?: string
  key: string
  label: string
  value: string
  groupKey?: string
}

export default function TaxonomiesPage() {
  const [items, setItems] = useState<TaxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState("")
  const [newLabel, setNewLabel] = useState("")
  const [addingNew, setAddingNew] = useState(false)

  const loadTaxonomies = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/taxonomies")
      if (!res.ok) throw new Error("Failed to load")
      const data: TaxItem[] = await res.json()
      setItems(data)
    } catch {
      setError("Failed to load taxonomies from database.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTaxonomies()
  }, [loadTaxonomies])

  function update(key: string, value: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, value } : i)))
  }

  async function remove(key: string) {
    try {
      const res = await fetch(`/api/admin/taxonomies/${encodeURIComponent(key)}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      setItems((prev) => prev.filter((i) => i.key !== key))
    } catch {
      alert("Failed to delete taxonomy entry.")
    }
  }

  async function addItem() {
    if (!newKey.trim() || !newLabel.trim()) return
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (items.find((i) => i.key === key)) {
      alert("A taxonomy with that key already exists.")
      return
    }
    setAddingNew(true)
    try {
      const res = await fetch("/api/admin/taxonomies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label: newLabel.trim(), value: "" }),
      })
      if (!res.ok) throw new Error("Failed to create")
      const created: TaxItem = await res.json()
      setItems((prev) => [...prev, created])
      setNewKey("")
      setNewLabel("")
    } catch {
      alert("Failed to add taxonomy entry.")
    } finally {
      setAddingNew(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = items.map((i) => ({ key: i.key, value: i.value }))
      const res = await fetch("/api/admin/taxonomies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Failed to save")
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      alert("Failed to save changes. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

  const groups: Record<string, TaxItem[]> = {}
  for (const item of items) {
    const prefix = item.groupKey ?? item.key.split("_")[0]
    groups[prefix] = groups[prefix] ?? []
    groups[prefix].push(item)
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Content</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Taxonomies</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage site-wide text labels, descriptions, and FAQ answers. {items.length > 0 && `${items.length} entries.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTaxonomies}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
            title="Refresh from database"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : "Save All"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button type="button" onClick={loadTaxonomies} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([group, groupItems]) => (
            <div key={group}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                <Tag className="h-3.5 w-3.5" />
                {group}
                <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-normal text-muted-foreground">{groupItems.length}</span>
              </h2>
              <div className="flex flex-col gap-3">
                {groupItems.map((item) => (
                  <div key={item.key} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className={labelClass}>{item.label}</label>
                      <button
                        type="button"
                        onClick={() => remove(item.key)}
                        className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-destructive"
                        title="Delete entry"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {item.value.length > 80 ? (
                      <textarea rows={2} className={inputClass} value={item.value} onChange={(e) => update(item.key, e.target.value)} />
                    ) : (
                      <input type="text" className={inputClass} value={item.value} onChange={(e) => update(item.key, e.target.value)} />
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/50">key: {item.key}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {items.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
              <Tag className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No taxonomy entries yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Add your first entry below</p>
            </div>
          )}
        </div>
      )}

      {/* Add new */}
      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Add Custom Entry</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Key (prefix_name)</label>
            <input
              type="text"
              className={inputClass}
              placeholder="hero_cta_text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
          </div>
          <div>
            <label className={labelClass}>Display Label</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Hero CTA Button Text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={addingNew || !newKey.trim() || !newLabel.trim()}
          className="mt-3 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          {addingNew ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add Entry
        </button>
      </div>
    </div>
  )
}
