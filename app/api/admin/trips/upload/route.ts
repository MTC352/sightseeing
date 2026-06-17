import { type NextRequest, NextResponse } from "next/server"
import { requireAnyPermission } from "@/lib/auth-server"
import { processUpload } from "@/lib/media-upload"

export async function POST(request: NextRequest) {
  try {
    const session = await requireAnyPermission(["trips","blog","pages"])

    // Route through the central media pipeline so every trip image upload is
    // recorded in the Files library and deduplicated. Restricted to images.
    // Returns { url } to keep the trip edit form working unchanged.
    const result = await processUpload(request, session.id, { restrictImage: true })
    const body = result.body as { url?: string; error?: string }
    if (result.status >= 400) {
      return NextResponse.json({ error: body.error ?? "Upload failed" }, { status: result.status })
    }
    return NextResponse.json({ url: body.url })
  } catch (error: unknown) {
    if (error instanceof Error && (error as { status?: number }).status === 403) return Response.json({ error: "Forbidden" }, { status: 403 })
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
