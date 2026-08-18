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
  getSliderScrollPx,
  luxembourgTodayDate,
  hydrateFromDbAwait,
} from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

/** Public response shape — kept stable for the client component. */
export interface DepartingSoonItem {
  tripId: string
  palisisId: string
  tripTitle: string
  tripImage: string
  tripPermalink: string
  tripSlug: string | null
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
    //    - null  → AWAIT a DB-only hydration (no TourCMS). When a valid snapshot
    //              exists (the common case — the instrumentation bootstrap or an
    //              admin/cron route persists one), we serve it as 200 on THIS
    //              request instead of a warm-up 503. Only when there is genuinely
    //              no snapshot do we return 503; the bootstrap/cron will populate
    //              it and the next request succeeds.
    //    - expired → serve stale data; admin/cron routes handle refresh.
    if (!discoveryCache) {
      const hydrated = await hydrateFromDbAwait()
      if (!hydrated) {
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
    }

    // "Departing Soon" means departing TODAY (Luxembourg local date) on EVERY
    // surface — homepage widget and standalone page alike. `scope=today` only
    // controls capping: it powers the standalone page with NO slot-count cap,
    // returning the soonest upcoming slot for every trip departing today. The
    // default scope (homepage widget) is likewise today-only but capped at
    // slotCount. Neither scope surfaces departures for future days.
    const params = new URL(req.url).searchParams
    const scope = params.get("scope")
    const uncapped = scope === "today"
    // `dsFilter=1` applies the per-trip "Show in Departing Soon" toggle. ONLY the
    // Departing Soon widget + standalone page send it; the Filling Up Fast page
    // (which shares this endpoint) omits it so the toggle never affects it.
    const applyDsToggle = params.get("dsFilter") === "1"
    const luxToday = luxembourgTodayDate()

    // Phase-1 fast paint: `availability=0` returns cards straight from the
    // discovery snapshot with NO seat-count overlay or sold-out filtering, so
    // the page can render instantly. The client then re-fetches WITH
    // availability (default) to overlay live seat pills for the visible trips.
    const withAvailability = params.get("availability") !== "0"
    // `availabilityEnabled` = the real admin toggle (reported to the client so
    // it knows whether to render a loading skeleton on the seat pill during the
    // snapshot phase). `showAvailability` = whether THIS response applied it.
    const availabilityEnabled = await getShowAvailability()
    const showAvailability = withAvailability && availabilityEnabled
    const slotCount = await getSlotCount()
    // All trips' earliest upcoming slot, restricted to TODAY's departures — NO
    // count cap yet. The availability filter runs below; we slice to slotCount
    // AFTER it (default scope only).
    const displayed = computeDisplayedSlots().filter(
      (slot) => slot.date === luxToday,
    )

    // Re-validate eligibility against the live DB so that trips archived — or
    // (when dsFilter is on) toggled OFF for Departing Soon — AFTER the discovery
    // cache was built drop out immediately (otherwise they'd leak until the next
    // discovery refresh window). The `departing_soon_enabled` gate is applied
    // ONLY for the Departing Soon surfaces (dsFilter=1); it defaults to true, so
    // only trips the admin has explicitly disabled are excluded.
    let publishedIds: Set<string> | null = null
    try {
      const { query } = await import("@/lib/db")
      const rows = (await query(
        applyDsToggle
          ? `SELECT id FROM trips WHERE status = 'published' AND departing_soon_enabled = true`
          : `SELECT id FROM trips WHERE status = 'published'`,
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
        tripSlug: slot.tripSlug,
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
    // The standalone page (scope=today) is uncapped: it shows every today trip.
    const departures = uncapped ? allPassing : allPassing.slice(0, slotCount)

    const autoUpdate = await getAutoUpdateEnabled()
    const intervalSecs = await getAutoUpdateIntervalSeconds()
    const availabilityThreshold = await getAvailabilityThreshold()
    const sliderScrollPx = await getSliderScrollPx()

    return NextResponse.json({
      ok: true,
      departures,
      scope: uncapped ? "today" : "default",
      today: luxToday,
      widgetEnabled: true,
      showAvailability,
      availabilityEnabled,
      autoUpdate,
      intervalSecs,
      availabilityThreshold,
      sliderScrollPx,
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
