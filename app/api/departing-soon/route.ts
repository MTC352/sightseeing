/**
 * GET /api/departing-soon
 *
 * READ-ONLY endpoint consumed by the homepage widget.
 * Never calls TourCMS directly — only `refreshAvailability()` (TTL-gated, deduped).
 *
 * Returns whatever is in `discoveryCache`, with each slot's spacesRemaining
 * overlaid from `availabilityCache` (when "show availability" toggle is ON).
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
  getWidgetEnabled,
  getShowAvailability,
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
  /** Omitted when the admin "show availability" toggle is OFF. */
  spacesRemaining?: number | "UNLIMITED"
}

export async function GET() {
  try {
    // 0. Master toggle — widget administratively disabled
    if (!(await getWidgetEnabled())) {
      return NextResponse.json({
        ok: false,
        error: "WIDGET_DISABLED",
        departures: [],
        widgetEnabled: false,
        tourcmsConfigured: true,
      })
    }

    // 1. Credentials check
    const cfg = await getTourCMSConfig()
    if (!cfg) {
      return NextResponse.json(
        {
          ok: false,
          error: "TOURCMS_NOT_CONFIGURED",
          departures: [],
          widgetEnabled: true,
          tourcmsConfigured: false,
        },
        { status: 500 },
      )
    }

    // 2. Discovery cache must exist
    if (!discoveryCache) {
      triggerDiscoveryBootstrap()
      return NextResponse.json(
        {
          ok: false,
          error: "DISCOVERY_NOT_INITIALIZED",
          departures: [],
          widgetEnabled: true,
          tourcmsConfigured: true,
          hint: "Discovery refresh has been triggered in the background. Reload in a few seconds.",
        },
        { status: 503 },
      )
    }

    const showAvailability = await getShowAvailability()

    // 3. Refresh availability only when the toggle says so (TTL-gated, deduped)
    if (showAvailability) {
      await refreshAvailability()
    }

    // 4. Build response — drop departed slots; drop sold-out only when we are tracking availability
    const nowUtc = Math.floor(Date.now() / 1000)
    const departures: DepartingSoonItem[] = []
    for (const slot of discoveryCache.slots) {
      if (slot.startTimeUtcSeconds <= nowUtc) continue

      let spacesRemaining: number | "UNLIMITED" | undefined
      if (showAvailability) {
        const avail = availabilityCache?.byTripId[slot.tripId]
        // No live record yet — fall back to the snapshot from discovery so the
        // card still appears (avoids a blank widget while availability warms up)
        const effective = avail ?? { spacesRemaining: slot.initialSpacesRemaining, stillBookable: true }
        if (!effective.stillBookable) continue
        if (effective.spacesRemaining !== "UNLIMITED" && effective.spacesRemaining <= 0) continue
        spacesRemaining = effective.spacesRemaining
      }

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
        ...(spacesRemaining !== undefined ? { spacesRemaining } : {}),
      })
    }

    const autoUpdate = await getAutoUpdateEnabled()
    const intervalSecs = await getAutoUpdateIntervalSeconds()

    return NextResponse.json({
      ok: true,
      departures,
      widgetEnabled: true,
      showAvailability,
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
