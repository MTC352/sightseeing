/**
 * GET /api/departing-soon
 *
 * READ-ONLY endpoint consumed by the homepage widget.
 * Never calls TourCMS directly — only `refreshAvailability()` (TTL-gated, deduped).
 *
 * Returns whatever is in `discoveryCache`, with each slot's spacesRemaining
 * overlaid from `availabilityCache`. Filters out departed + sold-out slots
 * at READ time (does NOT backfill from outside the cached top-5).
 */

import { NextResponse } from "next/server"
import { getTourCMSConfig } from "@/lib/tourcms"
import {
  discoveryCache,
  availabilityCache,
  refreshAvailability,
  triggerDiscoveryBootstrap,
  getAutoUpdateEnabled,
  getAutoUpdateIntervalSeconds,
} from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

/** Public response shape — kept stable for the client component. */
export interface DepartingSoonItem {
  tripId: string
  palisisId: string
  tripTitle: string
  tripImage: string
  tripPermalink: string
  tripCategory: string
  tripCity: string
  date: string
  time: string
  startTimeUtcSeconds: number
  priceDisplay: string
  spacesRemaining: number | "UNLIMITED"
  componentKey: string
}

export async function GET() {
  try {
    // 1. Credentials check — feature is administratively unavailable without TourCMS
    const cfg = await getTourCMSConfig()
    if (!cfg) {
      return NextResponse.json(
        {
          ok: false,
          error: "TOURCMS_NOT_CONFIGURED",
          departures: [],
          tourcmsConfigured: false,
        },
        { status: 500 },
      )
    }

    // 2. Discovery cache must exist before we can serve anything
    if (!discoveryCache) {
      // Fire-and-forget bootstrap so subsequent hits succeed without manual cron
      triggerDiscoveryBootstrap()
      return NextResponse.json(
        {
          ok: false,
          error: "DISCOVERY_NOT_INITIALIZED",
          departures: [],
          tourcmsConfigured: true,
          hint: "Discovery refresh has been triggered in the background. Reload in a few seconds.",
        },
        { status: 503 },
      )
    }

    // 3. Refresh availability if TTL expired (dedupes concurrent callers)
    await refreshAvailability()

    // 4. Build the response — read-time filters: drop departed + sold out
    const nowUtc = Math.floor(Date.now() / 1000)
    const departures: DepartingSoonItem[] = []
    for (const slot of discoveryCache.slots) {
      if (slot.startTimeUtcSeconds <= nowUtc) continue // already departed

      const avail =
        availabilityCache?.byTripId[slot.tripId] ?? { spacesRemaining: 0, stillBookable: false }
      if (!avail.stillBookable) continue
      if (avail.spacesRemaining !== "UNLIMITED" && avail.spacesRemaining <= 0) continue

      departures.push({
        tripId: slot.tripId,
        palisisId: slot.palisisId,
        tripTitle: slot.tripTitle,
        tripImage: slot.tripImage,
        tripPermalink: slot.tripPermalink,
        tripCategory: slot.tripCategory,
        tripCity: slot.tripCity,
        date: slot.date,
        time: slot.time,
        startTimeUtcSeconds: slot.startTimeUtcSeconds,
        priceDisplay: slot.priceDisplay,
        spacesRemaining: avail.spacesRemaining,
        componentKey: slot.componentKey,
      })
    }

    const autoUpdate = await getAutoUpdateEnabled()
    const intervalSecs = await getAutoUpdateIntervalSeconds()

    return NextResponse.json({
      ok: true,
      departures,
      autoUpdate,
      intervalSecs,
      tourcmsConfigured: true,
      partial: departures.length < discoveryCache.slots.length,
      tripsChecked: discoveryCache.tripsChecked,
      failedTripCount: discoveryCache.failedTripCount,
      lastDiscoveryAt: new Date(discoveryCache.refreshedAt).toISOString(),
      lastAvailabilityAt: availabilityCache ? new Date(availabilityCache.refreshedAt).toISOString() : null,
    })
  } catch (err) {
    console.error("[departing-soon] GET threw:", err)
    return NextResponse.json(
      { ok: false, departures: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
