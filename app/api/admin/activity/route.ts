import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { dbListActivity, dbListActivityActors, dbListActivityActions } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET(req: Request) {
  let session
  try {
    session = await requireAdminSession()
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  // Recent Activity is a superadmin-only audit trail.
  if (session.role !== FULL_ACCESS_ROLE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action")?.trim() || undefined
  const userId = searchParams.get("userId")?.trim() || undefined
  const limit = parseInt(searchParams.get("limit") ?? "300", 10)

  try {
    const [logs, actors, actions] = await Promise.all([
      dbListActivity({ limit: Number.isFinite(limit) ? limit : 300, action, userId }),
      dbListActivityActors(),
      dbListActivityActions(),
    ])
    return NextResponse.json({ logs, actors, actions })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load activity"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
