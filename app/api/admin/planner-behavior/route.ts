import { NextResponse } from "next/server"
import { queryOne } from "@/lib/db"
import { dbUpdatePlannerBehavior } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const row = await queryOne<{ extra_config: Record<string, unknown> }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`
    )
    return NextResponse.json(row?.extra_config ?? {})
  } catch (err) {
    console.error("[planner-behavior] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json()
    await dbUpdatePlannerBehavior(data)
    const row = await queryOne<{ extra_config: Record<string, unknown> }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`
    )
    return NextResponse.json(row?.extra_config ?? {})
  } catch (err) {
    console.error("[planner-behavior] PUT error:", err)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
