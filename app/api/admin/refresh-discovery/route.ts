/**
 * POST /api/admin/refresh-discovery
 *
 * Manual admin button — forces a full datesndeals window refresh for every
 * published+synced trip. Auth: protected by the /api/admin/* JWT proxy gate.
 *
 * This replaces the periodic discovery cron. With the new window-based
 * architecture, the cache stays valid for `departing_soon_discovery_window_days`
 * days, and lazy expiry refresh happens on the next homepage read. Admins use
 * this endpoint to force a refresh sooner (e.g. after re-syncing a trip).
 */

import { NextResponse } from "next/server"
import { refreshDiscovery, discoveryCache } from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

export async function POST() {
  const result = await refreshDiscovery(true)
  if (!("ok" in result) || !result.ok) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json({
    ...result,
    lastDiscoveryAt: discoveryCache ? new Date(discoveryCache.refreshedAt).toISOString() : null,
    discoveryExpiresAt: discoveryCache ? new Date(discoveryCache.expiresAt).toISOString() : null,
  })
}
