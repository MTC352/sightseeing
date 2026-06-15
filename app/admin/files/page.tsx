"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  FolderOpen, UploadCloud, Trash2, Loader2, Copy, Check, Search, FileText,
  Film, Music, Image as ImageIcon, File as FileIcon, X, ChevronDown, Link2, Globe,
  LayoutGrid, List, Eye, Calendar, User, HardDrive, ExternalLink, Filter,
  ChevronLeft, ChevronRight,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [format, setFormat] = useState<FormatKey>("all")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MediaFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [preview, setPreview] = useState<MediaFile | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState("")
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

  const backfillTripImages = useCallback(async () => {
    setBackfilling(true)
    setBackfillMsg("")
    setError("")
    try {
      const res = await fetch("/api/admin/media/backfill-trips", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Import failed")
      const { imagesImported = 0, tripsUpdated = 0, imagesFailed = 0 } = data
      setBackfillMsg(
        imagesImported === 0 && tripsUpdated === 0
          ? "All trip images are already in your library."
          : `Imported ${imagesImported} trip image${imagesImported === 1 ? "" : "s"} from ${tripsUpdated} trip${tripsUpdated === 1 ? "" : "s"}.${imagesFailed ? ` ${imagesFailed} could not be downloaded.` : ""}`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed")
    } finally {
      setBackfilling(false)
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
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-foreground">Files</h1>
          <p className="text-sm text-muted-foreground">Upload files and copy a shareable link — your media library.</p>
        </div>
        <button
          type="button"
          onClick={backfillTripImages}
          disabled={backfilling}
          title="Download images attached to trips (e.g. imported from Palisis) into your media library"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {backfilling ? "Importing…" : "Import trip images"}
        </button>
      </div>

      {backfillMsg && (
        <p className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">
          {backfillMsg}
          <button type="button" onClick={() => setBackfillMsg("")}><X className="h-4 w-4" /></button>
        </p>
      )}

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
      <div className="mb-4 flex items-center gap-2">
        {/* Mobile-only search toggle (collapsed state) */}
        {!searchOpen && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search files"
            aria-label="Search files"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {/* Search input — always visible on sm+, on mobile only when opened */}
        <div
          className={cn(
            "flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2",
            searchOpen ? "flex" : "hidden sm:flex",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            autoFocus={searchOpen}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{filtered.length} file{filtered.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchOpen(false) }}
            className="shrink-0 text-muted-foreground hover:text-foreground sm:hidden"
            title="Close search"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Format filter + view switcher — side by side; hidden on mobile while search is open */}
        <div className={cn("flex items-center gap-2", searchOpen && "hidden sm:flex")}>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-48">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="hidden sm:inline">{FORMAT_OPTIONS.find((o) => o.key === format)?.label}</span>
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

          <div className="flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5">
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
                    <button
                      type="button"
                      onClick={() => setPendingDelete(file)}
                      className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
        files={filtered}
        file={preview}
        onNavigate={setPreview}
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
  files, file, onNavigate, onClose, onDelete, onCopy, copiedId,
}: {
  files: MediaFile[]
  file: MediaFile | null
  onNavigate: (f: MediaFile) => void
  onClose: () => void
  onDelete: (f: MediaFile) => void
  onCopy: (f: MediaFile, kind: "relative" | "absolute") => void
  copiedId: string | null
}) {
  const [usage, setUsage] = useState<UsageRef[]>([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const wasOpenRef = useRef(false)

  // Reset details to collapsed only when the modal transitions from closed → open,
  // so prev/next navigation preserves the user's expanded state.
  useEffect(() => {
    const isOpen = !!file
    if (isOpen && !wasOpenRef.current) setDetailsOpen(false)
    wasOpenRef.current = isOpen
  }, [file])

  const index = file ? files.findIndex((f) => f.id === file.id) : -1
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < files.length - 1
  const goPrev = useCallback(() => { if (index > 0) onNavigate(files[index - 1]) }, [index, files, onNavigate])
  const goNext = useCallback(() => { if (index >= 0 && index < files.length - 1) onNavigate(files[index + 1]) }, [index, files, onNavigate])

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

  useEffect(() => {
    if (!file) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev()
      else if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [file, goPrev, goNext])

  if (!file) return null
  const kind = kindOf(file.mime_type)

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-hidden rounded-xl p-0 sm:w-[calc(100vw-3rem)] sm:max-w-5xl [&>button]:hidden">
        <DialogDescription className="sr-only">
          Preview and details for {file.title ?? file.filename}
        </DialogDescription>
        <div className="flex max-h-[85vh] flex-col md:flex-row">
          {/* Left — preview */}
          <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-neutral-900 p-4">
            {hasPrev && (
              <button
                type="button"
                onClick={goPrev}
                title="Previous file (←)"
                aria-label="Previous file"
                className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={goNext}
                title="Next file (→)"
                aria-label="Next file"
                className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
            {files.length > 1 && index >= 0 && (
              <span className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white">
                {index + 1} / {files.length}
              </span>
            )}
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

          {/* Right — details (collapsible: vertically on mobile, horizontally on desktop) */}
          <div
            className={cn(
              "flex shrink-0 flex-col border-t border-border bg-card md:border-l md:border-t-0",
              detailsOpen ? "w-full md:w-[320px]" : "w-full md:w-12",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 border-b border-border p-3 md:p-4",
                !detailsOpen && "md:flex-col md:items-center md:gap-3 md:border-b-0 md:p-2",
              )}
            >
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                title={detailsOpen ? "Collapse details" : "Show details"}
                aria-label={detailsOpen ? "Collapse details" : "Show details"}
                aria-expanded={detailsOpen}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform md:hidden", detailsOpen && "rotate-180")} />
                <ChevronLeft className={cn("hidden h-4 w-4 transition-transform md:block", detailsOpen && "rotate-180")} />
              </button>
              <div className={cn("min-w-0 flex-1", !detailsOpen && "md:hidden")}>
                <DialogTitle className="truncate text-sm font-bold text-foreground" title={file.filename}>
                  {file.title ?? file.filename}
                </DialogTitle>
                <p className="truncate text-xs text-muted-foreground">{file.filename}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailsOpen && (
            <div className="flex flex-1 flex-col overflow-y-auto">
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
            )}
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
