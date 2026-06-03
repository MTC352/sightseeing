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
import path from "path"
import { dbCreateMedia, dbFindMediaByHash, dbGetFileRuleSources } from "@/lib/db/queries"
import { resolveEffectiveRules, validateFile, ALL_SAFE_MIME_TYPES, HARD_MAX_MB } from "@/lib/file-rules"

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
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  let url: string
  let storage: string
  let localPath: string | null = null

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`media/${key}`, buffer, {
      access: "public",
      token: blobToken,
      contentType: file.type || undefined,
    })
    url = blob.url
    storage = "blob"
  } else {
    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true })
    localPath = path.join(uploadsDir, key)
    await writeFile(localPath, buffer)
    url = `/uploads/${key}`
    storage = "local"
  }

  const { row, created } = await dbCreateMedia({
    filename: file.name,
    title: opts.title ?? null,
    url,
    mimeType: file.type,
    sizeBytes: file.size,
    storage,
    contentHash,
    uploadedBy: userId,
  })

  // Lost a dedup race: an identical file already existed. Remove the orphan we
  // just stored locally and return the canonical record. (Blob orphans are rare
  // and harmless; we don't block on deleting them.)
  if (!created && localPath) {
    await unlink(localPath).catch(() => {})
  }

  return { status: created ? 201 : 200, body: row }
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
