import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth-server"
import { dbListMedia } from "@/lib/db/queries"
import { processUpload } from "@/lib/media-upload"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"
// Allow large uploads (video etc.) to stream through the route handler.
export const maxDuration = 60

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET() {
  try {
    await requirePermission("files")
    const files = await dbListMedia()
    return NextResponse.json(files)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("files")
    const { status, body } = await processUpload(request, session.id)
    if (status >= 200 && status < 300) {
      const file = body as { id?: string; title?: string; filename?: string; url?: string }
      void logActivity({
        actor: session,
        action: "file.upload",
        entityType: "file",
        entityId: file?.id ?? null,
        summary: `Uploaded file "${file?.title ?? file?.filename ?? "file"}"`,
        context: file?.url ? { url: file.url } : null,
      })
    }
    return NextResponse.json(body, { status })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    )
  }
}
