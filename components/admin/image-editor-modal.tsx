"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import {
  X, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2,
  Upload, Trash2, Link2, Loader2, RefreshCw, ZoomIn, ZoomOut,
  Check, AlertCircle, Crop as CropIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageEditorModalProps {
  imageUrl: string
  uploadEndpoint: string
  onDone: (newUrl: string | null) => void
  onClose: () => void
}

export function ImageEditorModal({
  imageUrl,
  uploadEndpoint,
  onDone,
  onClose,
}: ImageEditorModalProps) {
  const imgRef = useRef<HTMLImageElement>(null)

  const [displaySrc, setDisplaySrc] = useState<string>(imageUrl)
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [scale, setScale] = useState(1)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [corsBlocked, setCorsBlocked] = useState(false)
  const [transforming, setTransforming] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replaceMode, setReplaceMode] = useState<false | "file" | "url">(false)
  const [urlInput, setUrlInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalSrc = useRef(imageUrl)

  const applyTransforms = useCallback(async (
    src: string,
    rot: 0 | 90 | 180 | 270,
    fH: boolean,
    fV: boolean,
  ) => {
    if (rot === 0 && !fH && !fV) {
      setDisplaySrc(src)
      setCorsBlocked(false)
      return
    }
    setTransforming(true)
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("cors"))
        img.src = src
      })
      const swapped = rot === 90 || rot === 270
      const w = swapped ? img.naturalHeight : img.naturalWidth
      const h = swapped ? img.naturalWidth : img.naturalHeight
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.translate(w / 2, h / 2)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.scale(fH ? -1 : 1, fV ? -1 : 1)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      setDisplaySrc(canvas.toDataURL("image/jpeg", 0.95))
      setCorsBlocked(false)
    } catch {
      // CORS block — show original, disable canvas ops
      setDisplaySrc(src)
      setCorsBlocked(rot !== 0 || fH || fV)
    } finally {
      setTransforming(false)
    }
  }, [])

  useEffect(() => {
    applyTransforms(originalSrc.current, rotation, flipH, flipV)
  }, [rotation, flipH, flipV, applyTransforms])

  function rotateLeft() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setRotation((r) => ((r - 90 + 360) % 360) as 0 | 90 | 180 | 270)
  }
  function rotateRight() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)
  }
  function toggleFlipH() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setFlipH((v) => !v)
  }
  function toggleFlipV() {
    setCrop(undefined)
    setCompletedCrop(undefined)
    setFlipV((v) => !v)
  }
  function resetAll() {
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setScale(1)
    setCrop(undefined)
    setCompletedCrop(undefined)
    originalSrc.current = imageUrl
    setDisplaySrc(imageUrl)
    setError(null)
    setReplaceMode(false)
    setUrlInput("")
  }

  async function handleFileReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(uploadEndpoint, { method: "POST", body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed")
      const { url } = await res.json()
      onDone(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleUrlReplace() {
    const u = urlInput.trim()
    if (!u) return
    onDone(u)
  }

  async function applyAndUpload() {
    const img = imgRef.current
    if (!img) return
    setError(null)
    if (corsBlocked) {
      setError("This image can't be edited in-browser (CORS restriction). Use Replace to upload a new one.")
      return
    }
    setUploading(true)
    try {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")!

      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight
      const displayW = img.width
      const displayH = img.height
      const scaleX = naturalW / displayW
      const scaleY = naturalH / displayH

      let sx = 0, sy = 0, sw = naturalW, sh = naturalH
      if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
        sx = completedCrop.x * scaleX
        sy = completedCrop.y * scaleY
        sw = completedCrop.width * scaleX
        sh = completedCrop.height * scaleY
      }

      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
          "image/jpeg",
          0.92,
        ),
      )
      const fd = new FormData()
      fd.append("file", new File([blob], `edited-${Date.now()}.jpg`, { type: "image/jpeg" }))
      const res = await fetch(uploadEndpoint, { method: "POST", body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed")
      const { url } = await res.json()
      onDone(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply changes")
    } finally {
      setUploading(false)
    }
  }

  const hasEdits =
    rotation !== 0 ||
    flipH ||
    flipV ||
    scale !== 1 ||
    (completedCrop && completedCrop.width > 0 && completedCrop.height > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <CropIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Edit Image</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image area */}
        <div className="relative flex max-h-[50vh] min-h-[200px] items-center justify-center overflow-auto bg-secondary/30 p-4">
          {transforming && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            className="max-h-[46vh] max-w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={displaySrc}
              alt="Edit preview"
              className="max-h-[46vh] max-w-full rounded object-contain"
              style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        {/* Controls */}
        <div className="border-t border-border px-5 py-3">
          {/* Transform buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Transform
            </span>
            <div className="flex items-center gap-1">
              <ToolBtn onClick={rotateLeft} title="Rotate left 90°">
                <RotateCcw className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn onClick={rotateRight} title="Rotate right 90°">
                <RotateCw className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                onClick={toggleFlipH}
                title="Flip horizontal"
                active={flipH}
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
              </ToolBtn>
              <ToolBtn
                onClick={toggleFlipV}
                title="Flip vertical"
                active={flipV}
              >
                <FlipVertical2 className="h-3.5 w-3.5" />
              </ToolBtn>
            </div>

            <div className="mx-2 h-4 w-px bg-border" />

            {/* Scale */}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Scale
            </span>
            <ToolBtn
              onClick={() => setScale((s) => Math.max(0.25, +(s - 0.1).toFixed(2)))}
              title="Zoom out"
              disabled={scale <= 0.25}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </ToolBtn>
            <input
              type="range"
              min="0.25"
              max="2"
              step="0.05"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="h-1 w-20 accent-primary"
              title={`${Math.round(scale * 100)}%`}
            />
            <ToolBtn
              onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)))}
              title="Zoom in"
              disabled={scale >= 2}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </ToolBtn>
            <span className="min-w-[3ch] text-xs text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>

            <div className="mx-2 h-4 w-px bg-border" />

            <ToolBtn onClick={resetAll} title="Reset all changes">
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="ml-1 text-[11px]">Reset</span>
            </ToolBtn>
          </div>

          {/* Crop hint */}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Drag on the image to select a crop area.{" "}
            {completedCrop && completedCrop.width > 0
              ? <span className="text-primary font-medium">{Math.round(completedCrop.width)} × {Math.round(completedCrop.height)} px selected</span>
              : "No crop selected — full image will be used."}
          </p>
        </div>

        {/* Replace section */}
        <div className="border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Replace Image
            </span>
            <button
              type="button"
              onClick={() => setReplaceMode(replaceMode === "file" ? false : "file")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                replaceMode === "file"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-secondary",
              )}
            >
              <Upload className="h-3 w-3" />
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setReplaceMode(replaceMode === "url" ? false : "url")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                replaceMode === "url"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:bg-secondary",
              )}
            >
              <Link2 className="h-3 w-3" />
              Paste URL
            </button>
          </div>

          {replaceMode === "file" && (
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileReplace}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/20 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary/40"
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-4 w-4" /> Click to choose a new image file</>
                )}
              </button>
            </div>
          )}

          {replaceMode === "url" && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlReplace()}
                placeholder="https://…"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={handleUrlReplace}
                disabled={!urlInput.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Use URL
              </button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between rounded-b-2xl border-t border-border bg-secondary/30 px-5 py-3">
          <button
            type="button"
            onClick={() => onDone(null)}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove image
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyAndUpload}
              disabled={uploading || transforming || !hasEdits}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              title={!hasEdits ? "Make a change first (crop, rotate, etc.)" : "Upload and apply changes"}
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</>
              ) : (
                <><Check className="h-3.5 w-3.5" /> Apply changes</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void
  title?: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "flex items-center rounded-lg border px-2 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-foreground hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  )
}
