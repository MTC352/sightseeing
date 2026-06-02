"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  FolderOpen, UploadCloud, Trash2, Loader2, Copy, Check, Search, FileText,
  Film, Music, Image as ImageIcon, File as FileIcon, X,
} from "lucide-react"

type MediaFile = {
  id: string
  filename: string
  title: string | null
  url: string
  mime_type: string
  size_bytes: number
  storage: string
  uploaded_by: string | null
  created_at: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function kindOf(mime: string): "image" | "video" | "audio" | "pdf" | "other" {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (mime === "application/pdf") return "pdf"
  return "other"
}

function KindIcon({ mime, className }: { mime: string; className?: string }) {
  const k = kindOf(mime)
  if (k === "image") return <ImageIcon className={className} />
  if (k === "video") return <Film className={className} />
  if (k === "audio") return <Music className={className} />
  if (k === "pdf") return <FileText className={className} />
  return <FileIcon className={className} />
}

function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (typeof window !== "undefined") return window.location.origin + url
  return url
}

export default function FilesPage() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/media")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load files")
      setFiles(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const uploadFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list)
    if (arr.length === 0) return
    setUploading(true)
    setUploadError("")
    try {
      for (const file of arr) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/admin/media", { method: "POST", body: fd })
        if (!res.ok) {
          const msg = (await res.json().catch(() => ({}))).error || `Failed to upload ${file.name}`
          throw new Error(msg)
        }
      }
      await load()
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }, [load])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? The shareable link will stop working.`)) return
    try {
      const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed")
      setFiles((f) => f.filter((x) => x.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed")
    }
  }

  async function copyLink(file: MediaFile) {
    const link = absoluteUrl(file.url)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopiedId(file.id)
    setTimeout(() => setCopiedId((c) => (c === file.id ? null : c)), 1800)
  }

  const filtered = files.filter((f) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      f.filename.toLowerCase().includes(q) ||
      (f.title ?? "").toLowerCase().includes(q) ||
      f.mime_type.toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Files</h1>
          <p className="text-sm text-muted-foreground">Upload files and copy a shareable link — your media library.</p>
        </div>
      </div>

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-secondary/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="mb-2 h-7 w-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="mb-2 h-7 w-7 text-muted-foreground" />
        )}
        <p className="text-sm font-semibold text-foreground">
          {uploading ? "Uploading…" : "Drop files here or click to upload"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Images, PDFs, video, audio and documents · up to 100&nbsp;MB each
        </p>
      </div>

      {uploadError && (
        <p className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
          <button type="button" onClick={() => setUploadError("")}><X className="h-4 w-4" /></button>
        </p>
      )}

      {/* Search */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{filtered.length} file{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            {files.length === 0 ? "No files yet" : "No files match your search"}
          </p>
          {files.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Upload your first file to get a shareable link.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((file) => {
            const isImage = kindOf(file.mime_type) === "image"
            return (
              <div key={file.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt={file.title ?? file.filename} className="h-full w-full object-cover" />
                  ) : (
                    <KindIcon mime={file.mime_type} className="h-10 w-10 text-muted-foreground/60" />
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(file.id, file.title ?? file.filename)}
                    className="absolute right-1.5 top-1.5 rounded-md bg-background/80 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground" title={file.filename}>
                      {file.title ?? file.filename}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {file.mime_type.split("/")[1] || file.mime_type} · {formatSize(file.size_bytes)}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyLink(file)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/70"
                    >
                      {copiedId === file.id ? (
                        <><Check className="h-3 w-3 text-emerald-600" /> Copied</>
                      ) : (
                        <><Copy className="h-3 w-3" /> Copy link</>
                      )}
                    </button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      Open
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
