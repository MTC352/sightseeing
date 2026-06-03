/**
 * lib/media-upload.ts
 * Shared server-side upload pipeline used by both the media library route
 * (`/api/admin/media`) and the Help-attachment upload route
 * (`/api/admin/help/upload`). Centralises validation + storage so the two
 * entry points can never drift apart.
 */
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { dbCreateMedia, dbGetFileRuleSources } from "@/lib/db/queries"
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

/**
 * Parse a multipart form, enforce the caller's effective file rules + fixed
 * backstops, persist the file (Vercel Blob when configured, else local
 * /public/uploads), and record it in media_files.
 */
export async function processUpload(request: Request, userId: string): Promise<UploadResult> {
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
  const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null

  if (!file) {
    return { status: 400, body: { error: "No file provided" } }
  }

  // Configurable validation: resolve this user's effective rules (per-user
  // override → global default → fallback) and enforce extension + size.
  const sources = await dbGetFileRuleSources(userId)
  const rules = resolveEffectiveRules(sources.global, sources.user)
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

  const ext = safeExtension(file.name, file.type)
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  let url: string
  let storage: string

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`media/${key}`, file, { access: "public", token: blobToken })
    url = blob.url
    storage = "blob"
  } else {
    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadsDir, key), buffer)
    url = `/uploads/${key}`
    storage = "local"
  }

  const record = await dbCreateMedia({
    filename: file.name,
    title,
    url,
    mimeType: file.type,
    sizeBytes: file.size,
    storage,
    uploadedBy: userId,
  })

  return { status: 201, body: record }
}
