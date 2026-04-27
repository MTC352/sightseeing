import { NextResponse } from "next/server"
import { dbGetDashboardStats } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const stats = await dbGetDashboardStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error("[admin/dashboard] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
