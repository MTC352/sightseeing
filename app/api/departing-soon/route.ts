/**
 * GET /api/departing-soon
 *
 * READ-ONLY endpoint consumed by the homepage widget.
 * Never calls TourCMS directly — only `refreshAvailability()` (TTL-gated, deduped)
 * and `triggerDiscoveryBootstrap()` (non-blocking, fires when the discovery
 * window has expired).
 */

import { NextResponse } from "next/server"
import { getTourCMSConfig } from "@/lib/tourcms"
import {
  discoveryCache,
  availabilityCache,
  refreshAvailability,
  triggerDiscoveryBootstrap,
  computeDisplayedSlots,
  isDiscoveryExpired,
  getAutoUpdateEnabled,
  getAutoUpdateIntervalSeconds,
  getWidgetEnabled,
  getShowAvailability,
  getAvailabilityThreshold,
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
    // 0. Master toggle
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

    // 2. Lazy bootstrap / expiry refresh — non-blocking when we have stale data,
    //    blocking 503 only on cold start.
    if (isDiscoveryExpired()) {
      triggerDiscoveryBootstrap()
      if (!discoveryCache) {
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
      // else: cache is past expiresAt but we'll serve stale slots while the
      // background refresh runs — much better UX than a 503.
    }

    const showAvailability = await getShowAvailability()
    const displayed = await computeDisplayedSlots()

    // 3. Refresh availability only when the toggle says so (TTL-gated, deduped)
    if (showAvailability) {
      await refreshAvailability()
    }

    // 4. Build response — drop sold-out only when we are tracking availability
    const departures: DepartingSoonItem[] = []
    for (const slot of displayed) {
      let spacesRemaining: number | "UNLIMITED" | undefined
      if (showAvailability) {
        const key = `${slot.tripId}:${slot.date}:${slot.time}`
        const avail = availabilityCache?.bySlotKey[key]
        // No live record yet (warming up) — fall back to initial snapshot so
        // the card still appears.
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
    const availabilityThreshold = await getAvailabilityThreshold()

    return NextResponse.json({
      ok: true,
      departures,
      widgetEnabled: true,
      showAvailability,
      autoUpdate,
      intervalSecs,
      availabilityThreshold,
      tourcmsConfigured: true,
      partial: departures.length < displayed.length,
      tripsChecked: discoveryCache?.tripsChecked ?? 0,
      failedTripCount: discoveryCache?.failedTripCount ?? 0,
      totalSlotsCached: discoveryCache?.allSlots.length ?? 0,
      daysFetched: discoveryCache?.daysFetched ?? 0,
      lastDiscoveryAt: discoveryCache ? new Date(discoveryCache.refreshedAt).toISOString() : null,
      discoveryExpiresAt: discoveryCache ? new Date(discoveryCache.expiresAt).toISOString() : null,
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
