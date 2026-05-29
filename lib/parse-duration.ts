/**
 * parseHumanDuration — canonical, shared duration string → minutes converter.
 *
 * Handles every format the DB and Palisis emit:
 *   "2 hours"      → 120      "2h 30m"     → 150
 *   "1.5 hours"    → 90       "2.5 hrs"    → 150
 *   "75 minutes"   → 75       "90 min"     → 90
 *   "half-day"     → 240      "full-day"   → 480
 *   "whole day"    → 480      "all-day"    → 480
 *   bare "2"       → 120      bare "90"    → 90
 *   undefined/""   → fallback
 *
 * The bare-number heuristic treats values ≤ 12 as hours, otherwise minutes
 * (mirrors the previous inline convention; explicit unit always wins).
 */
export function parseHumanDuration(
  raw: string | null | undefined,
  fallbackMinutes = 90,
): number {
  if (!raw) return fallbackMinutes
  const s = String(raw).toLowerCase().trim()
  if (!s) return fallbackMinutes

  // Day shorthands — check first so "full-day" isn't picked up by the
  // bare-number fallback path.
  if (/\b(?:full[- ]?day|whole[- ]?day|all[- ]?day)\b/.test(s)) return 480
  if (/\b(?:half[- ]?day)\b/.test(s)) return 240

  let total = 0

  // Hour clause — captures decimals: "2.5 hours", "1.5h", "0.75 hr".
  // Word boundary prevents "minute" from being eaten by the hour pattern.
  const hMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h)\b/)

  // Minute clause — matches "min"/"mins"/"minute"/"minutes" and trailing "m"
  // (e.g. "2h 30m"). Bare "m" elsewhere is ignored (sometimes a typo).
  const mMatch = s.match(/(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|m\b)/)

  if (hMatch) total += Math.round(parseFloat(hMatch[1].replace(",", ".")) * 60)
  if (mMatch) total += Math.round(parseFloat(mMatch[1].replace(",", ".")))

  if (total === 0) {
    // Last resort: a bare number with no unit.
    const plain = s.match(/(\d+(?:[.,]\d+)?)/)
    if (plain) {
      const n = parseFloat(plain[1].replace(",", "."))
      total = n <= 12 ? Math.round(n * 60) : Math.round(n)
    }
  }

  return total > 0 ? total : fallbackMinutes
}
