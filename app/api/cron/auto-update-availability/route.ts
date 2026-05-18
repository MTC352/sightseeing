/**
 * POST/GET /api/cron/auto-update-availability
 *
 * Triggered by a Replit Scheduled Deployment every 1 minute when
 * `departing_soon_auto_update` is enabled.
 *
 * Internally just calls `refreshAvailability()` which is TTL-gated by
 * `departing_soon_auto_update_interval_seconds`.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  refreshAvailability,
  availabilityCache,
  getAutoUpdateEnabled,
  getAutoUpdateIntervalSeconds,
  isAuthorizedCron,
} from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }
  const enabled = await getAutoUpdateEnabled()
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "AUTO_UPDATE_DISABLED" })
  }

  const interval = await getAutoUpdateIntervalSeconds()
  if (availabilityCache && (Date.now() - availabilityCache.refreshedAt) / 1000 < interval) {
    return NextResponse.json({ ok: true, skipped: "TTL_NOT_EXPIRED" })
  }

  await refreshAvailability()
  return NextResponse.json({
    ok: true,
    lastAvailabilityAt: availabilityCache ? new Date(availabilityCache.refreshedAt).toISOString() : null,
  })
}

export const POST = handle
export const GET = handle
