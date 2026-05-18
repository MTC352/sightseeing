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
 * Returns up to lmd_max_cards qualifying slots as `deals` (live urgency mode).
 *
 * When no live deals qualify, also returns `previewDeals` — the soonest
 * upcoming slots enriched with full DB trip data, so the frontend can render
 * them using the exact same TripCard design as the original static DealsSection.
 *
 * On cold start (cache still warming) returns `cacheWarming: true` so the
 * client retries after a short delay.
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
import { dbGetTrip } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/** Shape for a live last-minute deal (urgency mode). */
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

/**
 * Shape for a preview deal — the soonest upcoming slot enriched with DB trip
 * data so the frontend can render it with the exact TripCard default variant.
 */
export interface PreviewDealItem {
  tripId: string
  date: string
  time: string
  hoursUntilDeparture: number
  priceDisplay: string
  /** Full DB trip fields — mirrors the Trip interface in lib/data.ts */
  trip: {
    id: string
    title: string
    image: string
    price: number
    originalPrice?: number
    rating: number
    reviewCount: number
    duration: string
    category: string
    tags: string[]
    badge?: string
    city?: string
    permalink?: string
  }
}

export async function GET() {
  try {
    const widgetEnabled = await getLmdWidgetEnabled()
    if (!widgetEnabled) {
      return NextResponse.json({ ok: true, enabled: false, deals: [], previewDeals: [] })
    }

    // Mirror the departing-soon bootstrap pattern.
    if (isDiscoveryExpired()) {
      triggerDiscoveryBootstrap()
    }

    if (!discoveryCache) {
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

    // ── Live deals (strict rules applied) ────────────────────────────────────
    const deals: LastMinuteDealItem[] = []

    for (const slot of discoveryCache.allSlots) {
      if (slot.startTimeUtcSeconds <= nowUtc) continue
      if (slot.startTimeUtcSeconds > horizonUtc) continue

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

    // ── Preview deals (no rules — enriched with full DB trip data) ────────────
    // Built only when no live deals qualify so the widget always shows content.
    const previewDeals: PreviewDealItem[] = []

    if (deals.length === 0) {
      // Collect soonest upcoming slots (one per unique trip)
      const seenTrips = new Set<string>()
      const candidates = discoveryCache.allSlots.filter(
        (s) => s.startTimeUtcSeconds > nowUtc,
      )

      for (const slot of candidates) {
        if (seenTrips.has(slot.tripId)) continue
        seenTrips.add(slot.tripId)

        // Enrich with full DB trip row so TripCard gets everything it needs
        const dbTrip = await dbGetTrip(slot.tripId)

        const hoursUntilDeparture =
          Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10

        const rawTags = dbTrip?.tags
        const tags: string[] = Array.isArray(rawTags)
          ? rawTags
          : typeof rawTags === "string"
            ? (rawTags as string).replace(/[{}"]/g, "").split(",").filter(Boolean)
            : []

        previewDeals.push({
          tripId: slot.tripId,
          date: slot.date,
          time: slot.time,
          hoursUntilDeparture,
          priceDisplay: slot.priceDisplay,
          trip: {
            id: slot.tripId,
            title: dbTrip?.title ?? slot.tripTitle,
            image: dbTrip?.image ?? slot.tripImage,
            price: dbTrip?.price != null ? Number(dbTrip.price) : 0,
            originalPrice:
              dbTrip?.originalPrice != null ? Number(dbTrip.originalPrice) : undefined,
            rating: dbTrip?.rating != null ? Number(dbTrip.rating) : 4.5,
            reviewCount: dbTrip?.reviewCount != null ? Number(dbTrip.reviewCount) : 0,
            duration: dbTrip?.duration ?? "",
            category: dbTrip?.category ?? slot.tripCategory,
            tags,
            badge: dbTrip?.badge ?? undefined,
            city: dbTrip?.city ?? slot.tripCity,
            permalink: dbTrip?.permalink ?? undefined,
          },
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
