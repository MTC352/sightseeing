"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { AdminTrip } from "@/lib/admin-store"
import { isFieldEditable, resolvePolicy, type TripFieldPolicy } from "@/lib/trip-field-policy"
import { Lock } from "lucide-react"
import { Save, ArrowLeft, Plus, X, ExternalLink, Upload, ImagePlus, Loader2, Trash2, AlertCircle } from "lucide-react"
import Link from "next/link"
import { SEOOptimizer } from "@/components/admin/seo-optimizer"
import { ItineraryEditor } from "@/components/admin/itinerary-editor"
import { RichTextEditor } from "@/components/admin/rich-text-editor"

const CATEGORIES = ["Food & Events", "Sports & Nature", "Culture", "Tours", "Gift Vouchers", "Private Tours", "Dinnerhopping", "LUGA Goodies"]

// ── Palisis / TourCMS friendly-label vocabularies ──────────────────────────────
// Tour-type labels — must match the Palisis "Tour type" radio list verbatim.
const TOUR_TYPE_OPTIONS = [
  "Accommodation (hotel/campsite/villa/ski chalet/lodge)",
  "Transport/Transfer",
  "Tour/cruise - Including overnight stay",
  "Day tour/trip/activity/attraction - No overnight stay",
  "Tailor made",
  "Event",
  "Training/education",
  "Restaurant/meal alternative",
  "Other",
]
const TOUR_LEADER_OPTIONS = [
  "Guided (tour guide / driver)",
  "Independent / Self-drive",
  "Not applicable",
]
const GRADE_OPTIONS = [
  "All ages / Not applicable",
  "Moderate",
  "Fit",
  "Challenging",
  "Extreme",
]
const COMMERCIAL_PRIORITY_OPTIONS = ["HIGH", "MEDIUM", "LOW"]
/** Trip-tag vocabulary type — populated at runtime from /api/admin/trip-tags
 *  (the canonical `trip_tags` table managed in /admin/trip-tags). */
type TripTagOption = { token: string; label: string }

export function TripEditForm({ trip, policy: policyProp }: { trip: AdminTrip | null; policy?: TripFieldPolicy }) {
  const policy = policyProp ?? resolvePolicy(null)
  const can = (key: string) => isFieldEditable(policy, key)
  /** Tiny inline indicator next to a section title when its primary field is read-only. */
  const ReadOnlyBadge = () => (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
      <Lock className="h-2.5 w-2.5" /> Read-only
    </span>
  )
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [form, setForm] = useState<Partial<AdminTrip>>(
    trip ?? {
      title: "",
      description: "",
      price: 0,
      originalPrice: undefined,
      duration: "",
      category: "Tours",
      tags: [],
      city: "Luxembourg",
      provider: "Sightseeing.lu",
      image: "",
      gallery: [],
      highlights: [],
      badge: "",
      googleBusinessUrl: "",
      featured: false,
      featuredDeparture: false,
      status: "draft",
      tripTags: [],
      languages: [],
      included: [],
      excluded: [],
    }
  )

  const [tripTagInput, setTripTagInput] = useState("")
  // Trip-tag vocab fetched from the canonical `trip_tags` table; updates in
  // /admin/trip-tags propagate here automatically on next mount.
  const [tripTagVocab, setTripTagVocab] = useState<TripTagOption[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/trip-tags", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((j) => {
        if (cancelled) return
        const tags = Array.isArray(j?.tags) ? j.tags : []
        setTripTagVocab(tags.map((t: { slug: string; label: string }) => ({ token: t.slug, label: t.label })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [highlightInput, setHighlightInput] = useState("")
  const [languageInput, setLanguageInput] = useState("")
  const [uploadingFeatured, setUploadingFeatured] = useState(false)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const featuredInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/admin/trips/upload", { method: "POST", body: fd })
    if (!res.ok) return null
    const { url } = await res.json()
    return url as string
  }

  async function handleFeaturedUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFeatured(true)
    const url = await uploadFile(file)
    if (url) set("image", url)
    setUploadingFeatured(false)
    e.target.value = ""
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploadingGallery(true)
    const urls = await Promise.all(files.map(uploadFile))
    const valid = urls.filter((u): u is string => !!u)
    set("gallery", [...(form.gallery ?? []), ...valid])
    setUploadingGallery(false)
    e.target.value = ""
  }

  function removeGalleryImage(url: string) {
    set("gallery", (form.gallery ?? []).filter((u) => u !== url))
  }

  function set<K extends keyof AdminTrip>(key: K, value: AdminTrip[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addTripTag(tag: string) {
    // Slugify: lowercase, spaces → dashes, strip junk. Matches TourCMS token style.
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    if (t && !(form.tripTags ?? []).includes(t)) set("tripTags", [...(form.tripTags ?? []), t])
    setTripTagInput("")
  }

  function removeTripTag(tag: string) {
    set("tripTags", (form.tripTags ?? []).filter((t) => t !== tag))
  }

  function addLanguage(lang: string) {
    const l = lang.trim()
    if (l && !(form.languages ?? []).includes(l)) set("languages", [...(form.languages ?? []), l])
    setLanguageInput("")
  }

  function removeLanguage(lang: string) {
    set("languages", (form.languages ?? []).filter((x) => x !== lang))
  }

  function addHighlight(h: string) {
    const ht = h.trim()
    if (ht && !form.highlights?.includes(ht)) set("highlights", [...(form.highlights ?? []), ht])
    setHighlightInput("")
  }

  function removeHighlight(h: string) {
    set("highlights", (form.highlights ?? []).filter((x) => x !== h))
  }

  async function handleSave() {
    if (!form.title?.trim()) {
      setSaveError("Title is required before saving.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const method = trip ? "PATCH" : "POST"
      const url = trip ? `/api/admin/trips/${trip.id}` : `/api/admin/trips`
      // Itinerary steps require BOTH name and description — trim and drop any
      // incomplete rows so partial steps never persist or render.
      const payload = {
        ...form,
        ...(form.itinerarySteps !== undefined
          ? {
              itinerarySteps: (form.itinerarySteps ?? [])
                .map((s) => ({ name: (s.name ?? "").trim(), description: (s.description ?? "").trim() }))
                .filter((s) => s.name && s.description),
            }
          : {}),
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Save failed (${res.status})`)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (!trip) {
        router.push("/admin/trips")
        router.refresh()
      } else {
        router.refresh()
      }
    } catch {
      setSaveError("Network error — please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Note on read-only styling:
  //   - For text inputs / textareas we use `readOnly` so the value stays fully
  //     visible (browsers fade text in `disabled` inputs by ~40%).
  //   - For <select> elements `readOnly` is not supported by the HTML spec,
  //     so we keep `disabled` but neutralise the browser's automatic opacity.
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 " +
    "read-only:bg-muted/30 read-only:cursor-not-allowed read-only:focus:ring-0 read-only:focus:border-border " +
    "disabled:bg-muted/30 disabled:text-foreground disabled:opacity-100 disabled:cursor-not-allowed"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  return (
    <div className="mx-auto max-w-3xl">
      {saveError && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      {/* Top actions */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/trips" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to trips
        </Link>
        <div className="flex items-center gap-2">
          {trip && (
            <Link
              href={`/trip/${trip.slug ?? trip.id}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View on site
            </Link>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Core info */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Core Information</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Title {!can("title") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("title")} className={inputClass} placeholder="Trip title" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
              {!can("title") && <p className="mt-1 text-[10px] text-amber-700/80 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Read-only — managed via Settings</p>}
            </div>
            <div>
              <label className={labelClass}>Description {!can("description") && <ReadOnlyBadge />}</label>
              <div>
                <RichTextEditor
                  value={form.description ?? ""}
                  onChange={(html) => set("description", html)}
                  placeholder="Write your trip description here…"
                  editable={can("description")}
                />
              </div>
              {!can("description") && <p className="mt-1 text-[10px] text-amber-700/80 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Read-only</p>}
            </div>
            <div>
              <label className={labelClass}>URL Slug {!can("slug") && <ReadOnlyBadge />}</label>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-xs text-muted-foreground">/trip/</span>
                <input
                  type="text"
                  readOnly={!can("slug")}
                  className={inputClass}
                  placeholder="auto-generated-from-title"
                  value={form.slug ?? ""}
                  onChange={(e) => set("slug", e.target.value)}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                WordPress-style URL. Leave blank to auto-generate. Saved value is sanitized and kept unique; old id-based links keep redirecting here.
              </p>
              {!can("slug") && <p className="mt-1 text-[10px] text-amber-700/80 flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Read-only — managed via Settings</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category {!can("category") && <ReadOnlyBadge />}</label>
                <select disabled={!can("category")} className={inputClass} value={form.category ?? "Tours"} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Duration {!can("duration") && <ReadOnlyBadge />}</label>
                <input type="text" readOnly={!can("duration")} className={inputClass} placeholder="e.g. 2 hours" value={form.duration ?? ""} onChange={(e) => set("duration", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City {!can("city") && <ReadOnlyBadge />}</label>
                <input type="text" readOnly={!can("city")} className={inputClass} placeholder="Luxembourg City" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Provider {!can("provider") && <ReadOnlyBadge />}</label>
                <input type="text" readOnly={!can("provider")} className={inputClass} placeholder="Provider name" value={form.provider ?? ""} onChange={(e) => set("provider", e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Price (€) {!can("price") && <ReadOnlyBadge />}</label>
              <input type="number" min="0" step="0.01" readOnly={!can("price")} className={inputClass} value={form.price ?? 0} onChange={(e) => set("price", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelClass}>Original Price (€) — optional {!can("originalPrice") && <ReadOnlyBadge />}</label>
              <input type="number" min="0" step="0.01" readOnly={!can("originalPrice")} className={inputClass} placeholder="For strikethrough" value={form.originalPrice ?? ""} onChange={(e) => set("originalPrice", e.target.value ? parseFloat(e.target.value) : undefined)} />
            </div>
          </div>
        </section>

        {/* Media */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground flex items-center">
            Media
            {!can("image") && !can("gallery") && <ReadOnlyBadge />}
          </h2>

          {/* Featured Image */}
          <fieldset disabled={!can("image")} className={`mb-6`}>
            <label className={labelClass}>Featured Image {!can("image") && <ReadOnlyBadge />}</label>
            <input ref={featuredInputRef} type="file" accept="image/*" className="hidden" onChange={handleFeaturedUpload} />

            {form.image ? (
              <div className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.image} alt="Featured" className="h-52 w-full rounded-xl object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => featuredInputRef.current?.click()}
                    disabled={uploadingFeatured}
                    className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-foreground hover:bg-white"
                  >
                    {uploadingFeatured ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => set("image", "")}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-2 text-xs font-medium text-white hover:bg-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => featuredInputRef.current?.click()}
                disabled={uploadingFeatured}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/20 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground disabled:opacity-50"
              >
                {uploadingFeatured ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
                <span className="text-xs font-medium">{uploadingFeatured ? "Uploading…" : "Click to upload featured image"}</span>
                <span className="text-[10px] text-muted-foreground/60">JPEG, PNG, WebP — max 8MB</span>
              </button>
            )}

            {/* Also allow manual URL entry */}
            <div className="mt-2">
              <input
                type="text"
                className={inputClass}
                placeholder="Or paste an image URL…"
                value={form.image ?? ""}
                onChange={(e) => set("image", e.target.value)}
              />
            </div>
          </fieldset>

          {/* Image Gallery */}
          <fieldset disabled={!can("gallery")}>
            <label className={labelClass}>Image Gallery {!can("gallery") && <ReadOnlyBadge />}</label>
            <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />

            {(form.gallery ?? []).length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(form.gallery ?? []).map((url) => (
                  <div key={url} className="group relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Gallery" className="h-full w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(url)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {/* Add more button inside grid */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingGallery}
                  className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/20 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 disabled:opacity-50"
                >
                  {uploadingGallery ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span className="mt-1 text-[9px]">{uploadingGallery ? "Uploading…" : "Add more"}</span>
                </button>
              </div>
            )}

            {(form.gallery ?? []).length === 0 && (
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploadingGallery}
                className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-secondary/20 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 hover:text-foreground disabled:opacity-50"
              >
                {uploadingGallery ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">{uploadingGallery ? "Uploading…" : "Click to upload gallery images"}</span>
                <span className="text-[10px] text-muted-foreground/60">Select multiple images — max 8MB each</span>
              </button>
            )}
          </fieldset>
        </section>

        {/* Highlights */}
        <fieldset disabled={!can("highlights")} className={`rounded-xl border border-border bg-card p-5`}>
          <h2 className="mb-4 text-sm font-semibold text-foreground flex items-center">
            Highlights {!can("highlights") && <ReadOnlyBadge />}
          </h2>
          <div className="mb-3 flex flex-col gap-2">
            {(form.highlights ?? []).map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                <span className="text-sm text-foreground">{h}</span>
                {can("highlights") && (
                  <button type="button" onClick={() => removeHighlight(h)} className="text-muted-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
            {(form.highlights ?? []).length === 0 && (
              <p className="text-[11px] text-muted-foreground/70">No highlights yet.</p>
            )}
          </div>
          {can("highlights") && (
            <div className="flex gap-2">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                placeholder="Add a highlight"
                value={highlightInput}
                onChange={(e) => setHighlightInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHighlight(highlightInput) }}}
              />
              <button type="button" onClick={() => addHighlight(highlightInput)} className="rounded-lg border border-border px-3 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </fieldset>

        {/* Tour Type & Classification */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Tour Classification</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Tour Type {!can("tourType") && <ReadOnlyBadge />}</label>
              <select disabled={!can("tourType")} className={inputClass} value={form.tourType ?? ""} onChange={(e) => set("tourType", e.target.value || null)}>
                <option value="">—</option>
                {TOUR_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tour Leader {!can("tourLeader") && <ReadOnlyBadge />}</label>
              <select disabled={!can("tourLeader")} className={inputClass} value={form.tourLeader ?? ""} onChange={(e) => set("tourLeader", e.target.value || null)}>
                <option value="">—</option>
                {TOUR_LEADER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Grade {!can("grade") && <ReadOnlyBadge />}</label>
              <select disabled={!can("grade")} className={inputClass} value={form.grade ?? ""} onChange={(e) => set("grade", e.target.value || null)}>
                <option value="">—</option>
                {GRADE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Commercial Priority {!can("commercialPriority") && <ReadOnlyBadge />}</label>
              <select disabled={!can("commercialPriority")} className={inputClass} value={form.commercialPriority ?? ""} onChange={(e) => set("commercialPriority", e.target.value || null)}>
                <option value="">—</option>
                {COMMERCIAL_PRIORITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Accommodation Rating {!can("accommodationRating") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("accommodationRating")} className={inputClass} placeholder="e.g. Luxury" value={form.accommodationRating ?? ""} onChange={(e) => set("accommodationRating", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Country (code) {!can("country") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("country")} className={inputClass} placeholder="LU" value={form.country ?? ""} onChange={(e) => set("country", e.target.value || null)} />
            </div>
          </div>
        </section>

        {/* Trip Tags — vocabulary chips + free-text add (when editable) */}
        <fieldset disabled={!can("tripTags")} className={`rounded-xl border border-border bg-card p-5`}>
          <h2 className="mb-1 text-sm font-semibold text-foreground flex items-center">
            Trip Tags {!can("tripTags") && <ReadOnlyBadge />}
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {can("tripTags")
              ? "Toggle suggested tags below, or type a custom one and press Enter to add it."
              : "These tags are managed via Palisis sync. Enable editing under Settings → Trip Field Editability."}
          </p>

          {/* Selected tags */}
          {(form.tripTags ?? []).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(form.tripTags ?? []).map((token) => {
                const def = tripTagVocab.find((v) => v.token === token)
                return (
                  <span key={token} className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    {def?.label ?? token}
                    {can("tripTags") && (
                      <button type="button" onClick={() => removeTripTag(token)} className="ml-0.5 text-primary/60 hover:text-primary">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          {/* Free-text add (editable only) */}
          {can("tripTags") && (
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                placeholder="Add a custom tag and press Enter"
                value={tripTagInput}
                onChange={(e) => setTripTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTripTag(tripTagInput) }}}
              />
              <button type="button" onClick={() => addTripTag(tripTagInput)} className="rounded-lg border border-border px-3 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Suggested vocabulary (toggle on/off, only when editable) */}
          {can("tripTags") && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">Suggested</div>
              <div className="flex flex-wrap gap-1.5">
                {tripTagVocab.map(({ token, label }) => {
                  const selected = (form.tripTags ?? []).includes(token)
                  return (
                    <button
                      key={token}
                      type="button"
                      onClick={() => selected ? removeTripTag(token) : set("tripTags", [...(form.tripTags ?? []), token])}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selected
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {selected ? "✓ " : "+ "}{label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </fieldset>

        {/* Departure Location (friendly label for geocode_start_point) */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Departure & End Location</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Departure Location {!can("departureLocation") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("departureLocation")} className={inputClass} placeholder="e.g. Sightseeing.lu office" value={form.departureLocation ?? ""} onChange={(e) => set("departureLocation", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Departure Geocode (lat,lng) {!can("departureGeocode") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("departureGeocode")} className={inputClass} placeholder="49.603207,6.089869" value={form.departureGeocode ?? ""} onChange={(e) => set("departureGeocode", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>End Location {!can("endLocation") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("endLocation")} className={inputClass} placeholder="Same as departure or other" value={form.endLocation ?? ""} onChange={(e) => set("endLocation", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>End Geocode (lat,lng) {!can("endGeocode") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("endGeocode")} className={inputClass} placeholder="49.603207,6.089869" value={form.endGeocode ?? ""} onChange={(e) => set("endGeocode", e.target.value || null)} />
            </div>
          </div>
        </section>

        {/* Languages — chip + add input */}
        <fieldset disabled={!can("languages")} className={`rounded-xl border border-border bg-card p-5`}>
          <h2 className="mb-1 text-sm font-semibold text-foreground flex items-center">
            Languages Spoken {!can("languages") && <ReadOnlyBadge />}
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            {can("languages") ? "Type a language and press Enter to add it." : "Synced from Palisis."}
          </p>
          {(form.languages ?? []).length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(form.languages ?? []).map((lang) => (
                <span key={lang} className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {lang}
                  {can("languages") && (
                    <button type="button" onClick={() => removeLanguage(lang)} className="ml-0.5 text-primary/60 hover:text-primary">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {can("languages") && (
            <div className="flex gap-2">
              <input
                type="text"
                className={`${inputClass} flex-1`}
                placeholder="e.g. English"
                value={languageInput}
                onChange={(e) => setLanguageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLanguage(languageInput) }}}
              />
              <button type="button" onClick={() => addLanguage(languageInput)} className="rounded-lg border border-border px-3 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </fieldset>

        {/* Included / Excluded */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">What's Included &amp; Excluded</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelClass}>Included (one per line) {!can("included") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("included")}
                className={`${inputClass} min-h-[120px] font-sans`}
                placeholder={"E-Bike rental\nHelmet"}
                value={(form.included ?? []).join("\n")}
                onChange={(e) => set("included", e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <div>
              <label className={labelClass}>Excluded (one per line) {!can("excluded") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("excluded")}
                className={`${inputClass} min-h-[120px] font-sans`}
                placeholder={"Food & drinks\nSnacks"}
                value={(form.excluded ?? []).join("\n")}
                onChange={(e) => set("excluded", e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))}
              />
            </div>
          </div>
        </section>

        {/* Long-form text fields */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Detailed Descriptions</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelClass}>Short Description {!can("shortDescription") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("shortDescription")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.shortDescription ?? ""}
                onChange={(e) => set("shortDescription", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Long Description {!can("longDescription") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("longDescription")}
                className={`${inputClass} min-h-[160px] font-sans`}
                value={form.longDescription ?? ""}
                onChange={(e) => set("longDescription", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Experience / Highlights (raw text) {!can("experienceHighlights") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("experienceHighlights")}
                className={`${inputClass} min-h-[100px] font-sans`}
                value={form.experienceHighlights ?? ""}
                onChange={(e) => set("experienceHighlights", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Itinerary {!can("itinerary") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("itinerary")}
                className={`${inputClass} min-h-[120px] font-sans`}
                value={form.itinerary ?? ""}
                onChange={(e) => set("itinerary", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Essential Information {!can("essentialInformation") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("essentialInformation")}
                className={`${inputClass} min-h-[100px] font-sans`}
                value={form.essentialInformation ?? ""}
                onChange={(e) => set("essentialInformation", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Hotel Pickup Instructions {!can("hotelPickupInstructions") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("hotelPickupInstructions")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.hotelPickupInstructions ?? ""}
                onChange={(e) => set("hotelPickupInstructions", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Voucher Redemption Instructions {!can("voucherRedemptionInstructions") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("voucherRedemptionInstructions")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.voucherRedemptionInstructions ?? ""}
                onChange={(e) => set("voucherRedemptionInstructions", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Restrictions {!can("restrictions") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("restrictions")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.restrictions ?? ""}
                onChange={(e) => set("restrictions", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Extras / Upgrades {!can("extras") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("extras")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.extras ?? ""}
                onChange={(e) => set("extras", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Receipt Information {!can("receiptInformation") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("receiptInformation")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.receiptInformation ?? ""}
                onChange={(e) => set("receiptInformation", e.target.value || null)}
              />
            </div>
            <div>
              <label className={labelClass}>Cancellation Policy {!can("cancellationPolicy") && <ReadOnlyBadge />}</label>
              <textarea
                readOnly={!can("cancellationPolicy")}
                className={`${inputClass} min-h-[80px] font-sans`}
                value={form.cancellationPolicy ?? ""}
                onChange={(e) => set("cancellationPolicy", e.target.value || null)}
              />
            </div>
          </div>
        </section>

        {/* Booking constraints */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Booking Constraints</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Min Booking Size {!can("minBookingSize") && <ReadOnlyBadge />}</label>
              <input type="number" min="0" readOnly={!can("minBookingSize")} className={inputClass} value={form.minBookingSize ?? ""} onChange={(e) => set("minBookingSize", e.target.value === "" ? null : parseInt(e.target.value, 10))} />
            </div>
            <div>
              <label className={labelClass}>Max Booking Size {!can("maxBookingSize") && <ReadOnlyBadge />}</label>
              <input type="number" min="0" readOnly={!can("maxBookingSize")} className={inputClass} value={form.maxBookingSize ?? ""} onChange={(e) => set("maxBookingSize", e.target.value === "" ? null : parseInt(e.target.value, 10))} />
            </div>
            <div>
              <label className={labelClass}>Next Bookable Date {!can("nextBookableDate") && <ReadOnlyBadge />}</label>
              <input type="date" readOnly={!can("nextBookableDate")} className={inputClass} value={form.nextBookableDate ?? ""} onChange={(e) => set("nextBookableDate", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Last Bookable Date {!can("lastBookableDate") && <ReadOnlyBadge />}</label>
              <input type="date" readOnly={!can("lastBookableDate")} className={inputClass} value={form.lastBookableDate ?? ""} onChange={(e) => set("lastBookableDate", e.target.value || null)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Non-refundable {!can("nonRefundable") && <ReadOnlyBadge />}</label>
              <button
                type="button"
                disabled={!can("nonRefundable")}
                onClick={() => can("nonRefundable") && set("nonRefundable", !form.nonRefundable)}
                className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${form.nonRefundable ? "bg-primary" : "bg-border"}`}
                role="switch"
                aria-checked={form.nonRefundable}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.nonRefundable ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Media files: PDF + Video */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Additional Media</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>PDF Document URL {!can("pdfUrl") && <ReadOnlyBadge />}</label>
              <input type="url" readOnly={!can("pdfUrl")} className={inputClass} placeholder="https://…" value={form.pdfUrl ?? ""} onChange={(e) => set("pdfUrl", e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Video URL {!can("videoUrl") && <ReadOnlyBadge />}</label>
              <input type="url" readOnly={!can("videoUrl")} className={inputClass} placeholder="https://…" value={form.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value || null)} />
            </div>
          </div>
        </section>

        {/* Google Reviews */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Google Reviews</h2>
          <div>
            <label className={labelClass}>Google Business URL {!can("googleBusinessUrl") && <ReadOnlyBadge />}</label>
            <input
              type="url"
              readOnly={!can("googleBusinessUrl")}
              className={inputClass}
              placeholder="https://www.google.com/maps/place/..."
              value={form.googleBusinessUrl ?? ""}
              onChange={(e) => set("googleBusinessUrl", e.target.value || undefined)}
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              <strong>How to get the correct link:</strong> Open the location on Google Maps, copy the full URL from the address bar (e.g., <code className="inline bg-secondary px-1">https://www.google.com/maps/place/Business+Name/...</code>). The business name must be visible in the URL.
            </p>
          </div>
        </section>

        {/* Options */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Options</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Badge text (optional) {!can("badge") && <ReadOnlyBadge />}</label>
              <input type="text" readOnly={!can("badge")} className={inputClass} placeholder='e.g. "New", "Popular", "Free"' value={form.badge ?? ""} onChange={(e) => set("badge", e.target.value || undefined)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  { key: "status" as const, label: "Status", type: "select", options: ["published", "draft"] },
                ] as const
              ).map(({ key, label, options }) => (
                <div key={key}>
                  <label className={labelClass}>{label} {!can("status") && <ReadOnlyBadge />}</label>
                  <select disabled={!can("status")} className={inputClass} value={(form[key] as string) ?? "draft"} onChange={(e) => set(key, e.target.value as "published" | "draft")}>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className={labelClass}>Featured on homepage {!can("featured") && <ReadOnlyBadge />}</label>
                <button
                  type="button"
                  disabled={!can("featured")}
                  onClick={() => can("featured") && set("featured", !form.featured)}
                  className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${form.featured ? "bg-primary" : "bg-border"}`}
                  role="switch"
                  aria-checked={form.featured}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.featured ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SEO Optimizer */}
        <SEOOptimizer
          tripData={form}
          onApplyOptimization={(field, value) => {
            // Gate every SEO write through the field policy — UI must respect read-only.
            if (field === "highlights" && Array.isArray(value)) {
              if (can("highlights")) set("highlights", value as string[])
            } else if (field === "tags" && Array.isArray(value)) {
              if (can("tripTags")) set("tripTags", value as string[])
            } else if (typeof value === "string") {
              if (can(field as string)) set(field as "title" | "description", value)
            }
          }}
        />

        {/* Itinerary steps */}
        <ItineraryEditor
          tripId={trip?.id}
          steps={form.itinerarySteps ?? []}
          onChange={(steps) => set("itinerarySteps", steps)}
        />
      </div>

      {/* Bottom save */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save Trip"}
        </button>
      </div>

    </div>
  )
}
