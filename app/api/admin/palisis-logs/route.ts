import { NextResponse } from "next/server"
import { dbListPalisisSyncLogs, dbCountPalisisSyncLogs } from "@/lib/db/queries"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20", 10), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0)

  try {
    await requirePermission("palisis")
    const [logs, total] = await Promise.all([
      dbListPalisisSyncLogs(limit, offset),
      dbCountPalisisSyncLogs(),
    ])
    return NextResponse.json({ ok: true, logs, total, limit, offset })
  } catch (err: unknown) {
        if (err instanceof Error && (err as { status?: number }).status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[palisis-logs] GET error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
