"use client"

import { useState, useRef } from "react"
import { ImageIcon, Upload, Link2, Loader2, X, Check } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { cn } from "@/lib/utils"

interface EditableImageProps {
  /** Unique key for this content element, e.g. "home:hero:background-image" */
  id: string
  /** Default/fallback image URL baked into the code */
  defaultValue: string
  /**
   * Render prop — receives the resolved (possibly overridden) image URL.
   * Return any JSX that uses the src.
   */
  children: (src: string) => React.ReactNode
  /** Label text on the amber Change button */
  label?: string
  /**
   * CSS classes forwarded to the wrapper div in edit mode.
   * Use this when the img inside uses absolute positioning so the wrapper
   * inherits the same dimensions (e.g. className="absolute inset-0").
   */
  className?: string
}

export function EditableImage({
  id,
  defaultValue,
  children,
  label = "Change image",
  className,
}: EditableImageProps) {
  const { isEditMode, pendingChanges, savedChanges, addChange } = useEditMode()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"upload" | "url">("upload")
  const [urlDraft, setUrlDraft] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Resolution order: unsaved pending > persisted server value > code default
  const displaySrc = pendingChanges[id] ?? savedChanges[id] ?? defaultValue

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
      addChange(id, url)
      setOpen(false)
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
    addChange(id, u)
    setUrlDraft("")
    setOpen(false)
    setError(null)
  }

  function close() {
    setOpen(false)
    setError(null)
    setUrlDraft("")
  }

  // Outside edit mode — render children transparently, no wrapper at all
  if (!isEditMode) {
    return <>{children(displaySrc)}</>
  }

  return (
    // className is forwarded so callers can pass "absolute inset-0" etc.
    // "relative" is always added so the button overlay positions correctly.
    <div className={cn(/\b(absolute|fixed|sticky)\b/.test(className ?? "") ? "" : "relative", className)}>
      {children(displaySrc)}

      {/* "Change image" button — always visible in edit mode */}
      <div className="absolute bottom-3 left-3 z-30">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-lg transition-colors hover:bg-amber-300"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {label}
          </button>
        ) : (
          /* Inline picker panel */
          <div className="w-72 rounded-xl border border-amber-300 bg-white shadow-2xl">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <ImageIcon className="h-3 w-3" />
                Change image
              </span>
              <button
                type="button"
                onClick={close}
                className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="px-3 pt-2.5">
              <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("upload")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    mode === "upload"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
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
                    mode === "url"
                      ? "bg-white text-zinc-800 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  <Link2 className="h-3 w-3" />
                  Paste URL
                </button>
              </div>
            </div>

            {/* Upload mode */}
            {mode === "upload" && (
              <div className="px-3 py-2.5">
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
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 py-3.5 text-xs text-zinc-500 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Click to choose file
                    </>
                  )}
                </button>
                <p className="mt-1 text-center text-[10px] text-zinc-400">
                  JPEG, PNG, WebP or GIF · max 8 MB
                </p>
              </div>
            )}

            {/* URL mode */}
            {mode === "url" && (
              <div className="px-3 py-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUrl()
                      if (e.key === "Escape") close()
                    }}
                    placeholder="https://…"
                    className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleUrl}
                    disabled={!urlDraft.trim()}
                    className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-amber-950 transition-colors hover:bg-amber-300 disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" />
                    Use
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="px-3 pb-2.5 text-[11px] text-red-600">{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
