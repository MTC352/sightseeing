import { NextResponse } from "next/server"
import { dbGetSiteProtection, dbUpdateSiteProtection } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"

export const dynamic = "force-dynamic"

function statusFor(err: unknown): number {
  return err instanceof Error && (err as { status?: number }).status === 401 ? 401 : 500
}

/** GET current frontend-protection settings (superadmin-only). */
export async function GET() {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const p = await dbGetSiteProtection()
    return NextResponse.json({ enabled: p.enabled, password: p.password })
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: statusFor(err) })
  }
}

/** PUT to toggle protection on/off and/or change the password (superadmin-only). */
export async function PUT(req: Request) {
  try {
    const session = await requireAdminSession()
    if (session.role !== FULL_ACCESS_ROLE) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      enabled?: unknown
      password?: unknown
    }
    const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined
    const password = typeof body.password === "string" ? body.password : undefined

    // A non-empty password change must be at least 4 chars.
    if (password !== undefined && password.length > 0 && password.trim().length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 },
      )
    }

    const updated = await dbUpdateSiteProtection({ enabled, password })

    void logActivity({
      actor: session,
      action: "security.update",
      entityType: "settings",
      entityId: "site_protection",
      summary: `Frontend protection ${updated.enabled ? "enabled" : "disabled"}${
        password ? " (password changed)" : ""
      }`,
    })

    return NextResponse.json({ enabled: updated.enabled, password: updated.password })
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: statusFor(err) })
  }
}
