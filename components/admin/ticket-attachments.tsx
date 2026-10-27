"use client"

import { useRef, useState } from "react"
import { Paperclip, X, FileText, FileSpreadsheet, File as FileIcon, Download, AlertCircle } from "lucide-react"
import {
  TICKET_ATTACHMENT_ACCEPT,
  TICKET_ATTACHMENT_MAX_FILES,
  TICKET_ATTACHMENT_MAX_MB,
  formatFileSize,
  validateTicketFiles,
  type TicketAttachment,
} from "@/lib/ticket-attachment-rules"

const attachmentUrl = (id: string) => `/api/admin/tickets/attachments/${id}`

function iconFor(mime: string) {
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return FileSpreadsheet
  if (mime === "application/pdf" || mime.includes("word") || mime === "text/plain") return FileText
  return FileIcon
}

/** "Attach files" button + the list of files picked for the next message. */
export function TicketAttachmentPicker({
  files,
  onChange,
  disabled,
}: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return
    const next = [...files, ...Array.from(picked)]
    // Same rules as the server, checked up front so the message isn't lost.
    const check = validateTicketFiles(next)
    if (!check.ok) setError(check.error)
    else {
      setError(null)
      onChange(next)
    }
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="mt-3 space-y-2">
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => { setError(null); onChange(files.filter((_, j) => j !== i)) }}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= TICKET_ATTACHMENT_MAX_FILES}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <Paperclip className="h-3.5 w-3.5" /> Attach files
        </button>
        <span className="text-[11px] text-muted-foreground">
          PDF, images, Word, Excel, TXT, CSV &middot; up to {TICKET_ATTACHMENT_MAX_FILES} files, {TICKET_ATTACHMENT_MAX_MB} MB each &middot; visible to full admins only, never emailed
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={TICKET_ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
    </div>
  )
}

/** Attachments on a ticket message: image thumbnails, file chips for the rest. */
export function TicketAttachmentList({ attachments }: { attachments: TicketAttachment[] }) {
  if (attachments.length === 0) return null
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"))
  const others = attachments.filter((a) => !a.mimeType.startsWith("image/"))

  return (
    <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={attachmentUrl(a.id)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${a.filename} (${formatFileSize(a.sizeBytes)})`}
              className="block h-24 w-24 overflow-hidden rounded-lg border border-border bg-secondary"
            >
              <img src={attachmentUrl(a.id)} alt={a.filename} loading="lazy" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {others.map((a) => {
            const Icon = iconFor(a.mimeType)
            return (
              <li key={a.id} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a
                  href={attachmentUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate font-medium text-foreground hover:text-primary hover:underline"
                >
                  {a.filename}
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(a.sizeBytes)}</span>
                <a
                  href={`${attachmentUrl(a.id)}?download=1`}
                  aria-label={`Download ${a.filename}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
