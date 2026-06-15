/**
 * lib/media-upload.ts
 * Shared server-side upload pipeline used by every admin upload entry point
 * (the media library route `/api/admin/media`, the Help-attachment route
 * `/api/admin/help/upload`, and the legacy blog/trip image routes). Centralises
 * validation + storage + deduplication + media_files recording so the entry
 * points can never drift apart and the same file is never stored twice.
 */
import { writeFile, mkdir, unlink } from "fs/promises"
import { createHash } from "crypto"
import { lookup as dnsLookup } from "dns/promises"
import { isIP } from "net"
import path from "path"
import {
  dbCreateMedia,
  dbFindMediaByHash,
  dbFindMediaBySourceUrl,
  dbSetMediaSourceUrlIfNull,
  dbGetFileRuleSources,
} from "@/lib/db/queries"
import {
  resolveEffectiveRules,
  validateFile,
  ALL_SAFE_MIME_TYPES,
  SAFE_EXTENSIONS,
  HARD_MAX_MB,
} from "@/lib/file-rules"

const MAX_SIZE = HARD_MAX_MB * 1024 * 1024

function safeExtension(filename: string, mime: string): string {
  const fromName = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : ""
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName
  const fromMime = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return fromMime && fromMime.length <= 8 ? fromMime : "bin"
}

export interface UploadResult {
  status: number
  body: unknown
}

export interface UploadOptions {
  title?: string | null
  /** When true, only image/* files are accepted (legacy blog/trip image fields). */
  restrictImage?: boolean
}

/**
 * Validate + persist a single File, deduplicating by content hash, and record
 * it in media_files. Used by every upload entry point. Returns the media row
 * (status 201 for a new file, 200 when an identical file already existed).
 */
export async function processUploadFile(
  file: File,
  userId: string,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  if (!file) {
    return { status: 400, body: { error: "No file provided" } }
  }

  if (opts.restrictImage && !file.type.startsWith("image/")) {
    return { status: 400, body: { error: "Only image files are allowed here." } }
  }

  // Configurable validation: resolve this user's effective rules (per-role
  // override → global default → fallback) and enforce extension + size.
  const sources = await dbGetFileRuleSources(userId)
  const rules = resolveEffectiveRules(sources.global, sources.override)
  const verdict = validateFile({ name: file.name, type: file.type, size: file.size }, rules)
  if (!verdict.ok) {
    return { status: 400, body: { error: verdict.error } }
  }

  // Fixed backstop — never accept active-content MIME or oversized files,
  // regardless of how the configurable rules are set. Derived from
  // SAFE_EXTENSIONS so it can never drift out of sync. An empty MIME is
  // permitted here because validateFile() already confirmed the extension is
  // SAFE and matches (some clients send no MIME for .md/.csv).
  if (file.type && !ALL_SAFE_MIME_TYPES.has(file.type)) {
    return { status: 400, body: { error: `Unsupported file type (${file.type}).` } }
  }
  if (file.size > MAX_SIZE) {
    return { status: 400, body: { error: `File too large. Maximum size is ${HARD_MAX_MB} MB.` } }
  }

  // Read bytes once — used for both hashing (dedup) and storage.
  const buffer = Buffer.from(await file.arrayBuffer())
  const contentHash = createHash("sha256").update(buffer).digest("hex")

  // Deduplicate: identical bytes already in the library → reuse that record,
  // never store a second copy.
  const existing = await dbFindMediaByHash(contentHash)
  if (existing) {
    return { status: 200, body: existing }
  }

  const ext = safeExtension(file.name, file.type)
  const stored = await persistBuffer(buffer, ext, file.type)

  const { row, created } = await dbCreateMedia({
    filename: file.name,
    title: opts.title ?? null,
    url: stored.url,
    mimeType: file.type,
    sizeBytes: file.size,
    storage: stored.storage,
    contentHash,
    uploadedBy: userId,
  })

  // Lost a dedup race: an identical file already existed. Remove the orphan we
  // just stored locally and return the canonical record. (Blob orphans are rare
  // and harmless; we don't block on deleting them.)
  if (!created && stored.localPath) {
    await unlink(stored.localPath).catch(() => {})
  }

  return { status: created ? 201 : 200, body: row }
}

interface StoredBuffer {
  url: string
  storage: string
  localPath: string | null
}

/**
 * Persist raw bytes to Vercel Blob (when configured) or `public/uploads`.
 * Shared by the multipart upload path and the remote-URL import path so storage
 * behaviour can never drift between them.
 */
async function persistBuffer(buffer: Buffer, ext: string, contentType: string): Promise<StoredBuffer> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`media/${key}`, buffer, {
      access: "public",
      token: blobToken,
      contentType: contentType || undefined,
    })
    return { url: blob.url, storage: "blob", localPath: null }
  }
  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadsDir, { recursive: true })
  const localPath = path.join(uploadsDir, key)
  await writeFile(localPath, buffer)
  return { url: `/uploads/${key}`, storage: "local", localPath }
}

const IMPORT_FETCH_TIMEOUT_MS = 20_000
const IMPORT_MAX_REDIRECTS = 4

/**
 * SSRF guard. Returns true for IP addresses that must never be reachable by a
 * server-side image fetch — loopback, private (RFC1918), link-local (incl. the
 * cloud metadata endpoint 169.254.169.254), unique-local IPv6, and other
 * reserved/special ranges. Covers IPv4, IPv6, and IPv4-mapped IPv6.
 */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const p = ip.split(".").map(Number)
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
    const [a, b] = p
    if (a === 0) return true // "this" network / unspecified
    if (a === 10) return true // 10.0.0.0/8 private
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local (incl. 169.254.169.254 metadata)
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true // 192.0.0.0/24 + 192.0.2.0/24 special
    if (a >= 224) return true // multicast + reserved + broadcast
    return false
  }
  if (v === 6) {
    const lower = ip.toLowerCase()
    // IPv4-mapped / -compatible (::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.)
    const mapped = lower.match(/(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/)
    if (mapped) return isBlockedIp(mapped[1])
    if (lower === "::" || lower === "::1") return true // unspecified / loopback
    if (lower.startsWith("fe80")) return true // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true // unique-local fc00::/7
    if (lower.startsWith("ff")) return true // multicast
    return false
  }
  // Not a parseable IP literal — caller resolves via DNS instead.
  return false
}

/**
 * Verify a hostname resolves only to public IP addresses, blocking SSRF to
 * internal/metadata services. Throws on any blocked target. Resolving here (and
 * re-checking every redirect hop) defends against attacker-controlled trip image
 * URLs pointing at private infrastructure.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error("blocked address")
    return
  }
  let addrs: { address: string }[]
  try {
    addrs = await dnsLookup(host, { all: true })
  } catch {
    throw new Error("dns failed")
  }
  if (addrs.length === 0) throw new Error("dns empty")
  for (const { address } of addrs) {
    if (isBlockedIp(address)) throw new Error("blocked address")
  }
}

/**
 * SSRF-safe fetch: validates the target host resolves to public IPs, follows
 * redirects manually, and re-validates the host of every redirect hop (so a
 * public URL cannot 30x-redirect into private space).
 */
async function safeImageFetch(initialUrl: URL, signal: AbortSignal): Promise<Response> {
  let current = initialUrl
  for (let hop = 0; hop <= IMPORT_MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error("unsupported scheme")
    }
    await assertPublicHost(current.hostname)
    const res = await fetch(current.toString(), { signal, redirect: "manual" })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return res
      current = new URL(loc, current)
      continue
    }
    return res
  }
  throw new Error("too many redirects")
}

/** Map a safe image MIME type to its canonical file extension. */
function extForImageMime(mime: string): string | null {
  for (const [ext, mimes] of Object.entries(SAFE_EXTENSIONS)) {
    if (mimes.includes(mime)) return ext
  }
  return null
}

export interface ImportImageResult {
  /** The local/blob URL the asset was stored under, or null when the import failed. */
  url: string | null
  error?: string
}

/**
 * Download a remote IMAGE by URL into the media library and return its local
 * (or blob) URL. Used by the Palisis/TourCMS importer so trip images live on our
 * own system instead of hot-linking the upstream CDN.
 *
 * Fail-soft: returns `{ url: null, error }` on any problem so callers can keep
 * the original remote URL rather than breaking an import.
 *
 * Deduplicated two ways:
 *  - by `source_url` (skips the network fetch entirely on re-sync), and
 *  - by sha256 content hash (never stores identical bytes twice).
 *
 * ⚠️ ONE-WAY: this only ever READS from the remote CDN — it never pushes data
 * back upstream.
 */
export async function processImageFromUrl(
  sourceUrl: string,
  opts: { uploadedBy?: string | null; title?: string | null } = {},
): Promise<ImportImageResult> {
  const src = (sourceUrl || "").trim()
  if (!src) return { url: null, error: "empty url" }

  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    return { url: null, error: "invalid url" }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, error: "unsupported scheme" }
  }

  // Already imported this exact remote URL before → reuse without re-downloading.
  try {
    const existingBySource = await dbFindMediaBySourceUrl(src)
    if (existingBySource) return { url: existingBySource.url }
  } catch {
    // Non-fatal — fall through and re-import.
  }

  // Fetch the bytes (timeout-guarded, SSRF-guarded). The host (and every
  // redirect hop) must resolve to a public IP — never internal/metadata space.
  let res: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMPORT_FETCH_TIMEOUT_MS)
  try {
    res = await safeImageFetch(parsed, controller.signal)
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "fetch failed" }
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return { url: null, error: `fetch ${res.status}` }

  const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  if (headerType && !headerType.startsWith("image/")) {
    return { url: null, error: `not an image (${headerType})` }
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength === 0) return { url: null, error: "empty body" }
  if (buffer.byteLength > MAX_SIZE) {
    return { url: null, error: `too large (max ${HARD_MAX_MB} MB)` }
  }

  // Resolve a SAFE image MIME — prefer the response header, fall back to the URL
  // extension. Active-content types are never in SAFE_EXTENSIONS, so this also
  // backstops against an SVG/HTML masquerading as an image.
  let mime = headerType && ALL_SAFE_MIME_TYPES.has(headerType) ? headerType : ""
  if (!mime) {
    const urlExt = parsed.pathname.includes(".")
      ? parsed.pathname.split(".").pop()!.toLowerCase()
      : ""
    const mimes = urlExt && SAFE_EXTENSIONS[urlExt]
    if (mimes && mimes[0]) mime = mimes[0]
  }
  if (!mime || !mime.startsWith("image/") || !ALL_SAFE_MIME_TYPES.has(mime)) {
    return { url: null, error: `unsupported image type${headerType ? ` (${headerType})` : ""}` }
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex")

  // Same bytes already on the system → reuse, and remember this source URL so the
  // next sync can skip the fetch.
  const existing = await dbFindMediaByHash(contentHash)
  if (existing) {
    if (!existing.source_url) await dbSetMediaSourceUrlIfNull(existing.id, src).catch(() => {})
    return { url: existing.url }
  }

  const ext = extForImageMime(mime) ?? "bin"
  const baseName = parsed.pathname.split("/").filter(Boolean).pop() || `image.${ext}`
  const filename = /\.[a-z0-9]{1,8}$/i.test(baseName) ? baseName : `${baseName}.${ext}`

  let stored: StoredBuffer
  try {
    stored = await persistBuffer(buffer, ext, mime)
  } catch {
    return { url: null, error: "store failed" }
  }

  const { row, created } = await dbCreateMedia({
    filename,
    title: opts.title ?? null,
    url: stored.url,
    mimeType: mime,
    sizeBytes: buffer.byteLength,
    storage: stored.storage,
    contentHash,
    sourceUrl: src,
    uploadedBy: opts.uploadedBy ?? null,
  })

  if (!created && stored.localPath) {
    await unlink(stored.localPath).catch(() => {})
  }

  return { url: row.url }
}

/**
 * Localize a batch of remote image URLs, returning a Map from each original
 * remote URL to its stored local/blob URL. URLs that fail to import (or are
 * already local/relative) are simply absent from the map, so callers can fall
 * back to the original value. Imports run sequentially to keep upstream-CDN and
 * blob-write load bounded per trip.
 */
export async function localizeImageUrls(
  urls: string[],
  uploadedBy: string | null = null,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = Array.from(new Set(urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))))
  for (const remote of unique) {
    const { url } = await processImageFromUrl(remote, { uploadedBy })
    if (url) map.set(remote, url)
  }
  return map
}

/**
 * Parse a multipart form (field `file`, optional `title`) and run it through
 * processUploadFile.
 */
export async function processUpload(
  request: Request,
  userId: string,
  opts: UploadOptions = {},
): Promise<UploadResult> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    // Body could not be parsed — almost always an oversized/truncated upload.
    return {
      status: 413,
      body: { error: `Could not read upload. The file may be too large (hard limit ${HARD_MAX_MB} MB).` },
    }
  }

  const file = formData.get("file") as File | null
  const titleRaw = formData.get("title")
  const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : opts.title ?? null

  if (!file) {
    return { status: 400, body: { error: "No file provided" } }
  }

  return processUploadFile(file, userId, { ...opts, title })
}
