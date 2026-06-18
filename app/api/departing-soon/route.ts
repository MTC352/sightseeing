/**
 * GET /api/departing-soon
 *
 * READ-ONLY endpoint consumed by the homepage widget.
 * Serves from in-process cache only — never triggers TourCMS refresh work.
 * Discovery bootstrap and availability refresh are performed exclusively by
 * the privileged cron/admin routes:
 *   POST /api/cron/refresh-discovery          (cron secret)
 *   POST /api/admin/refresh-discovery         (admin JWT)
 *   POST /api/cron/auto-update-availability   (cron secret)
 *   POST /api/admin/refresh-availability      (admin JWT)
 */

import { NextResponse } from "next/server"
import { getTourCMSConfig } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import {
  discoveryCache,
  availabilityCache,
  computeDisplayedSlots,
  getAutoUpdateEnabled,
  getAutoUpdateIntervalSeconds,
  getWidgetEnabled,
  getShowAvailability,
  getAvailabilityThreshold,
  getSlotCount,
  tryHydrateFromDb,
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

export async function GET(req: Request) {
  // Route-level abuse control: this public endpoint can indirectly drive
  // upstream TourCMS refresh work, so cap per-IP request volume (production
  // only — see lib/rate-limit.ts for the dev/preview bypass rationale).
  schedulePrune()
  const limit = rateLimit(req, { limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return limit.response

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

    // 2. Discovery cache check.
    //    - null  → attempt a DB-only hydration (no TourCMS), then return 503.
    //              The instrumentation bootstrap (45s after server start) or an
    //              admin/cron route will populate the DB snapshot; subsequent
    //              public requests will hydrate from it without any TourCMS call.
    //    - expired → serve stale data; admin/cron routes handle refresh.
    if (!discoveryCache) {
      tryHydrateFromDb()
      return NextResponse.json(
        {
          ok: false,
          error: "DISCOVERY_NOT_INITIALIZED",
          departures: [],
          widgetEnabled: true,
          tourcmsConfigured: true,
          hint: "Discovery cache is warming — retry in a few seconds.",
        },
        { status: 503 },
      )
    }

    const showAvailability = await getShowAvailability()
    const slotCount = await getSlotCount()
    // All trips' earliest upcoming slots — NO count cap yet.
    // The availability filter runs below; we slice to slotCount AFTER it.
    const displayed = computeDisplayedSlots()

    // Re-validate publication status against the live DB so that trips
    // archived AFTER the discovery cache was built drop out immediately
    // (otherwise they'd leak until the next discovery refresh window).
    let publishedIds: Set<string> | null = null
    try {
      const { query } = await import("@/lib/db")
      const rows = (await query(
        `SELECT id FROM trips WHERE status = 'published'`,
      )) as Array<{ id: string }>
      publishedIds = new Set(rows.map((r) => String(r.id)))
    } catch {
      // Fail-closed for safety: if we can't verify, hide the widget rather
      // than risk surfacing archived trips.
      publishedIds = null
    }

    // 3. Availability is served from the in-process cache only.
    //    The cron/admin availability refresh routes maintain that cache.
    //    No TourCMS fan-out is initiated from this public route.

    // 4. Build response — check ALL trips through the filters, then cap at slotCount.
    //    This ensures availability filtering happens before the count limit so that
    //    sold-out / non-bookable trips don't consume one of the N display slots.
    const allPassing: DepartingSoonItem[] = []
    for (const slot of displayed) {
      // Hard gate: drop any slot whose trip is no longer in the published set.
      if (publishedIds === null || !publishedIds.has(String(slot.tripId))) continue
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

      allPassing.push({
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

    // Slice AFTER filtering — so we always show up to slotCount bookable trips.
    const departures = allPassing.slice(0, slotCount)

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
