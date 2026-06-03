import { NextResponse } from "next/server"
import { unlink } from "fs/promises"
import path from "path"
import { requireAdminSession } from "@/lib/auth-server"
import { dbDeleteMedia, dbUpdateMediaTitle } from "@/lib/db/queries"
import { logError } from "@/lib/error-log"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const updated = await dbUpdateMediaTitle(id, typeof body.title === "string" ? body.title : null)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    void logActivity({
      actor: session,
      action: "file.update",
      entityType: "file",
      entityId: updated.id,
      summary: `Renamed file to "${updated.title ?? updated.filename}"`,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    const { id } = await params
    const removed = await dbDeleteMedia(id)
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Audit trail: record who deleted which file (surfaced in /admin/logs).
    void logError({
      source: "media",
      level: "info",
      message: `File deleted: "${removed.title ?? removed.filename}" (${removed.url}) by ${session.name} <${session.email}>`,
      context: {
        action: "media.delete",
        fileId: removed.id,
        filename: removed.filename,
        url: removed.url,
        sizeBytes: removed.size_bytes,
        deletedBy: { id: session.id, name: session.name, email: session.email },
      },
    })
    void logActivity({
      actor: session,
      action: "file.delete",
      entityType: "file",
      entityId: removed.id,
      summary: `Deleted file "${removed.title ?? removed.filename}"`,
      context: { filename: removed.filename, url: removed.url },
    })

    // Best-effort cleanup of the underlying stored object.
    try {
      if (removed.storage === "local" && removed.url.startsWith("/uploads/")) {
        await unlink(path.join(process.cwd(), "public", removed.url.replace(/^\//, "")))
      } else if (removed.storage === "blob" && process.env.BLOB_READ_WRITE_TOKEN) {
        const { del } = await import("@vercel/blob")
        await del(removed.url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      }
    } catch (cleanupErr) {
      console.warn("[admin/media/:id] file cleanup failed (record removed):", cleanupErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/media/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
