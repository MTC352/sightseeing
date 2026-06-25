/* ─────────────────────────────────────────────────────────────────────────
   Deterministic conflict-free AUTO-PICK selector for the Trip Planner.

   This is the pure, side-effect-free core behind the planner's `autoPickTrips`
   tool. The AI NEVER decides which concrete trips/timeslots end up picked — it
   only asks (with an explicit user request) for "the best one" or "the best for
   my whole day". This module then deterministically chooses a set of real,
   bookable timeslots that:

     • each fit the party size and the day window,
     • do NOT conflict in time with EACH OTHER, and
     • do NOT conflict with the trips already in the visitor's My Trip list
       (the "preselected" / locked trips).

   It mirrors the timing philosophy of lib/itinerary/scheduler.ts (a separation
   between consecutive stops = admin buffer + travel time) so an auto-picked set
   schedules the same way the final itinerary will. It is intentionally pure (no
   TourCMS / Mapbox / DB) so it is fully unit-testable: the server tool converts
   live timeslots into the numeric shape below and feeds it in.
   ───────────────────────────────────────────────────────────────────────── */

export interface AutoPickSlot {
  /** Minutes from midnight (0–1440+). */
  startMin: number
  /** Minutes from midnight; may exceed 1440 for late-night spill. */
  endMin: number
  /** Seats left; null = unlimited. */
  spacesRemaining: number | null
}

export interface AutoPickCandidate {
  id: string
  title: string
  city: string
  /** Higher = better interest/match fit. Used to order the pick. */
  score: number
  /** Real bookable timeslots on the visit date. */
  slots: AutoPickSlot[]
  /** Already in the My Trip list. */
  preselected?: boolean
  /** Visitor explicitly asked to KEEP this trip (locked, picked around). */
  keep?: boolean
}

export interface AutoPickConfig {
  partySize: number
  /** Day window, minutes from midnight. */
  dayStartMin: number
  dayEndMin: number
  /** Admin buffer + fixed early-arrival cushion between consecutive stops. */
  bufferMin: number
  /** Hard cap on total scheduled stops. */
  maxStops: number
  /** Optional travel estimate (minutes) between two trips' cities. Added to the
   *  buffer to form the required separation. Default: 0 (buffer-only). */
  travelMinBetween?: (a: AutoPickCandidate, b: AutoPickCandidate) => number
}

export type AutoPickMode = "one" | "day"

export interface AutoPickOptions {
  candidates: AutoPickCandidate[]
  config: AutoPickConfig
  mode: AutoPickMode
  /** When true, IGNORE preselected trips (except `keep`) and build a fresh set.
   *  The client then REPLACES the list with `pickedIds`. */
  replaceList?: boolean
}

export interface AutoPickSkip {
  id: string
  title: string
  reason: string
}

export interface AutoPickResult {
  /** Every trip in the final conflict-free schedule (locked + newly picked),
   *  in start-time order. */
  pickedIds: string[]
  /** Newly picked trips that were NOT already preselected — the ones the client
   *  should ADD to the My Trip list. */
  addedIds: string[]
  /** Preselected trips NOT in the final set — only meaningful when replaceList
   *  is true (the client removes these). */
  removedIds: string[]
  /** Trips considered but not picked, each with a human-readable reason. */
  skipped: AutoPickSkip[]
  /** True when the existing My Trip list itself blocks any new pick, so the AI
   *  should ASK the visitor whether to clear it and start fresh. */
  needsClear: boolean
}

interface Placed {
  cand: AutoPickCandidate
  slot: AutoPickSlot
}

/** Required minute separation between two stops (buffer + travel). */
function separation(cfg: AutoPickConfig, a: AutoPickCandidate, b: AutoPickCandidate): number {
  const travel = cfg.travelMinBetween ? Math.max(0, cfg.travelMinBetween(a, b)) : 0
  return Math.max(0, cfg.bufferMin) + travel
}

/** Does putting `cand` at `slot` conflict (in time, incl. separation) with any
 *  already-placed stop? */
function conflicts(cfg: AutoPickConfig, placed: Placed[], cand: AutoPickCandidate, slot: AutoPickSlot): boolean {
  for (const p of placed) {
    const sep = separation(cfg, cand, p.cand)
    const disjoint = slot.endMin + sep <= p.slot.startMin || p.slot.endMin + sep <= slot.startMin
    if (!disjoint) return true
  }
  return false
}

function fitsParty(cfg: AutoPickConfig, slot: AutoPickSlot): boolean {
  if (slot.spacesRemaining == null) return true
  return slot.spacesRemaining >= cfg.partySize
}

function withinWindow(cfg: AutoPickConfig, slot: AutoPickSlot): boolean {
  return slot.startMin >= cfg.dayStartMin && slot.endMin <= cfg.dayEndMin
}

/** Pick the earliest (by start time) slot for `cand` that fits the party, the
 *  day window, and doesn't conflict with `placed`. Returns null if none. */
function earliestFreeSlot(
  cfg: AutoPickConfig,
  placed: Placed[],
  cand: AutoPickCandidate,
): AutoPickSlot | null {
  const usable = cand.slots
    .filter((s) => fitsParty(cfg, s) && withinWindow(cfg, s))
    .sort((a, b) => a.startMin - b.startMin)
  for (const s of usable) {
    if (!conflicts(cfg, placed, cand, s)) return s
  }
  return null
}

/** True when the candidate has at least one slot that, ON ITS OWN, fits the
 *  party and the day window (i.e. it's genuinely bookable today — it would only
 *  fail to be picked because of a CONFLICT with the existing list). */
function hasUsableSlot(cfg: AutoPickConfig, cand: AutoPickCandidate): boolean {
  return cand.slots.some((s) => fitsParty(cfg, s) && withinWindow(cfg, s))
}

/**
 * Deterministically select a conflict-free set of trips.
 *
 * Ordering of placement:
 *   1. `keep` trips (visitor explicitly wants them) — locked FIRST.
 *   2. preselected trips (already in the list) — locked next, unless replaceList.
 *   3. remaining candidates by score (desc), then earlier earliest-slot, then id.
 *
 * `mode: 'one'` places only a SINGLE new candidate (the best non-conflicting).
 * `mode: 'day'` fills the day with as many non-conflicting candidates as fit,
 * up to `maxStops`.
 */
export function autoPickTrips(opts: AutoPickOptions): AutoPickResult {
  const { candidates, config, mode } = opts
  const replaceList = opts.replaceList === true
  const maxStops = Math.max(1, Math.floor(config.maxStops) || 1)

  const skipped: AutoPickSkip[] = []
  const placed: Placed[] = []

  const byId = new Map(candidates.map((c) => [c.id, c]))
  const keepCands = candidates.filter((c) => c.keep)
  // Preselected (excluding keep, which are placed first). Ignored entirely when
  // replaceList is set — the visitor agreed to a fresh list.
  const preselectedCands = replaceList
    ? []
    : candidates.filter((c) => c.preselected && !c.keep)

  // Trips that are NOT locked — the pool we pick fresh from.
  const lockedIds = new Set<string>([...keepCands, ...preselectedCands].map((c) => c.id))
  const poolCands = candidates
    .filter((c) => !lockedIds.has(c.id))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const aEarliest = a.slots.length ? Math.min(...a.slots.map((s) => s.startMin)) : Infinity
      const bEarliest = b.slots.length ? Math.min(...b.slots.map((s) => s.startMin)) : Infinity
      if (aEarliest !== bEarliest) return aEarliest - bEarliest
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  // Count how many preselected couldn't be honored together (the existing list
  // already conflicts with itself) — feeds the needsClear decision.
  let preselectedBlocked = 0

  // 1 + 2) Place locked trips (keep first, then preselected).
  for (const cand of [...keepCands, ...preselectedCands]) {
    if (placed.length >= maxStops) {
      if (cand.keep) skipped.push({ id: cand.id, title: cand.title, reason: "Day is already full — couldn't keep this trip without dropping another." })
      else preselectedBlocked++
      continue
    }
    const slot = earliestFreeSlot(config, placed, cand)
    if (slot) {
      placed.push({ cand, slot })
    } else if (cand.keep) {
      const reason = hasUsableSlot(config, cand)
        ? "Couldn't keep this trip — its only times conflict with the rest of your day."
        : "Couldn't keep this trip — it isn't bookable on this date for your group."
      skipped.push({ id: cand.id, title: cand.title, reason })
    } else {
      // A preselected trip that can't be placed = the existing list conflicts.
      preselectedBlocked++
    }
  }

  const lockedPlacedCount = placed.length

  // 3) Fill from the candidate pool.
  const addedIds: string[] = []
  const wantCount = mode === "one" ? 1 : maxStops
  let conflictBlockedAdds = 0
  for (const cand of poolCands) {
    if (addedIds.length >= wantCount) break
    if (placed.length >= maxStops) break
    const slot = earliestFreeSlot(config, placed, cand)
    if (slot) {
      placed.push({ cand, slot })
      addedIds.push(cand.id)
    } else if (hasUsableSlot(config, cand)) {
      // Bookable on its own but blocked by a time conflict.
      conflictBlockedAdds++
      if (mode === "one") {
        skipped.push({ id: cand.id, title: cand.title, reason: "Conflicts with the times already in your trip list." })
      }
    } else {
      skipped.push({ id: cand.id, title: cand.title, reason: "Not bookable on this date for your group." })
    }
  }

  // Final schedule in start-time order.
  placed.sort((a, b) => a.slot.startMin - b.slot.startMin)
  const pickedIds = placed.map((p) => p.cand.id)
  const pickedSet = new Set(pickedIds)

  // removedIds (replaceList only): preselected trips dropped from the new list.
  const removedIds = replaceList
    ? candidates.filter((c) => c.preselected && !pickedSet.has(c.id)).map((c) => c.id)
    : []

  // needsClear: nothing new could be added AND the existing list is the reason
  // (it occupies the day / conflicts), so the AI should offer to clear it.
  // Only when NOT replacing (in replace mode we already ignored the old list).
  const nothingAdded = addedIds.length === 0
  const listIsBlocking = lockedPlacedCount > 0 || preselectedBlocked > 0
  const aPickWasPossibleButForList = conflictBlockedAdds > 0 || preselectedBlocked > 0
  const needsClear = !replaceList && nothingAdded && listIsBlocking && aPickWasPossibleButForList

  // Dedupe skipped (keep first reason per id) and drop any that got placed.
  const seenSkip = new Set<string>()
  const dedupSkipped = skipped.filter((s) => {
    if (pickedSet.has(s.id)) return false
    if (seenSkip.has(s.id)) return false
    seenSkip.add(s.id)
    return true
  })

  void byId
  return { pickedIds, addedIds, removedIds, skipped: dedupSkipped, needsClear }
}
