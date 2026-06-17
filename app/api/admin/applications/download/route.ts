import { NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { requirePermission } from "@/lib/auth-server"
import { queryOne } from "@/lib/db"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET(req: Request) {
  try {
    await requirePermission("jobs")

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    const type = searchParams.get("type")
    const index = searchParams.get("index")

    if (!id || !type) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    const app = await queryOne<{
      resume_url: string | null
      attachments: { name: string; url: string }[] | null
    }>(
      `SELECT resume_url, attachments FROM job_applications WHERE id = $1`,
      [id],
    )

    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 })
    }

    let blobUrl: string | null = null
    let filename = "download"

    if (type === "resume") {
      blobUrl = app.resume_url ?? null
      filename = `resume-${id}`
    } else if (type === "attachment") {
      const idx = parseInt(index ?? "0", 10)
      const attachments = app.attachments ?? []
      const att = attachments[idx] ?? null
      if (!att) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 })
      }
      blobUrl = att.url
      filename = att.name
    } else {
      return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 })
    }

    if (!blobUrl) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Use @vercel/blob get() with access: "private" so the server-side token
    // is used to retrieve the blob. Private blobs are not accessible via direct
    // URL — only server-authenticated requests can fetch them.
    const result = await get(blobUrl, { access: "private" })
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "File could not be retrieved" }, { status: 502 })
    }

    const headers: Record<string, string> = {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(result.blob.size),
    }

    return new Response(result.stream, { status: 200, headers })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications/download] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
