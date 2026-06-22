/**
 * Pure trip-matching helpers shared by the planner chat tool loop
 * (addToCart / removeFromCart in app/planner/page.tsx).
 *
 * Context (see memory: planner-two-stores): the chat must NEVER claim it saved
 * or removed a trip it couldn't actually match — the original bug was the chat
 * reporting "Saved X" while the My Trip list stayed blank because the model
 * passed an id/title that didn't line up with the catalog. These helpers
 * resolve a trip ROBUSTLY (id first, then a normalised title, substring either
 * direction) so the tool loop's success/failure message is always honest.
 *
 * Kept pure (no React, no refs) so the matching rules are unit-testable and
 * identical across add (catalog pools) and remove (the live trip list).
 */
export interface MatchableTrip {
  id: string
  title: string
}

/** Normalise a title for comparison: trim, lowercase, strip curly/straight
 *  apostrophes, collapse whitespace. */
export function normalizeTitle(s: string): string {
  return s.trim().toLowerCase().replace(/['’‘]/g, "").replace(/\s+/g, " ")
}

/**
 * Find a trip by id across one or more pools. The model sometimes passes a raw
 * Palisis id ("5") instead of the internal "tcms_5", so an un-prefixed id is
 * also tried in the prefixed form before giving up.
 */
export function matchById<T extends MatchableTrip>(
  pools: T[][],
  id: string | undefined | null,
): T | undefined {
  if (!id) return undefined
  for (const pool of pools) {
    const hit =
      pool.find((t) => t.id === id) ??
      (id.startsWith("tcms_") ? undefined : pool.find((t) => t.id === `tcms_${id}`))
    if (hit) return hit
  }
  return undefined
}

/**
 * Find a trip by normalised title across one or more pools: exact match first,
 * then a substring match in EITHER direction so "the boat cruise" resolves to
 * "Boat Cruise on the Moselle". A blank/whitespace-only title never matches
 * (guards against an empty normalised string substring-matching the first row).
 */
export function matchByTitle<T extends MatchableTrip>(
  pools: T[][],
  title: string | undefined | null,
): T | undefined {
  if (!title) return undefined
  const n = normalizeTitle(title)
  if (!n) return undefined
  for (const pool of pools) {
    const hit =
      pool.find((t) => normalizeTitle(t.title) === n) ??
      pool.find((t) => {
        const tn = normalizeTitle(t.title)
        return tn.includes(n) || n.includes(tn)
      })
    if (hit) return hit
  }
  return undefined
}

/** Resolve a trip from id (preferred) then title across the given pools. */
export function matchTrip<T extends MatchableTrip>(
  pools: T[][],
  opts: { tripId?: string | null; tripTitle?: string | null },
): T | undefined {
  return matchById(pools, opts.tripId) ?? matchByTitle(pools, opts.tripTitle)
}

/**
 * Pure decision for the planner cart tool loop (addToCart / removeFromCart /
 * clearCart). Returns the matched trip (if any), whether the list should change,
 * and the EXACT user-facing message the chat relays back to the model.
 *
 * Keeping the success/failure message here (not inline in onToolCall) makes the
 * "be honest about what actually changed" contract unit-testable: the chat must
 * never say "Saved X" / "Removed X" unless a trip truly matched, and "Cleared N"
 * must report the real count. The caller performs the side effect (addItem /
 * removeItem / clearList) based on `changed` + `trip`.
 */
export type CartToolAction<T extends MatchableTrip> =
  | { kind: "add"; changed: boolean; trip?: T; message: string }
  | { kind: "remove"; changed: boolean; trip?: T; message: string }
  | { kind: "clear"; changed: boolean; count: number; message: string }

export function resolveCartToolAction<T extends MatchableTrip>(
  toolName: string,
  input: { tripId?: string | null; tripTitle?: string | null },
  ctx: { catalog: T[][]; list: T[] },
): CartToolAction<T> | null {
  const { tripId, tripTitle } = input
  const label = tripTitle || tripId || "that trip"

  if (toolName === "addToCart") {
    // Match against the catalog pools — we can only save a known trip.
    const trip = matchTrip(ctx.catalog, { tripId, tripTitle })
    return trip
      ? { kind: "add", changed: true, trip, message: `Saved “${trip.title}” to your trip list` }
      : {
          kind: "add",
          changed: false,
          message: `Could not add “${label}” — I couldn't match it to a trip in the catalog. Search for it first, then I'll save it.`,
        }
  }

  if (toolName === "removeFromCart") {
    // Match against the LIVE list — we can only remove what's actually in it.
    const trip = matchTrip([ctx.list], { tripId, tripTitle })
    return trip
      ? { kind: "remove", changed: true, trip, message: `Removed “${trip.title}” from the trip list` }
      : {
          kind: "remove",
          changed: false,
          message: `“${label}” isn't in the trip list, so nothing was removed.`,
        }
  }

  if (toolName === "clearCart") {
    const count = ctx.list.length
    return count > 0
      ? {
          kind: "clear",
          changed: true,
          count,
          message: `Cleared all ${count} trip${count === 1 ? "" : "s"} from the trip list`,
        }
      : {
          kind: "clear",
          changed: false,
          count: 0,
          message: `The trip list is already empty — nothing to clear.`,
        }
  }

  return null
}
