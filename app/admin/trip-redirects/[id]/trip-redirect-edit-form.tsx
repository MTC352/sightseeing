"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save, ArrowLeft } from "lucide-react"
import Link from "next/link"

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
          <select className={inputClass} value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">— Select a trip —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.status !== "published" ? ` (${t.status})` : ""}
              </option>
            ))}
          </select>
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
