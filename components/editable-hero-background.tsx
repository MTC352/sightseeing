"use client"

import { useRef, useState } from "react"
import { ImageIcon, Upload, Link2, Loader2, X, Check, Plus, Images, Clock } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { HeroSlideshow } from "@/components/hero-slideshow"
import { cn } from "@/lib/utils"

const DEFAULT_HERO_IMAGE =
  "https://media.tacdn.com/media/attractions-splice-spp-674x446/0b/0f/41/0d.jpg"

/** page_content keys (slug __inline__). */
const IMAGES_KEY = "home:hero:images"
const INTERVAL_KEY = "home:hero:interval"
const LEGACY_KEY = "home:hero:background-image"

const DEFAULT_INTERVAL = 5
const MIN_INTERVAL = 2
const MAX_INTERVAL = 30

/**
 * Parse the admin's EXPLICIT hero images (no default fallback baked in).
 * Precedence: JSON array under IMAGES_KEY → legacy single-image key → none.
 * An explicit empty array (admin removed everything) returns [].
 */
function parseExplicitImages(raw: string | undefined, legacy: string | undefined): string[] {
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      }
    } catch {
      /* fall through to legacy */
    }
  }
  if (typeof legacy === "string" && legacy.trim()) return [legacy.trim()]
  return []
}

function parseInterval(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10)
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n))
}

/**
 * EditableHeroBackground
 * ----------------------
 * Drop-in replacement for the single-image EditableImage on the homepage hero.
 * Renders a HeroSlideshow (static for 1 image, cross-fading for 2+) for every
 * visitor, and — in Edit Mode — an amber management panel to add/remove images
 * and set the auto-slide interval. Values persist in page_content via the
 * edit-mode context (JSON-encoded array under "home:hero:images").
 */

/** Accept only http(s) absolute URLs or site-relative paths for image sources. */
function isAllowedImageUrl(u: string): boolean {
  if (u.startsWith("/")) return true
  try {
    const { protocol } = new URL(u)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function EditableHeroBackground() {
  const { isEditMode, pendingChanges, savedChanges, addChange, mutateChange } = useEditMode()

  const rawImages = pendingChanges[IMAGES_KEY] ?? savedChanges[IMAGES_KEY]
  const legacy = pendingChanges[LEGACY_KEY] ?? savedChanges[LEGACY_KEY]
  const explicit = parseExplicitImages(rawImages, legacy)
  const intervalSeconds = parseInterval(pendingChanges[INTERVAL_KEY] ?? savedChanges[INTERVAL_KEY])

  // Display falls back to the baked-in default when the admin has set nothing.
  const displayImages = explicit.length > 0 ? explicit : [DEFAULT_HERO_IMAGE]

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"upload" | "url">("upload")
  const [urlDraft, setUrlDraft] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Re-derive the current image list from the LATEST pending value at write
  // time (falling back to saved/legacy), so rapid add/remove clicks compose
  // instead of each one overwriting the previous from stale render state.
  function currentImages(pendingRaw: string | undefined): string[] {
    return parseExplicitImages(pendingRaw ?? savedChanges[IMAGES_KEY], savedChanges[LEGACY_KEY])
  }

  function addImage(url: string): boolean {
    const u = url.trim()
    if (!u) return false
    if (!isAllowedImageUrl(u)) {
      setError("Enter a valid image URL (https://… or an uploaded /uploads/… path).")
      return false
    }
    mutateChange(IMAGES_KEY, (cur) => JSON.stringify([...currentImages(cur), u]))
    setError(null)
    return true
  }

  function removeImage(idx: number) {
    mutateChange(IMAGES_KEY, (cur) => JSON.stringify(currentImages(cur).filter((_, i) => i !== idx)))
  }

  function setInterval(seconds: number) {
    const clamped = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, seconds))
    addChange(INTERVAL_KEY, String(clamped))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/trips/upload", { method: "POST", body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? "Upload failed")
      }
      const { url } = await res.json()
      addImage(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  function handleUrl() {
    const u = urlDraft.trim()
    if (!u) return
    if (addImage(u)) {
      setUrlDraft("")
    }
  }

  // Public site (and admins not in edit mode): just the slideshow.
  if (!isEditMode) {
    return <HeroSlideshow images={displayImages} intervalSeconds={intervalSeconds} />
  }

  const isSlideshow = explicit.length > 1

  return (
    <div data-editable="true" className="absolute inset-0">
      <HeroSlideshow images={displayImages} intervalSeconds={intervalSeconds} />

      <div className="absolute bottom-3 left-3 z-30">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-lg transition-colors hover:bg-amber-300"
          >
            <Images className="h-3.5 w-3.5" />
            Hero images{explicit.length > 0 ? ` (${explicit.length})` : ""}
          </button>
        ) : (
          <div className="w-80 rounded-xl border border-amber-300 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <Images className="h-3 w-3" />
                Hero background
              </span>
              <button
                type="button"
                onClick={() => { setOpen(false); setError(null); setUrlDraft("") }}
                className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {/* Mode hint */}
              <div className="px-3 pt-2.5">
                <p className="rounded-md bg-zinc-50 px-2 py-1.5 text-[10px] leading-snug text-zinc-500">
                  {explicit.length <= 1
                    ? "One image shows as a static background. Add a second image to turn it into a slideshow."
                    : `Slideshow active — ${explicit.length} images cross-fade automatically.`}
                </p>
              </div>

              {/* Current images */}
              <div className="px-3 pt-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Current images
                </p>
                {explicit.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-center text-[11px] text-zinc-400">
                    Showing the default image. Add one below to replace it.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {explicit.map((src, i) => (
                      <li
                        key={`${i}-${src}`}
                        className="flex items-center gap-2 rounded-lg border border-zinc-100 p-1.5"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className="h-9 w-12 shrink-0 rounded object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-600">
                          {i + 1}. {src.split("/").pop() || src}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          aria-label={`Remove image ${i + 1}`}
                          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add image */}
              <div className="px-3 pt-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  <Plus className="h-3 w-3" /> Add image
                </p>
                <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("upload")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      mode === "upload" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
                    )}
                  >
                    <Upload className="h-3 w-3" />
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("url")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      mode === "url" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
                    )}
                  >
                    <Link2 className="h-3 w-3" />
                    Paste URL
                  </button>
                </div>

                {mode === "upload" ? (
                  <div className="pt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFile}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 py-3 text-xs text-zinc-500 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                    >
                      {uploading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                      ) : (
                        <><Upload className="h-4 w-4" /> Click to choose file</>
                      )}
                    </button>
                    <p className="mt-1 text-center text-[10px] text-zinc-400">JPEG, PNG, WebP or GIF · max 8 MB</p>
                  </div>
                ) : (
                  <div className="pt-2">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={urlDraft}
                        onChange={(e) => setUrlDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUrl()
                          if (e.key === "Escape") { setUrlDraft(""); setError(null) }
                        }}
                        placeholder="https://…"
                        className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                      />
                      <button
                        type="button"
                        onClick={handleUrl}
                        disabled={!urlDraft.trim()}
                        className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-amber-950 transition-colors hover:bg-amber-300 disabled:opacity-40"
                      >
                        <Check className="h-3 w-3" /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Slideshow interval */}
              <div className="px-3 py-3">
                <label className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  <Clock className="h-3 w-3" /> Auto-slide interval
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={MIN_INTERVAL}
                    max={MAX_INTERVAL}
                    value={intervalSeconds}
                    disabled={!isSlideshow}
                    onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || DEFAULT_INTERVAL)}
                    className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30 disabled:bg-zinc-50 disabled:text-zinc-400"
                  />
                  <span className="text-[11px] text-zinc-500">
                    seconds{!isSlideshow ? " (needs 2+ images)" : ""}
                  </span>
                </div>
              </div>

              {error && <p className="px-3 pb-2.5 text-[11px] text-red-600">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
