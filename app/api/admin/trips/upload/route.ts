import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession()
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, WebP and GIF are allowed." }, { status: 400 })
    }

    const maxSize = 8 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 8MB." }, { status: 400 })
    }

    const ext = file.name.split(".").pop() || "jpg"
    const filename = `trips/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const blob = await put(filename, file, { access: "public" })

    return NextResponse.json({ url: blob.url })
  } catch (error: unknown) {
    if (error instanceof Error && (error as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("Trip upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
