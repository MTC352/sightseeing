import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListTrips, dbCreateTrip } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await dbListTrips())
  } catch (err) {
    console.error("[admin/trips] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Manual trip creation is intentionally DISABLED.
 *
 * Per the project's source-of-truth rules (see replit.md → "Palisis/TourCMS
 * is ONE-WAY ONLY"), the trip catalog must only be populated through the
 * Palisis importer (/admin/palisis). The admin "Add trip" button has been
 * removed from the UI, but we also lock this endpoint at the API layer so
 * accidental client calls, stale forms, and direct curl requests can't
 * sneak manual rows into the database. To create a trip, run a Palisis
 * import — it sets `sync_source = 'palisis'` and `palisis_id` on the row.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Manual trip creation is disabled. Trips can only be added via the Palisis import at /admin/palisis.",
      hint: "Open /admin/palisis and run an import.",
    },
    { status: 405 },
  )
}
// dbCreateTrip is still used internally by the Palisis importer; the
// import keeps it referenced so a future refactor doesn't accidentally
// drop the function entirely.
void dbCreateTrip
void revalidatePath
