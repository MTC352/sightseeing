import { type NextRequest, NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE = 8 * 1024 * 1024 // 8 MB

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession()

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP and GIF are allowed." },
        { status: 400 },
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 8 MB." },
        { status: 400 },
      )
    }

    // Try Vercel Blob first if the token is available
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (blobToken) {
      try {
        const { put } = await import("@vercel/blob")
        const ext = file.name.split(".").pop() ?? "jpg"
        const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const blob = await put(filename, file, { access: "public", token: blobToken })
        return NextResponse.json({ url: blob.url })
      } catch (blobErr) {
        console.warn("[upload] Vercel Blob failed, falling back to local storage:", blobErr)
      }
    }

    // Local file storage fallback — saves to public/uploads/
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
    const safeExt = ALLOWED_TYPES.some((t) => t.endsWith(ext)) ? ext : "jpg"
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`

    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    await mkdir(uploadsDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadsDir, filename), buffer)

    return NextResponse.json({ url: `/uploads/${filename}` })
  } catch (error: unknown) {
    if (error instanceof Error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[upload] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    )
  }
}
