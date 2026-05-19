/**
 * Parse a free-text duration string (as imported from Palisis) into a
 * { min, max } pair of hours. Use `min` when deciding "does ANY option fit
 * within the user's max-duration cap" (multi-option trips like
 * "Full Day:7H / Half Day:4H" should match a 4h cap), and `max` for
 * upper-bound questions.
 *
 * Handles:
 *   "3 hours"                                 → { min: 3, max: 3 }
 *   "1 - 2 hours" / "1-2 hours" / "1 to 2 h"  → { min: 1, max: 2 }
 *   "Full Day:7 Hours\nHalf Day:4 Hours"      → { min: 4, max: 7 }
 *   "Full Day"                                → { min: 8, max: 8 }
 *   "Half Day"                                → { min: 4, max: 4 }
 *   "75 minutes" / "90 min"                   → { min: 1.25, max: 1.25 }
 *   "check timetable" / "TBC" / ""            → null (unknown)
 */

const MIN_PER_HOUR = 60
const FULL_DAY_HOURS = 8
const HALF_DAY_HOURS = 4

export interface DurationRange {
  min: number
  max: number
}

export function parseDurationRange(raw: string | null | undefined): DurationRange | null {
  if (!raw) return null
  const text = String(raw).toLowerCase().trim()
  if (!text) return null
  if (/(tbc|check timetable|n\/?a|tba|unknown)/.test(text)) return null

  const candidates: number[] = []

  // "<n> - <n> (hours|hrs|h)" → both ends become candidates so min/max are
  // honored (a 1-2 hour trip should be visible at cap=2 but hidden at cap<1).
  const hourRangeRe = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g
  const consumedSpans: Array<[number, number]> = []
  for (const m of text.matchAll(hourRangeRe)) {
    candidates.push(parseFloat(m[1]), parseFloat(m[2]))
    if (m.index != null) consumedSpans.push([m.index, m.index + m[0].length])
  }
  // Single hour mentions, but skip those already consumed by a range match.
  const singleHourRe = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g
  for (const m of text.matchAll(singleHourRe)) {
    if (m.index != null && consumedSpans.some(([s, e]) => m.index! >= s && m.index! < e)) continue
    candidates.push(parseFloat(m[1]))
  }
  const minuteRe = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/g
  for (const m of text.matchAll(minuteRe)) {
    candidates.push(parseFloat(m[1]) / MIN_PER_HOUR)
  }

  // Day labels (only if no explicit hours given alongside the label)
  if (/full\s*day/.test(text) && !/full\s*day\s*[:\-]?\s*\d/.test(text)) {
    candidates.push(FULL_DAY_HOURS)
  }
  if (/half\s*day/.test(text) && !/half\s*day\s*[:\-]?\s*\d/.test(text)) {
    candidates.push(HALF_DAY_HOURS)
  }

  if (candidates.length === 0) return null
  return { min: Math.min(...candidates), max: Math.max(...candidates) }
}

/** Convenience: shortest option (best for "does ANY option fit the cap"). */
export function parseDurationHoursMin(raw: string | null | undefined): number | null {
  return parseDurationRange(raw)?.min ?? null
}

/** Convenience: longest option (kept for callers that want an upper bound). */
export function parseDurationHours(raw: string | null | undefined): number | null {
  return parseDurationRange(raw)?.max ?? null
}
