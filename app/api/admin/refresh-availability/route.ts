/**
 * POST /api/admin/refresh-availability
 *
 * Manual admin button — runs refreshAvailability() and returns when done.
 * Auth: protected by /api/admin/* JWT middleware.
 */

import { NextResponse } from "next/server"
import { refreshAvailability, availabilityCache } from "@/lib/departing-soon-cache"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function POST() {
  try { await requirePermission("integrations") } catch (authErr: unknown) { if ((authErr as { status?: number })?.status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  await refreshAvailability()
  return NextResponse.json({
    ok: true,
    lastAvailabilityAt: availabilityCache ? new Date(availabilityCache.refreshedAt).toISOString() : null,
  })
}
