import { NextResponse } from "next/server"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import {
  scanCatalogAvailability,
  pruneAvailabilityCache,
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
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null
  // Party size (adults + children). A slot with fewer seats than the group
  // cannot actually be booked together, so it must NOT count as "available"
  // (the scan filters slots by party size). Clamp to a sane range; default 1.
  const partyRaw = parseInt((searchParams.get("party") ?? "1").trim(), 10)
  const partySize = Number.isFinite(partyRaw) ? partyRaw : 1

  const data = await scanCatalogAvailability({ selectedDate, partySize })
  return NextResponse.json(data)
}
