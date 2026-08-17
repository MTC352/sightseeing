import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth-server"
import { processUpload } from "@/lib/media-upload"
import { logError, logCaughtError, requestMeta } from "@/lib/error-log"

export const dynamic = "force-dynamic"
// Allow large attachment uploads to stream through the route handler.
export const maxDuration = 60

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

/**
 * Upload endpoint for Help-article attachments. Gated by the `help` permission
 * (via proxy.ts → canAccessPath on the `/api/admin/help` prefix), so a Help
 * editor can always attach a document even without the `files` permission. The
 * media-library *listing* ("Select from Files") remains `files`-gated on
 * `/api/admin/media`.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("help")
    const { status, body } = await processUpload(request, session.id)
    if (status >= 400) {
      void logError({
        source: "media:upload",
        level: "warn",
        message: (body as { error?: string })?.error ?? "Upload rejected",
        statusCode: status,
        context: { ...requestMeta(request), entry: "help-attachment", userId: session.id },
      })
    }
    return NextResponse.json(body, { status })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/help/upload] POST error:", err)
    void logCaughtError("media:upload", err, { ...requestMeta(request), entry: "help-attachment" })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    )
  }
}
