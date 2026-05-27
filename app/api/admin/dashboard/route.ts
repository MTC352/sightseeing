import { NextResponse } from "next/server"
import { dbGetDashboardStats } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminSession()
    const stats = await dbGetDashboardStats()
    return NextResponse.json(stats)
  } catch (err: unknown) {
    if (err instanceof Error && (err as { status?: number }).status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error("[admin/dashboard] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
