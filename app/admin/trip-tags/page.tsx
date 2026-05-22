"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, Save, Tag as TagIcon, Home, X } from "lucide-react"
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

/** Mirror of the server-side slugify in `app/api/admin/trip-tags/route.ts`
 *  so we can client-validate for duplicates before opening a roundtrip. */
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export default function TripTagsPage() {
  const [tags, setTags] = useState<TripTag[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Listing filter — when ON, hides every tag whose `show_on_homepage`
  // flag is false. Lives client-side; we already load the full catalog
  // from the API so toggling is instant and reset-safe.
  const [onlyHomepage, setOnlyHomepage] = useState(false)

  // Create-tag modal state.
  const [createOpen, setCreateOpen] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newHomepage, setNewHomepage] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

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

  function openCreate() {
    setNewLabel("")
    setNewHomepage(false)
    setCreateError(null)
    setCreateOpen(true)
  }
  function closeCreate() {
    if (creating) return
    setCreateOpen(false)
    setCreateError(null)
  }

  // Live duplicate / validity preview tied to the modal's input.
  const previewSlug = useMemo(() => slugify(newLabel), [newLabel])
  const existingSlugs = useMemo(() => new Set(tags.map((t) => t.slug.toLowerCase())), [tags])
  const existingLabels = useMemo(
    () => new Set(tags.map((t) => t.label.trim().toLowerCase())),
    [tags],
  )
  const trimmedLabel = newLabel.trim()
  const isDuplicate =
    Boolean(previewSlug) && (existingSlugs.has(previewSlug) || existingLabels.has(trimmedLabel.toLowerCase()))
  const isInvalidSlug = Boolean(trimmedLabel) && !previewSlug // label entered but slugifies to empty
  const canSubmit = Boolean(trimmedLabel) && !isDuplicate && !isInvalidSlug && !creating

  async function createTag(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setCreating(true)
    setCreateError(null)
    try {
      const r = await fetch("/api/admin/trip-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmedLabel, show_on_homepage: newHomepage }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        // Server returns 409 when the slug already exists; surface it
        // inline in the modal rather than as a toast so the admin can
        // tweak the label without losing their input.
        if (r.status === 409) {
          throw new Error(`A tag with the slug "${previewSlug}" already exists.`)
        }
        throw new Error(j?.error || "Create failed")
      }
      await load()
      setCreateOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  const homepageCount = tags.filter((t) => t.show_on_homepage).length
  const visibleTags = onlyHomepage ? tags.filter((t) => t.show_on_homepage) : tags

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
        <button
          type="button"
          onClick={openCreate}
          data-testid="open-create-tag"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add tag
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Listing filters */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <label
          className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/40"
          data-testid="filter-homepage-only"
        >
          <input
            type="checkbox"
            checked={onlyHomepage}
            onChange={(e) => setOnlyHomepage(e.target.checked)}
            data-testid="filter-homepage-only-input"
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Home className="h-3.5 w-3.5 text-primary" />
          Show only homepage tags
        </label>
        <span className="text-xs text-muted-foreground">
          Showing {visibleTags.length} of {tags.length}
        </span>
      </div>

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
            {!loading && tags.length > 0 && visibleTags.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={6}>
                  No tags match the current filter — none are flagged "Show on homepage".
                </td>
              </tr>
            )}
            {visibleTags.map((t) => {
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

      {/* Create-tag modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-tag-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="create-tag-modal"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="create-tag-title" className="text-lg font-semibold text-foreground">Add a new tag</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The slug is derived automatically from the label. Duplicates aren't allowed.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={createTag} className="space-y-4">
              <div>
                <label htmlFor="new-tag-label" className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Tag label
                </label>
                <input
                  id="new-tag-label"
                  type="text"
                  autoFocus
                  value={newLabel}
                  onChange={(e) => { setNewLabel(e.target.value); setCreateError(null) }}
                  placeholder="e.g. Wine tasting"
                  data-testid="new-tag-label"
                  className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none ${
                    isDuplicate || isInvalidSlug
                      ? "border-destructive focus:border-destructive"
                      : "border-border focus:border-primary"
                  }`}
                />
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">
                    Slug preview:{" "}
                    <code className="font-mono text-foreground">{previewSlug || "—"}</code>
                  </span>
                  {isDuplicate && (
                    <span data-testid="new-tag-duplicate" className="font-medium text-destructive">
                      Already exists
                    </span>
                  )}
                  {!isDuplicate && isInvalidSlug && (
                    <span className="font-medium text-destructive">
                      Label must contain letters or digits
                    </span>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background/60 p-3 text-sm hover:bg-secondary/30">
                <input
                  type="checkbox"
                  checked={newHomepage}
                  onChange={(e) => setNewHomepage(e.target.checked)}
                  data-testid="new-tag-homepage"
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span>
                  <span className="font-medium text-foreground">Show on homepage</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Adds the tag to the "Currently Trending Categories" grid on the homepage.
                  </span>
                </span>
              </label>

              {createError && (
                <div
                  data-testid="new-tag-error"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creating}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  data-testid="submit-new-tag"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Creating…" : "Add tag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
