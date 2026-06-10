import { NextResponse } from "next/server"
import { dbListRegiondoSyncLogs, dbCountRegiondoSyncLogs } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20", 10), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0)

  try {
    await requireAdminSession()
    const [logs, total] = await Promise.all([
      dbListRegiondoSyncLogs(limit, offset),
      dbCountRegiondoSyncLogs(),
    ])
    return NextResponse.json({ ok: true, logs, total, limit, offset })
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[regiondo-logs] GET error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
