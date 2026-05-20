import { NextResponse } from "next/server"
import { dbGetChatPlannerConfig, DEFAULT_PLANNER_FORM } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Public read-only endpoint that surfaces the planner-onboarding form
 * options the admin manages from inside "AI Systems → Trip Chat". The
 * shape is { groups, interests, durations, budgets, maxMultiDayDays }
 * — same as DEFAULT_PLANNER_FORM. The /planner page hydrates its
 * onboarding UI from this on mount and falls back to the bundled
 * defaults if the fetch fails.
 */
export async function GET() {
  try {
    const { plannerForm } = await dbGetChatPlannerConfig()
    return NextResponse.json(plannerForm)
  } catch (err) {
    console.error("[planner/form-config] GET error:", err)
    // Always return a working default so onboarding keeps working
    // even if the chat row hasn't been seeded yet.
    return NextResponse.json(DEFAULT_PLANNER_FORM)
  }
}
