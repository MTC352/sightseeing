import { NextResponse } from "next/server"
import { dbListApplications, dbUpdateApplication, dbDeleteApplication } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { sanitizeExternalUrl } from "@/lib/sanitize-html"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

// Replace raw blob storage URLs with admin-authenticated proxy URLs so
// applicant documents are never directly accessible from the browser without
// an active admin session.
function proxyFileUrls(
  apps: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return apps.map((app) => {
    const id = app.id as string
    const result = { ...app }

    // Defense-in-depth: even though links are validated on ingestion, re-drop
    // any unsafe-scheme URL (javascript:, data:, …) before returning it to the
    // admin UI so legacy/pre-validation rows can never produce a poisoned href.
    result.linkedinUrl = sanitizeExternalUrl(app.linkedinUrl as string | null | undefined) ?? undefined
    result.portfolioUrl = sanitizeExternalUrl(app.portfolioUrl as string | null | undefined) ?? undefined

    if (app.resumeUrl) {
      result.resumeUrl = `/api/admin/applications/download?id=${encodeURIComponent(id)}&type=resume`
    }

    if (Array.isArray(app.attachments)) {
      result.attachments = (app.attachments as Array<{ name: string; url: string }>).map(
        (att, idx) => ({
          name: att.name,
          url: `/api/admin/applications/download?id=${encodeURIComponent(id)}&type=attachment&index=${idx}`,
        }),
      )
    }

    return result
  })
}

export async function GET(req: Request) {
  try {
    await requirePermission("jobs")
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId") ?? undefined
    const status = searchParams.get("status") ?? undefined
    const apps = await dbListApplications({ jobId, status })
    return NextResponse.json(proxyFileUrls(apps as Array<Record<string, unknown>>))
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("jobs")
    const body = await req.json()
    const { id, ...data } = body
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    const updated = await dbUpdateApplication(id, data)
    if (!updated) return NextResponse.json({ error: "Application not found" }, { status: 404 })
    void logActivity({
      actor: session,
      action: "application.update",
      entityType: "application",
      entityId: String(id),
      summary: `Updated job application ${id}`,
      context: data?.status ? { status: data.status } : undefined,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requirePermission("jobs")
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing application id" }, { status: 400 })
    await dbDeleteApplication(id)
    void logActivity({
      actor: session,
      action: "application.delete",
      entityType: "application",
      entityId: id,
      summary: `Deleted job application ${id}`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
