"use client"

import { useRef, useState } from "react"
import { Upload, Link2, Loader2, X, Check, Plus, Images, Clock, FolderOpen, Search } from "lucide-react"
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

/** Minimal shape of a media-library row needed by the picker. */
type LibraryImage = { id: string; url: string; title: string | null; filename: string; mime_type: string }

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
  const [mode, setMode] = useState<"upload" | "url" | "library">("upload")
  const [urlDraft, setUrlDraft] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Media library picker state.
  const [library, setLibrary] = useState<LibraryImage[] | null>(null)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [librarySearch, setLibrarySearch] = useState("")
  const LIBRARY_PAGE = 18
  const [libraryLimit, setLibraryLimit] = useState(LIBRARY_PAGE)

  async function loadLibrary() {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const res = await fetch("/api/admin/media", { cache: "no-store" })
      if (!res.ok) throw new Error("Could not load files")
      const data: LibraryImage[] = await res.json()
      // Only image files are selectable; dedupe by URL so the same file never
      // appears twice in the picker.
      const seen = new Set<string>()
      const images = data.filter((f) => {
        if (!f?.mime_type?.startsWith("image/")) return false
        if (!f.url || seen.has(f.url)) return false
        seen.add(f.url)
        return true
      })
      setLibrary(images)
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Could not load files")
    } finally {
      setLibraryLoading(false)
    }
  }

  function openLibrary() {
    setMode("library")
    setError(null)
    setLibrarySearch("")
    setLibraryLimit(LIBRARY_PAGE)
    if (!library && !libraryLoading) loadLibrary()
  }

  // Re-derive the current image list from the LATEST pending value at write
  // time (falling back to saved/legacy), so rapid add/remove clicks compose
  // instead of each one overwriting the previous from stale render state.
  // When nothing is explicitly stored the hero shows DEFAULT_HERO_IMAGE, so we
  // treat that default as the first selected image — this way "Add image"
  // APPENDS to it instead of replacing it. The admin can still remove it after.
  function currentImages(pendingRaw: string | undefined): string[] {
    const parsed = parseExplicitImages(pendingRaw ?? savedChanges[IMAGES_KEY], savedChanges[LEGACY_KEY])
    return parsed.length > 0 ? parsed : [DEFAULT_HERO_IMAGE]
  }

  function addImage(url: string): boolean {
    const u = url.trim()
    if (!u) return false
    if (!isAllowedImageUrl(u)) {
      setError("Enter a valid image URL (https://… or an uploaded /uploads/… path).")
      return false
    }
    // Never add the same image twice (skip the write if it's already present).
    mutateChange(IMAGES_KEY, (cur) => {
      const list = currentImages(cur)
      return list.includes(u) ? JSON.stringify(list) : JSON.stringify([...list, u])
    })
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

  const isSlideshow = displayImages.length > 1

  // Library images that aren't already part of the hero selection (no duplicates),
  // narrowed by the search box. Render is paged so huge libraries stay fast.
  const selectedSet = new Set(displayImages)
  const librarySearchQuery = librarySearch.trim().toLowerCase()
  const availableLibrary = (library ?? []).filter((f) => {
    if (selectedSet.has(f.url)) return false
    if (!librarySearchQuery) return true
    return (
      (f.title ?? "").toLowerCase().includes(librarySearchQuery) ||
      f.filename.toLowerCase().includes(librarySearchQuery)
    )
  })
  const visibleLibrary = availableLibrary.slice(0, libraryLimit)
  const remainingLibrary = availableLibrary.length - visibleLibrary.length

  return (
    <div data-editable="true" className="absolute inset-0">
      <HeroSlideshow images={displayImages} intervalSeconds={intervalSeconds} />

      <div className="absolute bottom-3 left-3 z-[60]">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-lg transition-colors hover:bg-amber-300"
          >
            <Images className="h-3.5 w-3.5" />
            Hero images ({displayImages.length})
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
                  {displayImages.length <= 1
                    ? "One image shows as a static background. Add a second image to turn it into a slideshow."
                    : `Slideshow active — ${displayImages.length} images cross-fade automatically.`}
                </p>
              </div>

              {/* Current images */}
              <div className="px-3 pt-2.5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Current images
                </p>
                <ul className="space-y-1.5">
                  {displayImages.map((src, i) => {
                    // When nothing is explicitly stored, displayImages holds the
                    // baked-in default — surface that so the admin knows it's the
                    // current first image (and can keep or remove it).
                    const isDefault = explicit.length === 0
                    return (
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
                          {isDefault && (
                            <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-400">
                              default
                            </span>
                          )}
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
                    )
                  })}
                </ul>
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
                    onClick={openLibrary}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                      mode === "library" ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
                    )}
                  >
                    <FolderOpen className="h-3 w-3" />
                    Files
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
                    URL
                  </button>
                </div>

                {mode === "upload" && (
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
                )}

                {mode === "url" && (
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

                {mode === "library" && (
                  <div className="pt-2">
                    {libraryLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
                      </div>
                    ) : libraryError ? (
                      <p className="py-4 text-center text-[11px] text-red-600">{libraryError}</p>
                    ) : !library || library.length === 0 ? (
                      <p className="py-4 text-center text-[11px] text-zinc-400">
                        No images in your files yet — upload some under Files first.
                      </p>
                    ) : (
                      <>
                        <div className="relative mb-2">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
                          <input
                            type="text"
                            value={librarySearch}
                            onChange={(e) => { setLibrarySearch(e.target.value); setLibraryLimit(LIBRARY_PAGE) }}
                            placeholder="Search files…"
                            className="w-full rounded-lg border border-zinc-200 py-1.5 pl-7 pr-2.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                          />
                        </div>
                        {availableLibrary.length === 0 ? (
                          <p className="py-4 text-center text-[11px] text-zinc-400">
                            {librarySearchQuery
                              ? "No files match your search."
                              : "All your library images are already added."}
                          </p>
                        ) : (
                          <>
                            <div className="max-h-56 overflow-y-auto">
                              <div className="grid grid-cols-3 gap-1.5">
                                {visibleLibrary.map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => addImage(f.url)}
                                    title={f.title || f.filename}
                                    className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-zinc-200 transition-colors hover:border-amber-400"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={f.url}
                                      alt={f.title || f.filename}
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full object-cover"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-amber-400/0 opacity-0 transition-opacity group-hover:bg-amber-400/25 group-hover:opacity-100">
                                      <Plus className="h-4 w-4 text-amber-950" />
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                            {remainingLibrary > 0 && (
                              <button
                                type="button"
                                onClick={() => setLibraryLimit((n) => n + LIBRARY_PAGE)}
                                className="mt-1.5 w-full rounded-lg border border-zinc-200 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-amber-700"
                              >
                                Show more ({remainingLibrary} more)
                              </button>
                            )}
                          </>
                        )}
                        <p className="mt-1.5 text-center text-[10px] text-zinc-400">Only image files from your library are shown.</p>
                      </>
                    )}
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
