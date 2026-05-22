"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Save, Tag as TagIcon, Home } from "lucide-react"
import { iconForSlug } from "@/lib/tag-icons"

interface TripTag {
  slug: string
  label: string
  show_on_homepage: boolean
  sort_order: number
  /** Published trips currently using this tag. Server-computed via the
   *  admin GET /api/admin/trip-tags endpoint. */
  trip_count?: number
}

export default function TripTagsPage() {
  const [tags, setTags] = useState<TripTag[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState("")
  const [newHomepage, setNewHomepage] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/trip-tags", { cache: "no-store" })
      const j = await r.json()
      setTags(Array.isArray(j?.tags) ? j.tags : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function patchTag(slug: string, patch: Partial<TripTag>) {
    setSavingSlug(slug)
    setError(null)
    try {
      const r = await fetch(`/api/admin/trip-tags/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j?.error || "Save failed")
      }
      const updated = await r.json()
      setTags((prev) => prev.map((t) => (t.slug === slug ? { ...t, ...updated } : t)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSavingSlug(null)
    }
  }

  async function deleteTag(slug: string) {
    if (!confirm(`Delete tag "${slug}"? Trips currently using it keep the value but it will disappear from pickers.`)) return
    await fetch(`/api/admin/trip-tags/${encodeURIComponent(slug)}`, { method: "DELETE" })
    setTags((prev) => prev.filter((t) => t.slug !== slug))
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setCreating(true)
    setError(null)
    try {
      const r = await fetch("/api/admin/trip-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), show_on_homepage: newHomepage }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j?.error || "Create failed")
      }
      setNewLabel("")
      setNewHomepage(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  const homepageCount = tags.filter((t) => t.show_on_homepage).length

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <TagIcon className="h-5 w-5" /> Trip Tags
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Central catalog of tags used on Trips, the Trip Planner Chat interest picker, and the homepage's
            <span className="font-medium"> Currently Trending Categories</span> grid. Toggle a tag's
            <span className="font-medium"> homepage</span> flag to show it on the homepage — icons are picked
            automatically from each tag's slug.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tags.length} tags · {homepageCount} shown on homepage · {tags.filter((t) => (t.trip_count ?? 0) > 0).length} linked to at least one trip
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create form */}
      <form
        onSubmit={createTag}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">New tag label</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Wine tasting"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={newHomepage}
            onChange={(e) => setNewHomepage(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show on homepage
        </label>
        <button
          type="submit"
          disabled={creating || !newLabel.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </form>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Icon</th>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-center">Trips</th>
              <th className="px-4 py-2 text-center">Homepage</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>Loading…</td></tr>
            )}
            {!loading && tags.length === 0 && (
              <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>No tags yet.</td></tr>
            )}
            {tags.map((t) => {
              const Icon = iconForSlug(t.slug)
              const isSaving = savingSlug === t.slug
              return (
                <tr key={t.slug} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      defaultValue={t.label}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== t.label) patchTag(t.slug, { label: v })
                      }}
                      className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-border focus:border-primary focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{t.slug}</td>
                  <td
                    className="px-4 py-2 text-center"
                    data-testid={`trip-tag-count-${t.slug}`}
                    title={`${t.trip_count ?? 0} published trip(s) tagged with "${t.label}"`}
                  >
                    {(t.trip_count ?? 0) > 0 ? (
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {t.trip_count}
                      </span>
                    ) : (
                      <span
                        className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        title="No published trips currently use this tag — it won't appear on the planner or search filter."
                      >
                        0
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={t.show_on_homepage}
                        onChange={(e) => patchTag(t.slug, { show_on_homepage: e.target.checked })}
                        className="h-4 w-4 rounded border-border"
                      />
                      {t.show_on_homepage && <Home className="h-3.5 w-3.5 text-primary" />}
                    </label>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {isSaving ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Save className="h-3.5 w-3.5" /> Saving…
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => deleteTag(t.slug)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
