"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  FolderOpen, UploadCloud, Trash2, Loader2, Copy, Check, Search, FileText,
  Film, Music, Image as ImageIcon, File as FileIcon, X, ChevronDown, Link2, Globe,
  LayoutGrid, List, Eye, Calendar, User, HardDrive, ExternalLink, Filter,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog"

type MediaFile = {
  id: string
  filename: string
  title: string | null
  url: string
  mime_type: string
  size_bytes: number
  storage: string
  content_hash: string | null
  uploaded_by: string | null
  uploader_name: string | null
  created_at: string
}

type UsageRef = { type: string; label: string; id: string; title: string; href: string | null }

type FormatKey = "all" | "image" | "video" | "audio" | "pdf" | "other"

const FORMAT_OPTIONS: { key: FormatKey; label: string }[] = [
  { key: "all", label: "All formats" },
  { key: "image", label: "Images" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "pdf", label: "PDF" },
  { key: "other", label: "Documents & other" },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
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
  const [format, setFormat] = useState<FormatKey>("all")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MediaFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [preview, setPreview] = useState<MediaFile | null>(null)
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

  async function confirmDelete() {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/media/${target.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed")
      setFiles((f) => f.filter((x) => x.id !== target.id))
      setPendingDelete(null)
      setPreview((p) => (p && p.id === target.id ? null : p))
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  async function writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
  }

  async function copyLink(file: MediaFile, kind: "relative" | "absolute") {
    const link = kind === "relative" ? file.url : absoluteUrl(file.url)
    await writeClipboard(link)
    setCopiedId(file.id)
    setTimeout(() => setCopiedId((c) => (c === file.id ? null : c)), 1800)
  }

  const filtered = files.filter((f) => {
    if (format !== "all" && kindOf(f.mime_type) !== format) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      f.filename.toLowerCase().includes(q) ||
      (f.title ?? "").toLowerCase().includes(q) ||
      f.mime_type.toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
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
          Images, PDFs, video, audio and documents · up to 100&nbsp;MB each · duplicates are detected automatically
        </p>
      </div>

      {uploadError && (
        <p className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
          <button type="button" onClick={() => setUploadError("")}><X className="h-4 w-4" /></button>
        </p>
      )}

      {/* Toolbar: search + format filter + view toggle */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <span className="shrink-0 text-xs text-muted-foreground">{filtered.length} file{filtered.length === 1 ? "" : "s"}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-48">
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {FORMAT_OPTIONS.find((o) => o.key === format)?.label}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {FORMAT_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.key} onClick={() => setFormat(o.key)} className="gap-2">
                {format === o.key ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5" />}
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            title="Grid view"
            className={`flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
              view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            title="List view"
            className={`flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors ${
              view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
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
            {files.length === 0 ? "No files yet" : "No files match your filters"}
          </p>
          {files.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Upload your first file to get a shareable link.</p>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((file) => {
            const isImage = kindOf(file.mime_type) === "image"
            return (
              <div key={file.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setPreview(file)}
                  className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted"
                  title="Preview"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt={file.title ?? file.filename} className="h-full w-full object-cover" />
                  ) : (
                    <KindIcon mime={file.mime_type} className="h-10 w-10 text-muted-foreground/60" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium text-foreground">
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </span>
                  </span>
                </button>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/70">
                        {copiedId === file.id ? (
                          <><Check className="h-3 w-3 text-emerald-600" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy link <ChevronDown className="h-3 w-3 opacity-60" /></>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onClick={() => copyLink(file, "relative")} className="gap-2">
                          <Link2 className="h-3.5 w-3.5" />
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">Relative link</span>
                            <span className="text-[10px] text-muted-foreground">Best for site code · {file.url}</span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink(file, "absolute")} className="gap-2">
                          <Globe className="h-3.5 w-3.5" />
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">Full URL</span>
                            <span className="text-[10px] text-muted-foreground">Includes domain · for sharing</span>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      onClick={() => setPreview(file)}
                      className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Type</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Size</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Added</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((file) => {
                const isImage = kindOf(file.mime_type) === "image"
                return (
                  <tr key={file.id} className="group transition-colors hover:bg-secondary/30">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setPreview(file)} className="flex items-center gap-3 text-left">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={file.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <KindIcon mime={file.mime_type} className="h-5 w-5 text-muted-foreground/60" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground" title={file.filename}>
                            {file.title ?? file.filename}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{file.filename}</span>
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs uppercase text-muted-foreground md:table-cell">
                      {file.mime_type.split("/")[1] || file.mime_type}
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{formatSize(file.size_bytes)}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">{formatDate(file.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setPreview(file)}
                          className="rounded-md p-2 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyLink(file, "relative")}
                          className="rounded-md p-2 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
                          title="Copy relative link"
                        >
                          {copiedId === file.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(file)}
                          className="rounded-md p-2 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <FilePreviewModal
        file={preview}
        onClose={() => setPreview(null)}
        onDelete={(f) => setPendingDelete(f)}
        onCopy={copyLink}
        copiedId={copiedId}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o && !deleting) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  &ldquo;<span className="font-medium text-foreground">{pendingDelete.title ?? pendingDelete.filename}</span>&rdquo; will be
                  permanently deleted. Any link to it (including links used in your site code) will stop working. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete() }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…</> : "Delete file"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FilePreviewModal({
  file, onClose, onDelete, onCopy, copiedId,
}: {
  file: MediaFile | null
  onClose: () => void
  onDelete: (f: MediaFile) => void
  onCopy: (f: MediaFile, kind: "relative" | "absolute") => void
  copiedId: string | null
}) {
  const [usage, setUsage] = useState<UsageRef[]>([])
  const [usageLoading, setUsageLoading] = useState(false)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setUsage([])
    setUsageLoading(true)
    fetch(`/api/admin/media/${file.id}/usage`)
      .then((r) => (r.ok ? r.json() : { usage: [] }))
      .then((d) => { if (!cancelled) setUsage(d.usage ?? []) })
      .catch(() => { if (!cancelled) setUsage([]) })
      .finally(() => { if (!cancelled) setUsageLoading(false) })
    return () => { cancelled = true }
  }, [file])

  if (!file) return null
  const kind = kindOf(file.mime_type)

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl [&>button]:hidden">
        <div className="flex max-h-[85vh] flex-col md:flex-row">
          {/* Left — preview */}
          <div className="flex min-h-[260px] flex-1 items-center justify-center overflow-auto bg-neutral-900 p-4 md:w-[72%]">
            {kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={file.title ?? file.filename} className="max-h-[78vh] max-w-full object-contain" />
            ) : kind === "video" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={file.url} controls className="max-h-[78vh] max-w-full" />
            ) : kind === "audio" ? (
              <div className="flex w-full max-w-md flex-col items-center gap-4 text-neutral-300">
                <Music className="h-16 w-16" />
                <audio src={file.url} controls className="w-full" />
              </div>
            ) : kind === "pdf" ? (
              <iframe src={file.url} title={file.filename} className="h-[78vh] w-full rounded-md bg-white" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-neutral-300">
                <FileIcon className="h-16 w-16" />
                <span className="text-sm">No inline preview for this file type</span>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open file
                </a>
              </div>
            )}
          </div>

          {/* Right — details */}
          <div className="flex w-full flex-col overflow-y-auto border-t border-border bg-card md:w-[28%] md:border-l md:border-t-0">
            <div className="flex items-start justify-between gap-2 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground" title={file.filename}>
                  {file.title ?? file.filename}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{file.filename}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 p-4">
              {/* File link */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">File link</p>
                <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground" title={file.url}>{file.url}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onCopy(file, "relative")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-secondary px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/70"
                  >
                    {copiedId === file.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(file, "absolute")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <Globe className="h-3 w-3" /> Full URL
                  </button>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2.5">
                <DetailRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Type">
                  {file.mime_type} · {formatSize(file.size_bytes)}
                </DetailRow>
                <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Author">
                  {file.uploader_name ?? "Unknown"}
                </DetailRow>
                <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date added">
                  {formatDate(file.created_at)}
                </DetailRow>
              </div>

              {/* Linked usage */}
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Linked with {usage.length > 0 && <span className="text-foreground">({usage.length})</span>}
                </p>
                {usageLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</p>
                ) : usage.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not linked anywhere yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {usage.map((u) => (
                      <li key={`${u.type}-${u.id}`}>
                        {u.href ? (
                          <a href={u.href} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">{u.title}</span>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{u.label}</span>
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                          </a>
                        ) : (
                          <span className="block rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground">{u.title} · {u.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t border-border p-4">
              <button
                type="button"
                onClick={() => onDelete(file)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Delete file
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block break-words text-foreground">{children}</span>
      </span>
    </div>
  )
}
