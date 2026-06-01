/* ─────────────────────────────────────────────────────────────────────────
   Deterministic itinerary scheduler.

   The AI's job (when a key is available) is ONLY to choose WHICH trips to
   include and in WHAT priority order. This module owns all the timing math:
   it locks every stop to a REAL Palisis timeslot, spaces stops by genuine
   travel time + a 5–10 min "arrive early" cushion, inserts a lunch (and
   optionally dinner / coffee) break, and enforces the max-stops cap AFTER
   the duration / time-budget fit has been computed.

   It is fully deterministic and has NO dependency on any AI provider, so the
   planner keeps producing realistic itineraries even when the AI key is
   invalid or absent.
   ───────────────────────────────────────────────────────────────────────── */

export const HARD_MAX_STOPS = 5
const EARLY_ARRIVAL_MIN = 5

// Walk is recommended over driving for hops at or under this distance.
const SHORT_HOP_KM = 1.2

// Pace presets scale the inter-stop buffer and how many stops we aim for.
// Always clamped to the admin max stops. Admin-managed via Trip Planner settings.
const PACE_PRESETS = {
  relaxed: { bufferMult: 1.5, stopDelta: -1 },
  balanced: { bufferMult: 1.0, stopDelta: 0 },
  packed: { bufferMult: 0.6, stopDelta: 0 },
} as const
export type Pace = keyof typeof PACE_PRESETS

export interface SlotInput {
  startTime: string
  endTime: string | null
  totalPrice: string | null
  totalPriceDisplay: string | null
  spacesRemaining: string | null
  componentKey: string
}

export interface TravelLeg {
  driveMin: number | null
  walkMin: number | null
  transitMin: number | null
  distanceKm: number | null
  reason: "ok" | "no_token" | "no_geocode"
  fromLabel: string | null
  toLabel: string | null
}

export interface CandidateTrip {
  id: string
  title: string
  city: string
  category: string
  durationMin: number
  slots: SlotInput[]
  tags: string[]
  blurb: string
  highlights: string[]
  notes: string
  location: string
  departureGeo: string
  endGeo: string
}

export interface SchedulerConfig {
  dayStartTime: string
  dayEndTime: string
  bufferTimeBetweenStops: number
  maxStopsPerDay: number
  defaultActivityDuration: number
  autoInsertMealBreaks: boolean
  mealBreakDuration: number
  lunchBreakTime: string
  dinnerBreakTime: string
  travelMethodLabel: string
  /** Admin-managed pace preset — scales buffer + target stop count (clamped to
   *  maxStopsPerDay). Defaults to "balanced". */
  pace?: Pace
}

export interface MealWindow {
  earliest: string
  latest: string
  durationMinutes: number
}

export interface SchedulerPrefs {
  duration: string
  dayCount: number
  isMultiDay: boolean
  excludeEarlyMorning: boolean
  /** When true, the user explicitly opted OUT of auto meal breaks. Default
   *  false — lunch/dinner are included on full-day plans (skipped after food
   *  trips) unless the user asks to exclude them. */
  excludeMeals: boolean
  interests: string[]
  userMealBreaks: Map<"lunch" | "dinner" | "coffee", MealWindow>
  /** OPT-IN accessibility: when true, physically demanding / non-step-free trips
   *  are hard-dropped with a clear reason. Default false. */
  excludeInaccessible?: boolean
  /** Total party size — used to drop slots that can't seat the whole group. */
  partySize?: number
}

export interface BreakAfter {
  type: "food" | "coffee" | "none"
  label: string
  location: string
  durationMinutes: number
}

export interface ScheduledStep {
  tripId: string
  tripTitle: string
  title: string
  time: string
  endTime: string
  priceFrom: string | null
  spacesRemaining: string | null
  durationMinutes: number
  travelMinutes: number
  travelToNext: string | null
  travelLeg: TravelLeg | null
  breakAfter: BreakAfter
  tripHighlights: string[]
  tripNotes: string
  tripCity: string
  tripLocation: string
  /** Real geocoded coordinates of this stop's departure point (parsed from
   *  the trip's departure_geocode, fallback end_geocode). Drives accurate map
   *  marker placement so identical locations land on the same spot. Null when
   *  the catalogue record has no coordinates. */
  lat: number | null
  lng: number | null
  day: number
  /** Deterministic weather advisory for outdoor trips on a rainy day. */
  weatherFlag: string | null
}

export interface DroppedTrip {
  tripId: string
  title: string
  reason: string
}

export type ComputeLeg = (
  originGeo: string,
  destGeo: string,
  fromLabel: string | null,
  toLabel: string | null,
) => Promise<TravelLeg>

/* ── Time helpers ──────────────────────────────────────────────────────── */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return -1
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}
export function toHHMM(total: number): string {
  const t = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)))
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

/** Parse a stored "lat,lng" geocode string into numbers. Returns null on any
 *  malformed/empty value so the UI can fall back gracefully. */
export function parseGeo(s: string): { lat: number; lng: number } | null {
  if (!s) return null
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s)
  if (!m) return null
  const lat = parseFloat(m[1]); const lng = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/* ── Classification helpers ────────────────────────────────────────────── */
const FOOD_RE = /\b(food|lunch|dinner|brunch|breakfast|wine|tasting|culinary|gastronom|restaurant|beer|cheese|chocolate|tapas|dining)\b/i
const EVENING_RE = /\b(nightlife|night|bar crawl|pub crawl|pub|sunset|evening|by night|after dark|cocktail)\b/i
const MORNING_RE = /\b(sunrise|early morning|dawn|breakfast)\b/i
// Physically demanding / not step-free. Used ONLY when the visitor explicitly
// opts into accessible planning (hard drop with a clear reason).
const INACCESSIBLE_RE = /\b(hik(e|ing)|trek|climb(ing)?|steep|strenuous|rugged|mountain|kayak|canoe|cav(e|ing)|cycl(e|ing)|bike|bicycle|e-bike|rappel|via ferrata|scramble|uneven terrain|stairs only|many steps)\b/i
// Weather-exposed / outdoor trips. Used to flag rain risk deterministically.
const OUTDOOR_RE = /\b(outdoor|open-air|hik(e|ing)|walking tour|park|garden|vineyard|cruise|boat|river|kayak|canoe|bike|bicycle|cycl|segway|terrace|picnic|grounds|nature|forest|trail)\b/i

function haystack(t: CandidateTrip): string {
  return `${t.title} ${t.category} ${t.tags.join(" ")} ${t.blurb}`.toLowerCase()
}
export function isFoodTrip(t: CandidateTrip): boolean {
  return FOOD_RE.test(haystack(t))
}
export function isInaccessibleTrip(t: CandidateTrip): boolean {
  return INACCESSIBLE_RE.test(haystack(t))
}
export function isOutdoorTrip(t: CandidateTrip): boolean {
  return OUTDOOR_RE.test(haystack(t))
}

/** Build the human-readable travel summary for a leg. Shows BOTH drive and
 *  walk when available and recommends the faster option (walk for short hops),
 *  and clearly labels a fallback estimate vs. a live Mapbox/Google figure. */
export function describeTravel(
  leg: TravelLeg | null,
  fallbackMin: number,
  methodLabel: string,
): string | null {
  if (leg && leg.reason === "ok" && (leg.driveMin !== null || leg.walkMin !== null)) {
    const parts: string[] = []
    const drive = leg.driveMin
    const walk = leg.walkMin
    let rec: "walk" | "drive" | null = null
    const shortHop = leg.distanceKm !== null && leg.distanceKm <= SHORT_HOP_KM
    if (walk !== null && drive !== null) rec = shortHop || walk <= drive ? "walk" : "drive"
    else if (walk !== null) rec = "walk"
    else if (drive !== null) rec = "drive"
    if (drive !== null) parts.push(`${drive} min drive`)
    if (walk !== null) parts.push(`${walk} min walk`)
    let s = parts.join(" · ")
    if (rec) s += ` (${rec} recommended)`
    if (leg.distanceKm !== null) s += ` · ${leg.distanceKm} km`
    return s
  }
  if (fallbackMin > 0) return `~${fallbackMin} min by ${methodLabel} (estimated)`
  return null
}
export function timeBand(t: CandidateTrip): "morning" | "daytime" | "evening" {
  const h = haystack(t)
  if (EVENING_RE.test(h)) return "evening"
  if (MORNING_RE.test(h)) return "morning"
  return "daytime"
}

/** Interest / tag match score — used by the deterministic ordering fallback. */
export function scoreCandidate(t: CandidateTrip, interests: string[]): number {
  if (!interests.length) return 0
  const h = haystack(t)
  let s = 0
  for (const i of interests) {
    const needle = i.toLowerCase().trim()
    if (needle && h.includes(needle)) s += 1
  }
  return s
}

/** Deterministic ordering used when AI selection is unavailable: by natural
 *  time-of-day band (morning → daytime → evening), then interest match,
 *  then shorter trips first so more of them fit the window. */
export function deterministicOrder(trips: CandidateTrip[], interests: string[]): CandidateTrip[] {
  const bandRank = { morning: 0, daytime: 1, evening: 2 } as const
  return [...trips].sort((a, b) => {
    const ba = bandRank[timeBand(a)] - bandRank[timeBand(b)]
    if (ba !== 0) return ba
    const sc = scoreCandidate(b, interests) - scoreCandidate(a, interests)
    if (sc !== 0) return sc
    if (a.durationMin !== b.durationMin) return a.durationMin - b.durationMin
    return a.title.localeCompare(b.title)
  })
}

/* ── Core scheduler ────────────────────────────────────────────────────── */
interface Meal {
  kind: "lunch" | "dinner"
  earliest: number
  latest: number
  dur: number
}

export async function buildSchedule(opts: {
  candidates: CandidateTrip[] // already in priority order
  config: SchedulerConfig
  prefs: SchedulerPrefs
  visitDate: string
  addDays: (ymd: string, n: number) => string
  computeLeg: ComputeLeg
  cityTravelMin: (fromCity: string, toCity: string) => number
  /** Deterministic weather signal for the visit date (single-day plans). */
  weather?: { rainyDay?: boolean } | null
}): Promise<{ steps: ScheduledStep[]; dropped: DroppedTrip[]; notes: string[] }> {
  const { candidates, config, prefs, visitDate, addDays, computeLeg, cityTravelMin, weather } = opts

  const maxStops = Math.max(1, Math.min(HARD_MAX_STOPS, Math.floor(config.maxStopsPerDay) || HARD_MAX_STOPS))
  // Pace scales the buffer and the number of stops we aim for, always clamped
  // to the admin max. relaxed = roomier + one fewer stop; packed = tighter.
  const pace: Pace = config.pace && config.pace in PACE_PRESETS ? config.pace : "balanced"
  const pacePreset = PACE_PRESETS[pace]
  const targetStops = Math.max(1, Math.min(maxStops, maxStops + pacePreset.stopDelta))
  const rainyDay = weather?.rainyDay === true
  const partySize = Math.max(1, Math.floor(prefs.partySize ?? 1))
  const fitsParty = (s: SlotInput): boolean => {
    const r = (s.spacesRemaining ?? "").toString().trim().toUpperCase()
    if (!r || r === "UNLIMITED") return true
    const n = parseInt(r, 10)
    return Number.isNaN(n) ? true : n >= partySize
  }

  // OPT-IN accessibility: hard-drop physically demanding trips up front with a
  // clear reason, leaving the rest for normal scheduling.
  const accessibilityDrops: DroppedTrip[] = []
  const workCandidates = prefs.excludeInaccessible
    ? candidates.filter((t) => {
        if (isInaccessibleTrip(t)) {
          accessibilityDrops.push({
            tripId: t.id,
            title: t.title,
            reason: "Removed — this trip isn't step-free/low-mobility friendly, per your accessibility request.",
          })
          return false
        }
        return true
      })
    : candidates
  // Inter-stop gap = travel + admin-configured buffer + a fixed 5–10 min
  // early arrival. These are SEPARATE components: the early arrival is a fixed
  // courtesy margin (independent of the admin buffer) so visitors always reach
  // the meeting point a few minutes ahead, while `buffer` is the admin's
  // configurable breathing room between stops.
  const earlyArrival = EARLY_ARRIVAL_MIN
  const buffer = Math.round(Math.max(0, Math.floor(config.bufferTimeBetweenStops) || 0) * pacePreset.bufferMult)
  const dayStart = toMin(config.dayStartTime) >= 0 ? toMin(config.dayStartTime) : 9 * 60
  const dayEnd = toMin(config.dayEndTime) >= 0 ? toMin(config.dayEndTime) : 21 * 60
  const dayCount = prefs.isMultiDay ? Math.max(1, prefs.dayCount) : 1

  // Single-day time budget from the duration preference.
  const fullWindow = Math.max(60, dayEnd - dayStart)
  const budgetMin = prefs.isMultiDay
    ? fullWindow
    : prefs.duration === "1-2h"
      ? 120
      : prefs.duration === "half-day"
        ? 300
        : fullWindow

  const earlyCutoff = prefs.excludeEarlyMorning ? 10 * 60 : -1

  // Meals default ON for full-day/multi-day plans (and are skipped after a food
  // trip in the loop below). The user can opt OUT via `excludeMeals`; an
  // explicit user-supplied meal window still wins over the admin default.
  const wantMeals = !prefs.excludeMeals && (config.autoInsertMealBreaks || prefs.userMealBreaks.size > 0)
  const mealsTemplate: Meal[] = []
  if (wantMeals && (prefs.duration === "full-day" || prefs.isMultiDay)) {
    const lu = prefs.userMealBreaks.get("lunch")
    mealsTemplate.push({
      kind: "lunch",
      earliest: toMin(lu?.earliest ?? "12:00"),
      latest: toMin(lu?.latest ?? "14:00"),
      dur: lu?.durationMinutes ?? config.mealBreakDuration,
    })
    const di = prefs.userMealBreaks.get("dinner")
    mealsTemplate.push({
      kind: "dinner",
      earliest: toMin(di?.earliest ?? "18:30"),
      latest: toMin(di?.latest ?? "20:30"),
      dur: di?.durationMinutes ?? config.mealBreakDuration + 15,
    })
  }
  // Auto coffee breaks are part of the "meal breaks" feature — when the user
  // opts out of breaks (excludeMeals) we must NOT fill the freed-up gap with a
  // coffee break either, or "Skip lunch break" would look ignored.
  const coffeeWanted = !prefs.excludeMeals && (config.autoInsertMealBreaks || prefs.userMealBreaks.has("coffee"))
  const coffeeDur = prefs.userMealBreaks.get("coffee")?.durationMinutes ?? 20

  const used = new Set<string>()
  const allSteps: ScheduledStep[] = []
  const notes: string[] = []

  for (let day = 0; day < dayCount; day++) {
    if (allSteps.length >= targetStops) break
    const dateForDay = addDays(visitDate, day)
    const daySteps: ScheduledStep[] = []
    const meals: Meal[] = mealsTemplate.map((m) => ({ ...m }))

    let prev: {
      step: ScheduledStep
      endMin: number
      city: string
      endGeo: string
      location: string
      isFood: boolean
    } | null = null
    let firstStartMin = -1

    for (const trip of workCandidates) {
      if (used.has(trip.id)) continue
      if (allSteps.length + daySteps.length >= targetStops) break

      const dur = trip.durationMin
      const effectiveEnd = prefs.isMultiDay
        ? dayEnd
        : Math.min(dayEnd, (firstStartMin >= 0 ? firstStartMin : dayStart) + budgetMin)

      // Travel from the previous stop.
      let travelMin = 0
      let leg: TravelLeg | null = null
      if (prev) {
        leg = await computeLeg(
          prev.endGeo,
          trip.departureGeo,
          prev.location || prev.city || null,
          trip.location || trip.city || null,
        )
        travelMin = leg.driveMin ?? cityTravelMin(prev.city, trip.city)
      }
      const earliestStart = prev ? prev.endMin + travelMin + buffer + earlyArrival : dayStart

      // Build the allowed-slot set for this trip on this day.
      const band = timeBand(trip)
      const inWindow = (s: SlotInput) => {
        const st = toMin(s.startTime)
        if (st < 0) return false
        if (st < earliestStart) return false
        if (st + dur > effectiveEnd) return false
        if (earlyCutoff >= 0 && st < earlyCutoff) return false
        return true
      }
      const bandOk = (s: SlotInput) => {
        const st = toMin(s.startTime)
        if (band === "evening") return st >= 17 * 60
        if (band === "morning") return st < 11 * 60
        return true
      }
      let pool = trip.slots.filter(inWindow)
      if (partySize > 1) {
        const partyPool = pool.filter(fitsParty)
        if (pool.length > 0 && partyPool.length === 0) {
          notes.push(`"${trip.title}" had no slots with space for your group of ${partySize} on ${dateForDay} — try a smaller group or another date.`)
        }
        pool = partyPool
      }
      const bandPool = pool.filter(bandOk)
      if (bandPool.length > 0) {
        pool = bandPool
      } else if (pool.length > 0 && band !== "daytime") {
        notes.push(`"${trip.title}" only has slots outside its usual ${band} window on ${dateForDay} — kept anyway.`)
      }
      if (pool.length === 0) continue // try this trip on a later day

      pool = [...pool].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))

      // Should we reserve a meal in the gap BEFORE this trip?
      let reservedMeal: Meal | null = null
      if (prev && !prev.isFood) {
        const dueMeal = meals.find((m) => prev!.endMin >= m.earliest - 15 && prev!.endMin <= m.latest)
        if (dueMeal) {
          const neededStart = prev.endMin + travelMin + buffer + earlyArrival + dueMeal.dur
          const withMeal = pool.filter((s) => toMin(s.startTime) >= neededStart)
          if (withMeal.length > 0) {
            pool = withMeal
            reservedMeal = dueMeal
          }
        }
      }

      const chosen = pool[0]
      const startMin = toMin(chosen.startTime)
      const slotEndMin = chosen.endTime ? toMin(chosen.endTime) : -1
      const needsDerivedEnd = !chosen.endTime || slotEndMin <= startMin || slotEndMin - startMin < dur * 0.5
      const endMin = needsDerivedEnd ? startMin + dur : slotEndMin
      const realDur = needsDerivedEnd ? dur : slotEndMin - startMin

      const stepGeo = parseGeo(trip.departureGeo) ?? parseGeo(trip.endGeo)
      const step: ScheduledStep = {
        tripId: trip.id,
        tripTitle: trip.title,
        title: trip.title,
        time: chosen.startTime,
        endTime: toHHMM(endMin),
        priceFrom: chosen.totalPriceDisplay ?? chosen.totalPrice ?? null,
        spacesRemaining: chosen.spacesRemaining,
        durationMinutes: realDur,
        travelMinutes: 0,
        travelToNext: null,
        travelLeg: null,
        breakAfter: { type: "none", label: "", location: "", durationMinutes: 0 },
        tripHighlights: trip.highlights,
        tripNotes: trip.notes,
        tripCity: trip.city,
        tripLocation: trip.location,
        lat: stepGeo?.lat ?? null,
        lng: stepGeo?.lng ?? null,
        day,
        weatherFlag: null,
      }

      // Multi-day: prefix the first step of each day with a Markdown heading.
      if (prefs.isMultiDay && daySteps.length === 0) {
        step.title = `Day ${day + 1} — ${dateForDay}\n\n${trip.title}`
      }

      // Deterministic weather advisory — flag outdoor stops on a rainy day.
      if (rainyDay && isOutdoorTrip(trip)) {
        step.weatherFlag = "☔ Outdoor — rain expected; bring a layer or check the forecast before you go."
      }

      // Resolve travel + break on the PREVIOUS step now that this one is fixed.
      if (prev) {
        prev.step.travelLeg = leg
        prev.step.travelMinutes = travelMin
        prev.step.travelToNext = describeTravel(leg, travelMin, config.travelMethodLabel)

        const gap = startMin - prev.endMin
        const freeAfterTravel = gap - travelMin - buffer - earlyArrival
        if (reservedMeal) {
          prev.step.breakAfter = {
            type: "food",
            label: reservedMeal.kind === "lunch" ? "Lunch break" : "Dinner break",
            location: prev.city || trip.city || "Luxembourg",
            durationMinutes: Math.min(reservedMeal.dur, Math.max(15, freeAfterTravel)),
          }
          meals.splice(meals.indexOf(reservedMeal), 1)
        } else if (coffeeWanted && freeAfterTravel >= 60) {
          prev.step.breakAfter = {
            type: "coffee",
            label: "Coffee break",
            location: prev.city || trip.city || "Luxembourg",
            durationMinutes: Math.min(coffeeDur, freeAfterTravel - 5),
          }
        }
      }

      used.add(trip.id)
      daySteps.push(step)
      if (firstStartMin < 0) firstStartMin = startMin
      const tripIsFood = isFoodTrip(trip)
      // A food trip that lands inside a meal window IS that meal.
      if (tripIsFood) {
        for (let mi = meals.length - 1; mi >= 0; mi--) {
          if (startMin <= meals[mi].latest && endMin >= meals[mi].earliest) meals.splice(mi, 1)
        }
      }
      prev = {
        step,
        endMin,
        city: trip.city,
        endGeo: trip.endGeo,
        location: trip.location,
        isFood: tripIsFood,
      }
    }

    if (daySteps.length > 0 && (prefs.duration === "full-day" || prefs.isMultiDay)) {
      const lunchLeft = meals.some((m) => m.kind === "lunch")
      if (lunchLeft && daySteps.length >= 1) {
        notes.push(`Couldn't fit a clean 12:00–14:00 lunch break on ${dateForDay} — the live slots are packed. Consider a quick bite between stops.`)
      }
    }

    allSteps.push(...daySteps)
  }

  const dropped: DroppedTrip[] = [...accessibilityDrops]
  for (const trip of workCandidates) {
    if (used.has(trip.id)) continue
    dropped.push({
      tripId: trip.id,
      title: trip.title,
      reason: allSteps.length >= targetStops
        ? `Kept to ${targetStops} stops for a ${pace} pace — extend your trip length to include it.`
        : "No slot fit your selected time window — try a longer day or another date.",
    })
  }

  return { steps: allSteps, dropped, notes }
}
