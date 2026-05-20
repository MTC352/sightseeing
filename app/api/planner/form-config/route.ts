import { NextResponse } from "next/server"
import { dbGetSettings } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/**
 * Public read-only endpoint that surfaces the form-related admin settings
 * consumed by the /planner onboarding UI. Right now this is just the
 * Multi-day max-days cap, but it's intentionally namespaced so future
 * admin-managed form fields (interest options, budget tiers, etc.) can
 * land here without a new route per setting.
 */
export async function GET() {
  try {
    const s = await dbGetSettings()
    const it = (s.itineraryBehavior ?? {}) as Record<string, unknown>
    const raw = Number(it.maxMultiDayDays)
    const maxMultiDayDays = Number.isFinite(raw) && raw >= 2 && raw <= 14
      ? Math.floor(raw)
      : 2
    return NextResponse.json({ maxMultiDayDays })
  } catch (err) {
    console.error("[planner/form-config] GET error:", err)
    // Always return a working default so the onboarding form keeps working
    // even if settings load fails — better than blocking the visitor.
    return NextResponse.json({ maxMultiDayDays: 2 })
  }
}
