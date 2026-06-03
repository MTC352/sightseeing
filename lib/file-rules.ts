/**
 * lib/file-rules.ts
 * Shared, framework-agnostic logic for file-upload validation rules.
 *
 * Two layers of rules exist, both stored in the `integrations` table under the
 * single row key `file_upload_rules`:
 *  - Global default rules — meta `{maxSizeMb, allowedExtensions}`.
 *  - Per-role overrides — meta `roles[role]` (nullable per role). When a role
 *    has no entry, everyone with that role inherits the global default.
 *
 * SECURITY: the *configurable* allow-list is always intersected with a fixed,
 * server-side SAFE set. An admin can never widen uploads to active-content types
 * (svg, html, js, …) by editing the rules — those are never in SAFE_EXTENSIONS.
 * A hard 100 MB ceiling also applies regardless of the configured size.
 */

export const HARD_MAX_MB = 100

/**
 * The only file types the platform will ever accept, mapped to the MIME types
 * each extension is allowed to present. Deliberately excludes svg and any
 * active-content/executable type.
 */
export const SAFE_EXTENSIONS: Record<string, string[]> = {
  // Images
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  avif: ["image/avif"],
  // Documents
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain", "text/x-markdown", ""],
  csv: ["text/csv", "application/csv", "text/plain"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  // Archives
  zip: ["application/zip", "application/x-zip-compressed"],
  // Audio
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
  ogg: ["audio/ogg"],
  // Video
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  mov: ["video/quicktime"],
  avi: ["video/x-msvideo"],
}

export const ALL_SAFE_EXTENSIONS = Object.keys(SAFE_EXTENSIONS)

/**
 * Every MIME type any SAFE extension may legitimately present. Used as a fixed
 * server-side backstop so active-content types (svg, html, js, …) can never be
 * accepted, while staying in lockstep with SAFE_EXTENSIONS (no drift between the
 * configurable rules and the backstop). The empty-string sentinel (some clients
 * send no MIME for .md) is intentionally excluded — callers must allow empty
 * MIME separately.
 */
export const ALL_SAFE_MIME_TYPES = new Set<string>(
  Object.values(SAFE_EXTENSIONS).flat().filter((m) => m !== ""),
)

export interface FileRules {
  maxSizeMb: number
  allowedExtensions: string[]
}

/** Hard-coded fallback used when no global rules row exists. */
export const DEFAULT_RULES: FileRules = {
  maxSizeMb: 25,
  allowedExtensions: ["pdf", "jpg", "jpeg", "png", "mp4", "md", "docx"],
}

/** Normalise an arbitrary string into a bare lowercase extension token. */
export function normalizeExtension(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "")
    .replace(/[^a-z0-9]/g, "")
}

/** Coerce unknown JSON into a clean, SAFE-clamped FileRules object. */
export function sanitizeRules(input: unknown): FileRules | null {
  if (!input || typeof input !== "object") return null
  const obj = input as Record<string, unknown>

  let maxSizeMb = Number(obj.maxSizeMb)
  if (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0) maxSizeMb = DEFAULT_RULES.maxSizeMb
  maxSizeMb = Math.min(Math.max(1, Math.round(maxSizeMb)), HARD_MAX_MB)

  const rawExts = Array.isArray(obj.allowedExtensions) ? obj.allowedExtensions : []
  const seen = new Set<string>()
  for (const e of rawExts) {
    const ext = normalizeExtension(String(e))
    if (ext && ext in SAFE_EXTENSIONS) seen.add(ext)
  }
  const allowedExtensions = Array.from(seen)
  if (allowedExtensions.length === 0) return null

  return { maxSizeMb, allowedExtensions }
}

/**
 * Resolve the effective rules for a user: their override if present, else the
 * global default, else the hard-coded fallback. The result is always
 * SAFE-clamped.
 */
export function resolveEffectiveRules(
  globalRules: unknown,
  userRules: unknown,
): FileRules {
  const user = sanitizeRules(userRules)
  if (user) return user
  const global = sanitizeRules(globalRules)
  if (global) return global
  return { ...DEFAULT_RULES }
}

export interface HelpAttachment {
  id: string
  filename: string
  title: string | null
  url: string
  mimeType: string | null
  sizeBytes: number | null
}

/**
 * A URL is safe to render as an <a href> if it is a same-origin relative path
 * (e.g. `/uploads/x.pdf`) or an absolute http(s) URL. Everything else —
 * `javascript:`, `data:`, `vbscript:`, protocol-relative `//evil`, etc. — is
 * rejected to prevent stored XSS via attachment links.
 */
export function isSafeAttachmentUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  const url = raw.trim()
  if (!url) return false
  if (url.startsWith("//")) return false
  if (url.startsWith("/")) return true
  try {
    const proto = new URL(url).protocol
    return proto === "https:" || proto === "http:"
  } catch {
    return false
  }
}

/**
 * Coerce arbitrary JSON into a clean, safe array of help attachments. Drops any
 * entry without a SAFE url, clamps string lengths, and caps the count. This is
 * the trust boundary for attachment metadata coming from admin clients.
 */
export function sanitizeAttachments(input: unknown): HelpAttachment[] {
  if (!Array.isArray(input)) return []
  const out: HelpAttachment[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue
    const o = raw as Record<string, unknown>
    if (!isSafeAttachmentUrl(o.url)) continue
    const url = String(o.url).trim()
    const filename = typeof o.filename === "string" && o.filename.trim()
      ? o.filename.trim().slice(0, 300)
      : "file"
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 300) : null
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 100) : randomId()
    const mimeType = typeof o.mimeType === "string" && o.mimeType.trim() ? o.mimeType.trim().slice(0, 150) : null
    const sizeNum = Number(o.sizeBytes)
    const sizeBytes = Number.isFinite(sizeNum) && sizeNum >= 0 ? Math.round(sizeNum) : null
    out.push({ id, filename, title, url, mimeType, sizeBytes })
    if (out.length >= 50) break
  }
  return out
}

function randomId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  } catch {
    return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}

export interface FileLike {
  name: string
  type: string
  size: number
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

/**
 * Validate a file against effective rules AND the fixed SAFE allow-list.
 * Checks extension membership, MIME consistency, and size.
 */
export function validateFile(file: FileLike, rules: FileRules): ValidationResult {
  const ext = file.name.includes(".")
    ? normalizeExtension(file.name.split(".").pop()!)
    : ""

  if (!ext) {
    return { ok: false, error: "File has no extension and cannot be validated." }
  }
  if (!(ext in SAFE_EXTENSIONS)) {
    return { ok: false, error: `Files of type .${ext} are not allowed.` }
  }
  if (!rules.allowedExtensions.includes(ext)) {
    return {
      ok: false,
      error: `.${ext} files are not permitted by your upload rules. Allowed: ${rules.allowedExtensions
        .map((e) => `.${e}`)
        .join(", ")}.`,
    }
  }

  // MIME must be consistent with the claimed extension (defence in depth).
  const allowedMimes = SAFE_EXTENSIONS[ext]
  const mime = (file.type ?? "").toLowerCase()
  if (mime && !allowedMimes.includes(mime) && !allowedMimes.includes("")) {
    return { ok: false, error: `File content type (${mime}) does not match .${ext}.` }
  }

  const maxBytes = rules.maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    return { ok: false, error: `File too large. Maximum size is ${rules.maxSizeMb} MB.` }
  }

  return { ok: true }
}
