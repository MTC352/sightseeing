import { NextResponse } from "next/server"
import { dbListApplications, dbUpdateApplication, dbDeleteApplication } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
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
    await requireAdminSession()
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId") ?? undefined
    const status = searchParams.get("status") ?? undefined
    const apps = await dbListApplications({ jobId, status })
    return NextResponse.json(proxyFileUrls(apps as Array<Record<string, unknown>>))
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
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
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdminSession()
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
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/applications] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
