import { NextResponse } from "next/server"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import {
  scanCatalogAvailability,
  pruneAvailabilityCache,
  MAX_SELECTED_DATE_DAYS,
  MAX_PARTY_SIZE,
  type PlannerTripAvailability,
  type PlannerAvailabilityResponse,
} from "@/lib/planner/availability-scan"

export const dynamic = "force-dynamic"

// Re-export the shared types so existing importers of this route module keep working.
export type { PlannerTripAvailability, PlannerAvailabilityResponse }

/**
 * Public client endpoint for the planner's whole-catalog availability scan.
 * Thin wrapper over the shared `scanCatalogAvailability` (lib/planner/availability-scan.ts)
 * — the SAME function the server-side planner chat route uses, so the Trip Canvas
 * and the chat can never disagree about what is bookable on a date.
 */
export async function GET(req: Request) {
  schedulePrune()
  pruneAvailabilityCache()
  const rl = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = new URL(req.url)
  const dateParam = (searchParams.get("date") ?? "").trim()

  // Validate and clamp the selected date.  Rotating far-future dates creates a
  // fresh cache key each time and triggers a whole-catalog TourCMS sweep per
  // request.  We reject anything more than MAX_SELECTED_DATE_DAYS from today so
  // the number of possible cache keys stays bounded.
  let selectedDate: string | null = null
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const todayMs = Date.now()
    const datMs = new Date(`${dateParam}T00:00:00.000Z`).getTime()
    const daysAhead = Math.round((datMs - todayMs) / 86_400_000)
    if (daysAhead < 0) {
      // Past dates: treat as no date selected (no cached scan window for them).
      selectedDate = null
    } else if (daysAhead > MAX_SELECTED_DATE_DAYS) {
      return NextResponse.json(
        { error: "Date is too far in the future. Please choose a date within the next 6 months." },
        { status: 400 },
      )
    } else {
      selectedDate = dateParam
    }
  }

  // Party size (adults + children).  A slot with fewer seats than the group
  // cannot actually be booked together, so it must NOT count as "available"
  // (the scan filters slots by party size).  Cap at MAX_PARTY_SIZE: exposing
  // the full 1-20 range doubles the number of cache-key variants an attacker
  // can cycle through without any real-world benefit (8 is a large group).
  const partyRaw = parseInt((searchParams.get("party") ?? "1").trim(), 10)
  const partySize = Number.isFinite(partyRaw) ? Math.min(MAX_PARTY_SIZE, Math.max(1, partyRaw)) : 1

  // Shared cross-instance per-IP limit as an additional layer on top of the
  // process-local limit above.  Fail-open on DB error.
  const { sharedRateLimit: srl, getClientIp: gcip } = await import("@/lib/shared-rate-limit")
  const availClientIp = gcip(req)
  const sharedAvail = await srl(`avail:${availClientIp}`, { limit: 20, windowMs: 60_000 })
  if (!sharedAvail.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": "60" } },
    )
  }

  const data = await scanCatalogAvailability({ selectedDate, partySize })
  return NextResponse.json(data)
}
