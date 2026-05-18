/**
 * GET /api/last-minute-deals
 *
 * Evaluates admin-configurable Last Minute Deal rules against the
 * departing-soon discovery + availability caches.
 *
 * Calls refreshAvailability() so spaces data is live (not just the initial
 * discovery snapshot), giving accurate seat counts for each slot.
 *
 * Both `deals` (urgency mode) and `previewDeals` (fallback) are enriched
 * with full DB trip data so the frontend can render TripCard-identical cards.
 *
 * On cold start (cache warming) returns cacheWarming:true → client retries.
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
  refreshAvailability,
} from "@/lib/departing-soon-cache"
import { dbGetTrip } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

/** Unified shape for both live deals and preview deals. */
export interface DealItem {
  // ── Slot / availability data (from Palisis cache) ───────────────────────
  tripId: string
  palisisId: string
  date: string          // "YYYY-MM-DD"
  time: string          // "HH:MM"
  startTimeUtcSeconds: number
  priceDisplay: string  // Palisis formatted price e.g. "€7"
  spacesRemaining: number
  hoursUntilDeparture: number
  // ── DB trip data (joined for card rendering) ─────────────────────────────
  title: string
  image: string
  category: string
  city: string
  price: number         // 0 = no DB price; use priceDisplay
  originalPrice?: number
  rating: number        // 0 = no rating data
  reviewCount: number
  duration: string
  badge?: string
  permalink?: string
}

/** Parse "€14" or "14.00 EUR" → 14 */
function parsePriceDisplay(display: string): number {
  const n = parseFloat(display.replace(/[^0-9.]/g, ""))
  return isNaN(n) ? 0 : n
}

/** Enrich a discovery slot with its DB trip row. */
async function enrichSlot(
  slot: {
    tripId: string; palisisId: string; tripTitle: string; tripImage: string
    tripCategory: string; tripCity: string; date: string; time: string
    startTimeUtcSeconds: number; priceDisplay: string; initialSpacesRemaining: number | "UNLIMITED"
  },
  spaces: number,
  hoursUntilDeparture: number,
): Promise<DealItem> {
  const db = await dbGetTrip(slot.tripId)

  const rawTags = db?.tags
  const _tags: string[] = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === "string"
      ? (rawTags as string).replace(/[{}"]/g, "").split(",").filter(Boolean)
      : []

  const dbPrice   = db?.price   != null ? Number(db.price)   : 0
  const dbOrig    = db?.originalPrice != null ? Number(db.originalPrice) : undefined
  const dbRating  = db?.rating  != null ? Number(db.rating)  : 0
  const dbReviews = db?.reviewCount != null ? Number(db.reviewCount) : 0

  return {
    tripId: slot.tripId,
    palisisId: slot.palisisId,
    date: slot.date,
    time: slot.time,
    startTimeUtcSeconds: slot.startTimeUtcSeconds,
    priceDisplay: slot.priceDisplay,
    spacesRemaining: spaces,
    hoursUntilDeparture,
    title:       db?.title    ?? slot.tripTitle,
    image:       db?.image    ?? slot.tripImage,
    category:    db?.category ?? slot.tripCategory,
    city:        db?.city     ?? slot.tripCity,
    price:       dbPrice,
    originalPrice: dbOrig,
    rating:      dbRating,
    reviewCount: dbReviews,
    duration:    db?.duration ?? "",
    badge:       db?.badge    ?? undefined,
    permalink:   db?.permalink ?? undefined,
  }
}

export async function GET() {
  try {
    const widgetEnabled = await getLmdWidgetEnabled()
    if (!widgetEnabled) {
      return NextResponse.json({ ok: true, enabled: false, deals: [], previewDeals: [] })
    }

    // Trigger bootstrap if stale (non-blocking when stale data exists)
    if (isDiscoveryExpired()) triggerDiscoveryBootstrap()

    if (!discoveryCache) {
      return NextResponse.json({
        ok: true, enabled: true, cacheWarming: true,
        deals: [], previewDeals: [],
        hint: "Discovery cache is warming — retry in a few seconds.",
      })
    }

    const [maxSpaces, maxHours, maxCards, showAvail] = await Promise.all([
      getLmdMaxSpaces(), getLmdMaxHours(), getLmdMaxCards(), getShowAvailability(),
    ])

    // ── Pull live availability so seat counts are accurate ────────────────
    if (showAvail) await refreshAvailability()

    const nowUtc     = Math.floor(Date.now() / 1000)
    const horizonUtc = nowUtc + maxHours * 3600

    // ── Live deals (all rules applied) ────────────────────────────────────
    const deals: DealItem[] = []

    for (const slot of discoveryCache.allSlots) {
      if (slot.startTimeUtcSeconds <= nowUtc) continue
      if (slot.startTimeUtcSeconds > horizonUtc) continue

      let spaces: number | "UNLIMITED" | undefined

      if (showAvail && availabilityCache) {
        const key  = `${slot.tripId}:${slot.date}:${slot.time}`
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

      if (spaces === "UNLIMITED" || spaces === undefined) continue
      if (spaces > maxSpaces) continue

      const hrs = Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10
      deals.push(await enrichSlot(slot, spaces, hrs))
      if (deals.length >= maxCards) break
    }

    // ── Preview deals (no urgency rules; one per unique trip) ─────────────
    const previewDeals: DealItem[] = []

    if (deals.length === 0) {
      const seenTrips = new Set<string>()

      for (const slot of discoveryCache.allSlots) {
        if (slot.startTimeUtcSeconds <= nowUtc) continue
        if (seenTrips.has(slot.tripId)) continue
        seenTrips.add(slot.tripId)

        // Best available spaces — live avail cache > initial snapshot
        let spaces: number = 0
        if (showAvail && availabilityCache) {
          const key   = `${slot.tripId}:${slot.date}:${slot.time}`
          const avail = availabilityCache.bySlotKey[key]
          const raw   = avail?.spacesRemaining ?? slot.initialSpacesRemaining
          spaces = raw === "UNLIMITED" ? 999 : (raw ?? 0)
        } else {
          const raw = slot.initialSpacesRemaining
          spaces = raw === "UNLIMITED" ? 999 : (raw ?? 0)
        }

        const hrs = Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10
        previewDeals.push(await enrichSlot(slot, spaces, hrs))
        if (previewDeals.length >= maxCards) break
      }
    }

    return NextResponse.json({
      ok: true, enabled: true, deals, previewDeals,
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
