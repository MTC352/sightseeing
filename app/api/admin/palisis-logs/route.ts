import { NextResponse } from "next/server"
import { dbListPalisisSyncLogs, dbCountPalisisSyncLogs } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20", 10), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0)

  try {
    const [logs, total] = await Promise.all([
      dbListPalisisSyncLogs(limit, offset),
      dbCountPalisisSyncLogs(),
    ])
    return NextResponse.json({ ok: true, logs, total, limit, offset })
  } catch (err) {
    console.error("[palisis-logs] GET error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
