import { type NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { requireAdminSession } from "@/lib/auth-server"
import { dbListMedia, dbCreateMedia } from "@/lib/db/queries"

export const dynamic = "force-dynamic"
// Allow large uploads (video etc.) to stream through the route handler.
export const maxDuration = 60

const MAX_SIZE = 100 * 1024 * 1024 // 100 MB

// Broad allow-list covering images, documents, audio and video.
// NOTE: deliberately excludes image/svg+xml and any other active-content type —
// SVGs can carry inline <script> and would execute as stored XSS when served
// same-origin from /uploads.
const ALLOWED_MIME = new Set<string>([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
  "application/pdf",
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
  "text/plain", "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function safeExtension(filename: string, mime: string): string {
  const fromName = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : ""
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName
  const fromMime = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return fromMime && fromMime.length <= 8 ? fromMime : "bin"
}

export async function GET() {
  try {
    await requireAdminSession()
    const files = await dbListMedia()
    return NextResponse.json(files)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession()

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const titleRaw = formData.get("title")
    const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type${file.type ? ` (${file.type})` : ""}.` },
        { status: 400 },
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 100 MB." },
        { status: 400 },
      )
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
      uploadedBy: session.id,
    })

    return NextResponse.json(record, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    )
  }
}
