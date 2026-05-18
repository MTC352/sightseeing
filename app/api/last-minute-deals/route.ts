/**
 * GET /api/last-minute-deals
 *
 * Evaluates admin-configurable Last Minute Deal rules against the
 * departing-soon discovery + availability caches. No TourCMS calls of its own.
 *
 * Rules (all must pass for a slot to qualify):
 *   1. spacesRemaining ≤ lmd_max_spaces
 *   2. departure is within lmd_max_hours hours from now
 *   3. slot is still bookable
 *
 * Returns up to lmd_max_cards qualifying slots, sorted soonest-first.
 * When no live deals qualify, also returns `previewDeals` (soonest upcoming
 * slots with no rules applied) so the widget always has content to show.
 *
 * When the discovery cache is still warming (cold start), returns
 * `cacheWarming: true` so the client retries after a short delay.
 */

import { NextResponse } from "next/server"
import {
  discoveryCache,
  availabilityCache,
  getLmdWidgetEnabled,
  getLmdMaxSpaces,
  getLmdMaxHours,
  getLmdMaxCards,
  getShowAvailability,
  isDiscoveryExpired,
  triggerDiscoveryBootstrap,
} from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

export interface LastMinuteDealItem {
  tripId: string
  palisisId: string
  tripTitle: string
  tripImage: string
  tripCategory: string
  tripCity: string
  date: string
  time: string
  startTimeUtcSeconds: number
  priceDisplay: string
  spacesRemaining: number
  hoursUntilDeparture: number
}

export async function GET() {
  try {
    const widgetEnabled = await getLmdWidgetEnabled()
    if (!widgetEnabled) {
      return NextResponse.json({ ok: true, enabled: false, deals: [], previewDeals: [] })
    }

    // Mirror the departing-soon bootstrap pattern: trigger a background refresh
    // when stale/absent, but only block (return cacheWarming) on true cold start.
    if (isDiscoveryExpired()) {
      triggerDiscoveryBootstrap()
    }

    if (!discoveryCache) {
      // Cache is still warming (cold start). Tell the client to retry.
      return NextResponse.json({
        ok: true,
        enabled: true,
        cacheWarming: true,
        deals: [],
        previewDeals: [],
        hint: "Discovery cache is warming — retry in a few seconds.",
      })
    }

    const [maxSpaces, maxHours, maxCards, showAvail] = await Promise.all([
      getLmdMaxSpaces(),
      getLmdMaxHours(),
      getLmdMaxCards(),
      getShowAvailability(),
    ])

    const nowUtc = Math.floor(Date.now() / 1000)
    const horizonUtc = nowUtc + maxHours * 3600

    const deals: LastMinuteDealItem[] = []

    for (const slot of discoveryCache.allSlots) {
      // Must be in the future and within the LMD window
      if (slot.startTimeUtcSeconds <= nowUtc) continue
      if (slot.startTimeUtcSeconds > horizonUtc) continue

      // Determine live spaces (fall back to discovery snapshot when no avail cache yet)
      let spaces: number | "UNLIMITED" | undefined

      if (showAvail && availabilityCache) {
        const key = `${slot.tripId}:${slot.date}:${slot.time}`
        const avail = availabilityCache.bySlotKey[key]
        if (avail) {
          if (!avail.stillBookable) continue
          spaces = avail.spacesRemaining
        } else {
          spaces = slot.initialSpacesRemaining
        }
      } else {
        spaces = slot.initialSpacesRemaining
      }

      if (spaces === "UNLIMITED") continue
      if (spaces === undefined) continue
      if (spaces > maxSpaces) continue

      const hoursUntilDeparture =
        Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10

      deals.push({
        tripId: slot.tripId,
        palisisId: slot.palisisId,
        tripTitle: slot.tripTitle,
        tripImage: slot.tripImage,
        tripCategory: slot.tripCategory,
        tripCity: slot.tripCity,
        date: slot.date,
        time: slot.time,
        startTimeUtcSeconds: slot.startTimeUtcSeconds,
        priceDisplay: slot.priceDisplay,
        spacesRemaining: spaces,
        hoursUntilDeparture,
      })

      if (deals.length >= maxCards) break
    }

    // When no live deals qualify, build a preview from the soonest upcoming slots
    // (no rules applied) so the widget always has something to show.
    const previewDeals: LastMinuteDealItem[] = []
    if (deals.length === 0) {
      for (const slot of discoveryCache.allSlots) {
        if (slot.startTimeUtcSeconds <= nowUtc) continue
        const hoursUntilDeparture =
          Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10
        const spaces =
          showAvail && availabilityCache
            ? (availabilityCache.bySlotKey[`${slot.tripId}:${slot.date}:${slot.time}`]
                ?.spacesRemaining ?? slot.initialSpacesRemaining)
            : slot.initialSpacesRemaining
        previewDeals.push({
          tripId: slot.tripId,
          palisisId: slot.palisisId,
          tripTitle: slot.tripTitle,
          tripImage: slot.tripImage,
          tripCategory: slot.tripCategory,
          tripCity: slot.tripCity,
          date: slot.date,
          time: slot.time,
          startTimeUtcSeconds: slot.startTimeUtcSeconds,
          priceDisplay: slot.priceDisplay,
          spacesRemaining: spaces === "UNLIMITED" ? 999 : (spaces ?? 0),
          hoursUntilDeparture,
        })
        if (previewDeals.length >= maxCards) break
      }
    }

    return NextResponse.json({
      ok: true,
      enabled: true,
      deals,
      previewDeals,
      rules: { maxSpaces, maxHours, maxCards },
    })
  } catch (err) {
    console.error("[last-minute-deals] GET threw:", err)
    return NextResponse.json(
      { ok: false, deals: [], previewDeals: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
