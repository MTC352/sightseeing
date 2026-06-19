import { NextResponse } from "next/server"
import { dbGetCookieSettings, dbUpdateCookieSettings } from "@/lib/db/queries"
import { requireAnyPermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function statusFor(err: unknown): number {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) return status
  }
  return 500
}

/** GET the current cookie-consent banner configuration. */
export async function GET() {
  try {
    await requireAnyPermission(["integrations"])
    const settings = await dbGetCookieSettings()
    return NextResponse.json(settings)
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: statusFor(err) })
  }
}

/** PUT to update the cookie-consent banner configuration. */
export async function PUT(req: Request) {
  try {
    const session = await requireAnyPermission(["integrations"])
    const body = await req.json().catch(() => ({}))
    const updated = await dbUpdateCookieSettings(body)

    void logActivity({
      actor: session,
      action: "cookie-settings.update",
      entityType: "settings",
      entityId: "cookie_consent",
      summary: `Cookie banner ${updated.enabled ? "enabled" : "disabled"}`,
    })

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: "Error" }, { status: statusFor(err) })
  }
}
