import { NextResponse } from "next/server"
import { getSettings, updatePlannerBehavior, type PlannerBehaviorSettings } from "@/lib/admin-store"

export async function GET() {
  const settings = getSettings()
  return NextResponse.json(settings.plannerBehavior)
}

export async function PUT(request: Request) {
  try {
    const data = await request.json() as Partial<PlannerBehaviorSettings>
    updatePlannerBehavior(data)
    const settings = getSettings()
    return NextResponse.json(settings.plannerBehavior)
  } catch (error) {
    console.error("[planner-behavior] PUT error:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
