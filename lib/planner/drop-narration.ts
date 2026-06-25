/* ─── Honest drop-reason narration for the planner chat ───────────────────
   When the itinerary builder can't place every requested trip, the chat posts
   a "Heads up…" follow-up. That message MUST mirror the canvas Smart Itinerary
   card: a trip dropped because it simply doesn't run on the chosen date is a
   DIFFERENT thing from a trip that IS bookable that day but couldn't fit
   alongside the other stops — and a "couldn't fit" trip must NEVER be described
   as having no availability / no slots.

   The /api/itinerary route returns each dropped trip with one of:
     • a MACHINE CODE  — NO_SLOTS | NO_PALISIS_LINK | TOURCMS_ERROR |
                         DOES_NOT_FIT_DURATION  (from the route's availability +
                         duration prefilter)
     • a HUMAN-READABLE scheduler sentence (lowercase) — these are already
       honest and correct (party capacity, stop cap, slot conflict, full-day
       overflow, time-window) and are surfaced VERBATIM, exactly like the canvas.

   This module is PURE (no React / DOM) so it is unit-testable. */

export interface DroppedTripLike {
  title: string
  reason: string
  suggestedDates?: string[]
}

export type DropCategory =
  | "unavailable" // genuinely doesn't run on the chosen date
  | "unconfirmed" // live availability call failed — couldn't confirm
  | "duration" // doesn't fit the chosen day length / time window
  | "capacity" // not enough seats left for the group
  | "stopcap" // left off to keep the day to N stops
  | "fit" // bookable that day but couldn't fit alongside the other stops

/** Classify a single dropped-trip reason into a narration bucket. */
export function classifyDropReason(reason: string): DropCategory {
  const r = (reason ?? "").trim()
  // Machine codes emitted by the /api/itinerary availability + duration prefilter.
  switch (r) {
    case "NO_SLOTS":
    case "NO_PALISIS_LINK":
      return "unavailable"
    case "TOURCMS_ERROR":
      return "unconfirmed"
    case "DOES_NOT_FIT_DURATION":
      return "duration"
  }
  // Human-readable scheduler sentences (always contain lowercase letters).
  // Every scheduler drop is a SAME-DAY fit conflict — the trip is bookable on
  // the date, it just couldn't be placed — so never map these to "unavailable".
  const low = r.toLowerCase()
  if (low.includes("not enough seats")) return "capacity"
  if (low.includes("kept to") && low.includes("stop")) return "stopcap"
  if (low.includes("time window")) return "duration"
  return "fit"
}

/** Join a list of bold-quoted titles with commas + "and", capped at `max`. */
function joinTitles(items: DroppedTripLike[], max = 3): string {
  const shown = items.slice(0, max).map((u) => `**"${u.title}"**`)
  const extra = items.length > max ? ` (+${items.length - max} more)` : ""
  if (shown.length <= 1) return `${shown.join("")}${extra}`
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}${extra}`
  return `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1]}${extra}`
}

export interface AltDate {
  date: string
  tripCount: number
}

export interface PartialBuildMessageArgs {
  dropped: DroppedTripLike[]
  /** Pretty, already-formatted date label (e.g. "Saturday, June 27"). */
  dateLabel: string
  /** Number of stops actually placed on the canvas. */
  stops: number
  alternativeDates?: AltDate[]
  /** Pretty-formatter for YMD alt-date strings (kept out so this stays pure). */
  formatDate?: (ymd: string) => string
}

/**
 * Build the post-build "Heads up…" chat message that honestly narrates WHY each
 * trip was dropped, bucketed by reason so a "couldn't fit" trip is never lumped
 * in with "no availability". Returns "" when nothing was dropped.
 */
export function buildPartialBuildMessage(args: PartialBuildMessageArgs): string {
  const dropped = args.dropped ?? []
  if (dropped.length === 0) return ""
  const { dateLabel, stops } = args
  const fmt = args.formatDate ?? ((d: string) => d)

  const buckets: Record<DropCategory, DroppedTripLike[]> = {
    unavailable: [],
    unconfirmed: [],
    duration: [],
    capacity: [],
    stopcap: [],
    fit: [],
  }
  for (const d of dropped) buckets[classifyDropReason(d.reason)].push(d)

  const lines: string[] = []
  const total = dropped.length
  lines.push(
    `Heads up — the Trip Canvas shows the **${stops} stop${stops === 1 ? "" : "s"}** that fit your day. ` +
      `${total === 1 ? "One trip" : `${total} trips`} couldn't make it:`,
  )

  if (buckets.unavailable.length) {
    const arr = buckets.unavailable
    const verb = arr.length === 1 ? "doesn't" : "don't"
    lines.push(`• ${joinTitles(arr)} ${verb} run on **${dateLabel}** — try another date.`)
  }
  if (buckets.unconfirmed.length) {
    const arr = buckets.unconfirmed
    const verb = arr.length === 1 ? "couldn't" : "couldn't"
    lines.push(
      `• ${joinTitles(arr)} ${verb} be confirmed live just now — give it another try in a moment.`,
    )
  }
  if (buckets.capacity.length) {
    const arr = buckets.capacity
    const verb = arr.length === 1 ? "doesn't" : "don't"
    lines.push(
      `• ${joinTitles(arr)} ${verb} have enough seats left for your group on **${dateLabel}** — try a smaller group or another date.`,
    )
  }
  if (buckets.stopcap.length) {
    const arr = buckets.stopcap
    const verb = arr.length === 1 ? "was" : "were"
    lines.push(
      `• ${joinTitles(arr)} ${verb} left off to keep your day to a comfortable number of stops — extend your trip length to include ${arr.length === 1 ? "it" : "them"}.`,
    )
  }
  if (buckets.duration.length) {
    const arr = buckets.duration
    const verb = arr.length === 1 ? "doesn't" : "don't"
    lines.push(
      `• ${joinTitles(arr)} ${verb} fit your current day length — choose a longer day or drop a stop.`,
    )
  }
  if (buckets.fit.length) {
    const arr = buckets.fit
    const verb = arr.length === 1 ? "is" : "are"
    lines.push(
      `• ${joinTitles(arr)} ${verb} bookable on **${dateLabel}** but couldn't fit alongside your other stops — give ${arr.length === 1 ? "it its" : "them their"} own day or drop a stop to make room.`,
    )
  }

  // Alternative dates are ONLY meaningful when at least one trip genuinely has
  // no availability on the chosen date — a fit/capacity/cap drop is bookable
  // that day, so "rebuild for another date" would be misleading there.
  const alt = args.alternativeDates ?? []
  if (buckets.unavailable.length > 0 && alt.length > 0) {
    const top = alt
      .slice(0, 3)
      .map((a) => `**${fmt(a.date)}** (${a.tripCount} of your trips open)`)
      .join(", ")
    lines.push(`**Best alternative dates:** ${top}. Want me to rebuild for one of these?`)
  }

  return lines.join("\n\n")
}
