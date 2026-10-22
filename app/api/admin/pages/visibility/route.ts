import { NextResponse } from "next/server"
import { dbGetDisabledPages, dbUpdatePageVisibility } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

// Enabled/Disabled switch for the governed pages in lib/development-pages.ts,
// shown on Admin → Pages. Stored in integrations row 'page_visibility'.

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET() {
  try {
    await requirePermission("pages")
    return NextResponse.json({ disabled: await dbGetDisabledPages() })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/visibility] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requirePermission("pages")
    const body = (await req.json().catch(() => ({}))) as { disabled?: unknown }
    const disabled = await dbUpdatePageVisibility(Array.isArray(body.disabled) ? (body.disabled as string[]) : [])
    void logActivity({
      actor: session,
      action: "settings.update",
      entityType: "settings",
      entityId: "pageVisibility",
      summary: disabled.length ? `Disabled pages: ${disabled.join(", ")}` : "Enabled all pages",
    })
    return NextResponse.json({ disabled })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/pages/visibility] PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
