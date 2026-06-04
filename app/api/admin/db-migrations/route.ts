import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { getMigrationStatus, runMigrations } from "@/lib/data-migrations"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

function statusOf(err: unknown): number | undefined {
  return err instanceof Error ? (err as { status?: number }).status : undefined
}

/** Data migrations write content to the live DB — superadmin only. */
async function requireSuperadmin() {
  const session = await requireAdminSession()
  if (session.role !== FULL_ACCESS_ROLE) {
    const e = new Error("Forbidden") as Error & { status?: number }
    e.status = 403
    throw e
  }
  return session
}

function errorResponse(err: unknown, tag: string) {
  const s = statusOf(err)
  if (s === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  console.error(`[admin/db-migrations] ${tag} error:`, err)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function GET() {
  try {
    await requireSuperadmin()
    return NextResponse.json(await getMigrationStatus())
  } catch (err) {
    return errorResponse(err, "GET")
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSuperadmin()
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : []
    if (ids.length === 0) {
      return NextResponse.json({ error: "No migration ids provided" }, { status: 400 })
    }
    const results = await runMigrations(ids)
    void logActivity({
      actor: session,
      action: "db-migration.run",
      entityType: "db-migration",
      summary: `Ran data migration(s): ${ids.join(", ")}`,
    })
    return NextResponse.json({ results })
  } catch (err) {
    return errorResponse(err, "POST")
  }
}
