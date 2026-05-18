"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import type { AdminTrip } from "@/lib/admin-store"
import { Save, ArrowLeft, Plus, X, ExternalLink, Upload, ImagePlus, Loader2, Trash2, AlertCircle } from "lucide-react"
import Link from "next/link"
import { SEOOptimizer } from "@/components/admin/seo-optimizer"

const CATEGORIES = ["Food & Events", "Sports & Nature", "Culture", "Tours", "Gift Vouchers", "Private Tours", "Dinnerhopping", "LUGA Goodies"]
const COMMON_TAGS = ["popular", "outdoor", "indoor", "family", "sport", "culture", "food", "night", "free", "premium", "adventure", "museum", "music", "car", "popular"]

export function TripEditForm({ trip }: { trip: AdminTrip | null }) {
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
    }
  )

  const [tagInput, setTagInput] = useState("")
  const [highlightInput, setHighlightInput] = useState("")
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

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase()
    if (t && !form.tags?.includes(t)) set("tags", [...(form.tags ?? []), t])
    setTagInput("")
  }

  function removeTag(tag: string) {
    set("tags", (form.tags ?? []).filter((t) => t !== tag))
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
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
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
              href={`/trip/${trip.id}`}
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
              <label className={labelClass}>Title</label>
              <input type="text" className={inputClass} placeholder="Trip title" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea rows={4} className={inputClass} placeholder="Trip description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Category</label>
                <select className={inputClass} value={form.category ?? "Tours"} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Duration</label>
                <input type="text" className={inputClass} placeholder="e.g. 2 hours" value={form.duration ?? ""} onChange={(e) => set("duration", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>City</label>
                <input type="text" className={inputClass} placeholder="Luxembourg City" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Provider</label>
                <input type="text" className={inputClass} placeholder="Provider name" value={form.provider ?? ""} onChange={(e) => set("provider", e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Pricing</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Price (€)</label>
              <input type="number" min="0" step="0.01" className={inputClass} value={form.price ?? 0} onChange={(e) => set("price", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelClass}>Original Price (€) — optional</label>
              <input type="number" min="0" step="0.01" className={inputClass} placeholder="For strikethrough" value={form.originalPrice ?? ""} onChange={(e) => set("originalPrice", e.target.value ? parseFloat(e.target.value) : undefined)} />
            </div>
          </div>
        </section>

        {/* Media */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Media</h2>

          {/* Featured Image */}
          <div className="mb-6">
            <label className={labelClass}>Featured Image</label>
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
          </div>

          {/* Image Gallery */}
          <div>
            <label className={labelClass}>Image Gallery</label>
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
          </div>
        </section>

        {/* Tags */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Tags</h2>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(form.tags ?? []).map((tag) => (
              <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 text-primary/60 hover:text-primary"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder="Add tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput) }}}
            />
            <button type="button" onClick={() => addTag(tagInput)} className="rounded-lg border border-border px-3 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {COMMON_TAGS.filter((t) => !(form.tags ?? []).includes(t)).slice(0, 10).map((t) => (
              <button key={t} type="button" onClick={() => addTag(t)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                + {t}
              </button>
            ))}
          </div>
        </section>

        {/* Highlights */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Highlights</h2>
          <div className="mb-3 flex flex-col gap-2">
            {(form.highlights ?? []).map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                <span className="text-sm text-foreground">{h}</span>
                <button type="button" onClick={() => removeHighlight(h)} className="text-muted-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
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
        </section>

        {/* Google Reviews */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Google Reviews</h2>
          <div>
            <label className={labelClass}>Google Business URL</label>
            <input 
              type="url" 
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
              <label className={labelClass}>Badge text (optional)</label>
              <input type="text" className={inputClass} placeholder='e.g. "New", "Popular", "Free"' value={form.badge ?? ""} onChange={(e) => set("badge", e.target.value || undefined)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  { key: "status" as const, label: "Status", type: "select", options: ["published", "draft"] },
                ] as const
              ).map(({ key, label, options }) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <select className={inputClass} value={(form[key] as string) ?? "draft"} onChange={(e) => set(key, e.target.value as "published" | "draft")}>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className={labelClass}>Featured on homepage</label>
                <button
                  type="button"
                  onClick={() => set("featured", !form.featured)}
                  className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.featured ? "bg-primary" : "bg-border"}`}
                  role="switch"
                  aria-checked={form.featured}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.featured ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div>
                <label className={labelClass}>Show in Departures</label>
                <button
                  type="button"
                  onClick={() => set("featuredDeparture", !form.featuredDeparture)}
                  className={`mt-1 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.featuredDeparture ? "bg-primary" : "bg-border"}`}
                  role="switch"
                  aria-checked={form.featuredDeparture}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.featuredDeparture ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SEO Optimizer */}
        <SEOOptimizer
          tripData={form}
          onApplyOptimization={(field, value) => {
            if (field === "highlights" && Array.isArray(value)) {
              set("highlights", value as string[])
            } else if (field === "tags" && Array.isArray(value)) {
              set("tags", value as string[])
            } else if (typeof value === "string") {
              set(field as "title" | "description", value)
            }
          }}
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
