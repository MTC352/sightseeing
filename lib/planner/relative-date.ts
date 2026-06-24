/** Deterministically resolve a semantic relative-date TOKEN (the planner model
 *  passes these via updatePreferences.relativeDate) to a YYYY-MM-DD string.
 *
 *  Anchored to the CURRENT day in Luxembourg (via Intl, TZ-safe) so it never
 *  drifts with the visitor's browser timezone, and mirrors the server's
 *  `nextWeekday` logic in app/api/planner/route.ts: weekday tokens resolve to
 *  the NEXT occurrence (today counts if it IS that weekday). This removes the
 *  model from date arithmetic entirely — gpt-4o-mini was mis-computing dates
 *  (e.g. "friday" -> the wrong calendar day). Returns null for an unrecognised
 *  token so callers fall back to startDate / today.
 *
 *  `now` is injectable purely for testing; production callers omit it. */
export const RELATIVE_WEEKDAY_TOKENS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

export function resolveRelativeDate(token: string | null | undefined, now: Date = new Date()): string | null {
  if (typeof token !== "string") return null
  const t = token.trim().toLowerCase()
  if (!t) return null
  // Current calendar date in Luxembourg (YYYY-MM-DD) via Intl, TZ-safe.
  const luxToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now)
  const [yy, mm, dd] = luxToday.split("-").map(Number)
  if (!yy || !mm || !dd) return null
  const base = new Date(Date.UTC(yy, mm - 1, dd))
  const dow = base.getUTCDay() // 0 Sun .. 6 Sat
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  const addDays = (n: number) => new Date(base.getTime() + n * 86400000)
  if (t === "today") return ymd(base)
  if (t === "tomorrow") return ymd(addDays(1))
  if (t in RELATIVE_WEEKDAY_TOKENS) {
    const diff = (RELATIVE_WEEKDAY_TOKENS[t] - dow + 7) % 7 // 0 = today itself
    return ymd(addDays(diff))
  }
  const daysToSat = (6 - dow + 7) % 7 // 0 when today is Saturday
  if (t === "this-weekend") return ymd(dow === 0 ? base : addDays(daysToSat))
  if (t === "next-weekend") return ymd(dow === 0 ? addDays(6) : addDays(daysToSat + 7))
  return null
}
