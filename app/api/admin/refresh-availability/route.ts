/**
 * POST /api/admin/refresh-availability
 *
 * Manual admin button — runs refreshAvailability() and returns when done.
 * Auth: protected by /api/admin/* JWT middleware.
 */

import { NextResponse } from "next/server"
import { refreshAvailability, availabilityCache } from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

export async function POST() {
  await refreshAvailability()
  return NextResponse.json({
    ok: true,
    lastAvailabilityAt: availabilityCache ? new Date(availabilityCache.refreshedAt).toISOString() : null,
  })
}
