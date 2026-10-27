/**
 * lib/ticket-attachment-rules.ts
 * Pure (no Node/DB deps) rules for support-ticket attachments, shared by the
 * admin API, the download route and the ticket UI.
 *
 * Attachments are internal: only full admins (superadmin or a "*" full-access
 * employee) may upload or open them, and they are never emailed.
 */
import { SAFE_EXTENSIONS, normalizeExtension, validateFile, type FileLike } from "./file-rules"

export const TICKET_ATTACHMENT_EXTENSIONS = [
  "pdf", "jpg", "jpeg", "png", "webp", "gif",
  "doc", "docx", "xls", "xlsx", "txt", "csv",
] as const
export const TICKET_ATTACHMENT_MAX_MB = 10
export const TICKET_ATTACHMENT_MAX_FILES = 5

/** `accept` attribute for the file picker. */
export const TICKET_ATTACHMENT_ACCEPT = TICKET_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",")

/** Types the browser may render in place; everything else is downloaded. */
const INLINE_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"])

export interface TicketAttachment {
  id: string
  ticketId: string
  replyId: string | null
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

/** Validate one message's files: count, then type/MIME/size per file. */
export function validateTicketFiles(files: FileLike[]): { ok: true } | { ok: false; error: string } {
  if (files.length > TICKET_ATTACHMENT_MAX_FILES) {
    return { ok: false, error: `Too many files. Maximum ${TICKET_ATTACHMENT_MAX_FILES} per message.` }
  }
  const rules = { maxSizeMb: TICKET_ATTACHMENT_MAX_MB, allowedExtensions: [...TICKET_ATTACHMENT_EXTENSIONS] }
  for (const file of files) {
    if (file.size <= 0) return { ok: false, error: `${file.name} is empty.` }
    const result = validateFile(file, rules)
    if (!result.ok) return { ok: false, error: `${file.name}: ${result.error}` }
  }
  return { ok: true }
}

/** Lowercase extension of a filename ("" when it has none). */
export function fileExtension(filename: string): string {
  return filename.includes(".") ? normalizeExtension(filename.split(".").pop()!) : ""
}

/**
 * Canonical MIME for a validated extension. Stored and served instead of the
 * client-supplied type, so a file can never be replayed under another type.
 */
export function mimeForExtension(ext: string): string {
  return SAFE_EXTENSIONS[ext]?.[0] || "application/octet-stream"
}

export function isInlineMimeType(mime: string): boolean {
  return INLINE_MIME_TYPES.has(mime)
}

/** Disk key `<ticketId>/<uuid>.<ext>` — the only shape the server will read. */
export function isSafeStorageKey(key: string): boolean {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(key)
}

/**
 * Content-Disposition with an ASCII fallback plus the RFC 5987 UTF-8 name, so
 * names like "Rechnung März.pdf" survive and quotes/newlines can't break out.
 */
export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file"
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Strip path components and control characters from an uploaded filename. */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ""
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || "file"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
