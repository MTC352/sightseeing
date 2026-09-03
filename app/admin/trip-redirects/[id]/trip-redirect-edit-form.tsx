"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Save, ArrowLeft, ChevronsUpDown, Check, Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

type TripOption = { id: string; title: string; slug: string; status: string }
type RedirectRecord = {
  id: string; slug: string; tripId: string; tripSlug: string; tripTitle: string
} | null

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

// Slugify like the server (generateSlug): lowercase, kebab, drop junk. A purely
// numeric / tcms_ value is prefixed so it can't collide with legacy id routing.
function slugify(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
  if (!s) return ""
  return /^(?:tcms_?\d+|\d+)$/.test(s) ? `trip-${s}` : s
}

/** Searchable combobox for picking the target trip. */
function TripPicker({
  trips,
  tripId,
  onSelect,
}: {
  trips: TripOption[]
  tripId: string
  onSelect: (id: string) => void
}) {
  const selected = trips.find((t) => t.id === tripId) ?? null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? trips.filter((t) => t.title.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      : trips
    return pool.slice(0, 50)
  }, [query, trips])

  function choose(t: TripOption) {
    onSelect(t.id)
    setQuery("")
    setOpen(false)
  }

  return (
    <div className="relative" ref={boxRef}>
      {/* Trigger: shows the selected trip, or opens the search field. */}
      {open ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            autoFocus
            className={`${inputClass} pl-9`}
            placeholder="Search trips by title or slug…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
              else if (e.key === "Enter") { e.preventDefault(); if (results[active]) choose(results[active]) }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false) }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery("") }}
          className={`${inputClass} flex items-center justify-between text-left`}
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground/50"}>
            {selected ? selected.title : "— Select a trip —"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No trips match “{query}”.</p>
          ) : (
            results.map((t, i) => (
              <button
                type="button"
                key={t.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(t)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", t.id === tripId ? "opacity-100 text-primary" : "opacity-0")} />
                <span className="flex-1 truncate text-foreground">
                  {t.title}
                  {t.status !== "published" && (
                    <span className="ml-1 text-xs text-amber-600">({t.status})</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">/{t.slug}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function TripRedirectEditForm({
  redirect,
  trips,
  initialSlug,
}: {
  redirect: RedirectRecord
  trips: TripOption[]
  initialSlug: string
}) {
  const router = useRouter()
  const [slug, setSlug] = useState(redirect?.slug ?? initialSlug ?? "")
  const [tripId, setTripId] = useState(redirect?.tripId ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const cleanSlug = slugify(slug)
    if (!cleanSlug) return setError("Enter a valid redirect slug")
    if (!tripId) return setError("Pick the trip this URL should point to")

    setSaving(true)
    const method = redirect ? "PATCH" : "POST"
    const url = redirect ? `/api/admin/trip-redirects/${redirect.id}` : "/api/admin/trip-redirects"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: cleanSlug, tripId }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return setError(body?.error ?? "Failed to save redirect")
    }
    router.push("/admin/trip-redirects")
    router.refresh()
  }

  const selectedTrip = trips.find((t) => t.id === tripId)

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/trip-redirects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to redirects
      </Link>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <label className={labelClass}>Redirect slug</label>
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-xs text-muted-foreground">/trip/</span>
            <input
              className={inputClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={(e) => setSlug(slugify(e.target.value))}
              placeholder="old-or-alternate-slug"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            The alternate URL that should 308-redirect to the trip below. Sanitized to a
            WordPress-style slug automatically.
          </p>
        </div>

        <div>
          <label className={labelClass}>Target trip</label>
          <TripPicker trips={trips} tripId={tripId} onSelect={setTripId} />
          {selectedTrip && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Redirects to <span className="font-mono">/trip/{selectedTrip.slug}</span>
              {selectedTrip.status !== "published" && (
                <span className="text-amber-600"> — this trip isn&apos;t published, so the target will 404 until it is.</span>
              )}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : redirect ? "Save changes" : "Create redirect"}
          </button>
        </div>
      </div>
    </div>
  )
}
