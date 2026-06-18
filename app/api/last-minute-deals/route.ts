/**
 * GET /api/last-minute-deals
 *
 * "Filling Up Fast" widget — shows trips whose earliest upcoming slot is
 * running low on seats, sorted by fewest seats first (strongest FOMO first).
 *
 * Data flow:
 *   1. Availability cache covers ALL trips' first slots.
 *   2. For each trip's first slot we check live spaces from the avail cache,
 *      falling back to the discovery snapshot when the cache is cold.
 *   3. Only slots with 0 < spacesRemaining ≤ lmd_max_spaces qualify.
 *      Sold-out (0) and unlimited seats are excluded.
 *   4. Qualifying trips sorted ascending by spacesRemaining — least seats first.
 *   5. When no trip qualifies the widget falls back to PREVIEW mode
 *      (soonest upcoming slots, same TripCard design, no urgency rule).
 *
 * On cold start returns cacheWarming:true → client retries with back-off.
 *
 * This public endpoint NEVER triggers TourCMS refresh work. Discovery and
 * availability refreshes are performed exclusively by the privileged cron/admin
 * routes so unauthenticated callers cannot drive upstream quota consumption.
 */

import { NextResponse } from "next/server"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import {
  discoveryCache,
  availabilityCache,
  getLmdWidgetEnabled,
  getLmdMaxSpaces,
  getLmdMaxHours,
  getLmdMaxCards,
  getShowAvailability,
  computeAllFirstSlots,
  isDiscoveryExpired,
  triggerDiscoveryBootstrap,
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
    startTimeUtcSeconds: number; priceDisplay: string
  },
  spaces: number,
  hoursUntilDeparture: number,
): Promise<DealItem | null> {
  // publicOnly: archived/draft trips must never surface in last-minute deals.
  // Caller filters out nulls (see GET handler) so a freshly-archived trip
  // disappears from cards even before the discovery cache refreshes.
  const db = await dbGetTrip(slot.tripId, { publicOnly: true })
  if (!db) return null

  const dbPrice   = db?.price         != null ? Number(db.price)         : 0
  const dbOrig    = db?.originalPrice != null ? Number(db.originalPrice) : undefined
  const dbRating  = db?.rating        != null ? Number(db.rating)        : 0
  const dbReviews = db?.reviewCount   != null ? Number(db.reviewCount)   : 0

  return {
    tripId: slot.tripId,
    palisisId: slot.palisisId,
    date: slot.date,
    time: slot.time,
    startTimeUtcSeconds: slot.startTimeUtcSeconds,
    priceDisplay: slot.priceDisplay,
    spacesRemaining: spaces,
    hoursUntilDeparture,
    title:        String(db?.title    ?? slot.tripTitle),
    image:        String(db?.image    ?? slot.tripImage),
    category:     String(db?.category ?? slot.tripCategory),
    city:         String(db?.city     ?? slot.tripCity),
    price:        dbPrice,
    originalPrice: dbOrig,
    rating:       dbRating,
    reviewCount:  dbReviews,
    duration:     String(db?.duration ?? ""),
    badge:        db?.badge    != null ? String(db.badge)    : undefined,
    permalink:    db?.permalink != null ? String(db.permalink) : undefined,
  }
}

export async function GET(req: Request) {
  // Route-level abuse control: this public endpoint can indirectly drive
  // upstream TourCMS refresh work, so cap per-IP request volume (production
  // only — see lib/rate-limit.ts for the dev/preview bypass rationale).
  schedulePrune()
  const limit = rateLimit(req, { limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return limit.response

  try {
    const widgetEnabled = await getLmdWidgetEnabled()
    if (!widgetEnabled) {
      return NextResponse.json({ ok: true, enabled: false, deals: [], previewDeals: [] })
    }

    // Bootstrap the discovery cache on first hit (fire-and-forget, idempotent).
    // If null → serve cacheWarming response once; if expired → serve stale
    // while background refresh runs. The bootstrap only hits TourCMS once per
    // discovery window (~7 days); the DB cross-instance cache means cold-start
    // instances hydrate from DB rather than triggering a new sweep.
    if (!discoveryCache) {
      triggerDiscoveryBootstrap()
      return NextResponse.json({
        ok: true, enabled: true, cacheWarming: true,
        deals: [], previewDeals: [],
        hint: "Discovery cache is warming — retry in a few seconds.",
      })
    }
    if (isDiscoveryExpired()) {
      triggerDiscoveryBootstrap()
    }

    const [maxSpaces, maxHours, maxCards, showAvail] = await Promise.all([
      getLmdMaxSpaces(), getLmdMaxHours(), getLmdMaxCards(), getShowAvailability(),
    ])

    // Availability is served from the in-process cache only.
    // The cron/admin availability refresh routes maintain that cache.

    const nowUtc     = Math.floor(Date.now() / 1000)
    const horizonUtc = nowUtc + maxHours * 3600

    // ── Get each trip's earliest upcoming slot ────────────────────────────
    const allFirst = computeAllFirstSlots()

    // ── Live deals: filter by spaces ≤ maxSpaces, sort fewest first ───────
    const dealCandidates: Array<{ slot: typeof allFirst[0]; spaces: number; hrs: number }> = []

    for (const slot of allFirst) {
      // Optional hours gate (admin can restrict to e.g. "departing within 24h")
      if (slot.startTimeUtcSeconds > horizonUtc) continue

      // Resolve live spaces — availability cache > discovery snapshot
      let spaces: number

      if (showAvail && availabilityCache) {
        const key   = `${slot.tripId}:${slot.date}:${slot.time}`
        const avail = availabilityCache.bySlotKey[key]

        if (avail) {
          if (!avail.stillBookable) continue  // sold out / closed
          if (avail.spacesRemaining === "UNLIMITED") continue  // not filling up
          spaces = avail.spacesRemaining as number
        } else {
          // Avail cache hasn't covered this trip yet — use discovery snapshot
          const raw = slot.initialSpacesRemaining
          if (raw === "UNLIMITED") continue
          spaces = raw ?? 0
        }
      } else {
        const raw = slot.initialSpacesRemaining
        if (raw === "UNLIMITED") continue
        spaces = raw ?? 0
      }

      if (spaces <= 0) continue         // sold out
      if (spaces > maxSpaces) continue  // not low enough to show

      const hrs = Math.round(((slot.startTimeUtcSeconds - nowUtc) / 3600) * 10) / 10
      dealCandidates.push({ slot, spaces, hrs })
    }

    // Sort: fewest seats first (strongest FOMO first)
    dealCandidates.sort((a, b) => a.spaces - b.spaces)

    // Enrich top-N with DB trip data. enrichSlot returns null when the trip
    // is no longer published (e.g. archived after the discovery cache was
    // built) — drop those so stale cards don't leak through.
    const enrichedDeals = await Promise.all(
      dealCandidates
        .slice(0, maxCards)
        .map(({ slot, spaces, hrs }) => enrichSlot(slot, spaces, hrs)),
    )
    const deals: DealItem[] = enrichedDeals.filter((d): d is DealItem => d !== null)

    // ── Preview deals — when no trip qualifies the urgency filter ─────────
    // Shows soonest upcoming trips (one per trip, all trips, sorted by time).
    const previewDeals: DealItem[] = []

    if (deals.length === 0) {
      const seenTrips = new Set<string>()

      for (const slot of allFirst) {
        if (seenTrips.has(slot.tripId)) continue
        seenTrips.add(slot.tripId)

        // Best available spaces (avail cache > discovery snapshot)
        let spaces = 0
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
        const enriched = await enrichSlot(slot, spaces, hrs)
        if (enriched) previewDeals.push(enriched)
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
