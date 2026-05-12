import { NextResponse } from "next/server"
import { dbListPalisisSyncLogs } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100)

  try {
    const logs = await dbListPalisisSyncLogs(limit)
    return NextResponse.json({ ok: true, logs })
  } catch (err) {
    console.error("[palisis-logs] GET error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
