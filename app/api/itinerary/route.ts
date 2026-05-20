import { generateText, Output } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { dbGetSettings, dbGetTrip } from "@/lib/db/queries"
import { query } from "@/lib/db"
import {
  getTourCMSConfig,
  showTourDatesAndDeals,
  type DepartureDate,
} from "@/lib/tourcms"

/* ─────────────────────────────────────────────────────────────────────────
   Itinerary API — LIVE DATA ONLY.

   The /planner UI cart calls this endpoint with the saved trips and the
   user-selected visit date. We:

     1. Resolve each cart trip's Palisis tour_id from our DB.
     2. Call TourCMS `datesndeals/search.xml` IN PARALLEL for every trip,
        asking for the full window [visitDate … visitDate + SCAN_DAYS].
        This is the SAME "dates and deals" API that the public Palisis
        booking widget on the trip detail page uses to list departure
        dates and times. One call per trip covers BOTH the chosen date's
        timeslots AND the alternative-date scan — much cheaper than
        21 × checkavail calls and, critically, returns inventory even
        when no rate/quantity has been selected yet.
     3. Feed the AI a per-trip menu of real timeslots and require it to
        place each step at one of those exact start times.
     4. Return the final itinerary plus an `unavailableTrips` list with
        suggestedDates so the UI can show "X is available on these dates
        instead".

   We DO NOT fabricate timeslots, use heuristic clock math, or fall back
   to "around 09:00" defaults. If TourCMS is not configured we refuse
   rather than mislead.
   ───────────────────────────────────────────────────────────────────── */

const itineraryStepSchema = z.object({
  tripId: z.string(),
  tripTitle: z.string(),
  /** MUST match an available timeslot's startTime for this trip (HH:MM) */
  time: z.string(),
  /** End time copied through from the chosen Palisis timeslot (HH:MM) */
  endTime: z.string().nullable(),
  /** Total price for that slot, copied through from Palisis */
  priceFrom: z.string().nullable(),
  /** Spaces remaining ("UNLIMITED" allowed) */
  spacesRemaining: z.string().nullable(),
  durationMinutes: z.number(),
  travelToNext: z.string().nullable(),
  breakAfter: z.object({
    type: z.enum(["food", "coffee", "none"]),
    label: z.string(),
    location: z.string(),
    durationMinutes: z.number(),
  }),
})

const itinerarySchema = z.object({
  steps: z.array(itineraryStepSchema),
  summary: z.string(),
  tips: z.array(z.string()),
  carSuggestion: z.object({
    recommended: z.boolean(),
    reason: z.string(),
  }),
  hotelSuggestion: z.object({
    recommended: z.boolean(),
    area: z.string(),
    reason: z.string(),
  }),
})

/* ── Date validation ───────────────────────────────────────────────────── */
const APP_TZ = "Europe/Luxembourg"
function localTodayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date())
}
function parseStrictYMD(s: string | undefined | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split("-").map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
  return s
}

/* ── Palisis id resolution (mirrors /api/planner) ──────────────────────── */
async function resolvePalisisId(tripId: string): Promise<string | null> {
  let tripRow = (await dbGetTrip(tripId, { publicOnly: true }).catch(() => null)) as Record<string, unknown> | null
  if (!tripRow && /^\d+$/.test(tripId)) {
    try {
      const rows = (await query(
        `SELECT id, palisis_id, title, duration FROM trips WHERE palisis_id = $1 AND status = 'published' LIMIT 1`,
        [tripId],
      )) as Array<Record<string, unknown>>
      if (rows && rows.length > 0) tripRow = rows[0]
    } catch { /* ignore */ }
  }
  const fromRow =
    (tripRow?.palisis_id as string | undefined) ??
    (tripRow?.palisisId as string | undefined) ??
    null
  if (fromRow) return String(fromRow)
  if (tripId.startsWith("tcms_") || /^\d+$/.test(tripId)) {
    const candidate = tripId.startsWith("tcms_") ? tripId.slice(5) : tripId
    try {
      const rows = (await query(
        `SELECT 1 FROM trips WHERE (id = $1 OR palisis_id = $2) AND status != 'published' LIMIT 1`,
        [tripId, candidate],
      )) as Array<Record<string, unknown>>
      if (rows.length === 0) return candidate
    } catch { /* fail closed */ }
  }
  return null
}

/* ── Timeslot shaping ──────────────────────────────────────────────────── */
interface LiveSlot {
  /** YYYY-MM-DD the slot departs */
  date: string
  startTime: string
  endTime: string | null
  totalPrice: string | null
  totalPriceDisplay: string | null
  spacesRemaining: string | null
  /** Synthetic stable key (date + start_time) — used for "already taken" tracking */
  componentKey: string
}

/** Convert a DepartureDate (datesndeals row) into our LiveSlot shape. */
function shapeSlotFromDeparture(d: DepartureDate): LiveSlot | null {
  if (!d.start_time || !d.start_date) return null
  // Some departures legitimately come back with status="cancelled" or 0 spaces.
  // We treat them as not bookable. spaces_remaining can be "UNLIMITED".
  const raw = d.spaces_remaining
  if (raw && raw !== "UNLIMITED" && parseInt(raw, 10) <= 0) return null
  if (d.status && /cancel/i.test(d.status)) return null
  const startTime = String(d.start_time).slice(0, 5)
  const offerDisplay = d.offer_price_1_display ?? null
  const priceDisplay = offerDisplay ?? d.price_1_display ?? null
  const priceRaw = d.offer_price_1 ?? d.price_1 ?? null
  return {
    date: String(d.start_date),
    startTime,
    endTime: d.end_time ? String(d.end_time).slice(0, 5) : null,
    totalPrice: priceRaw,
    totalPriceDisplay: priceDisplay,
    spacesRemaining: raw ?? null,
    componentKey: `${d.start_date}T${startTime}`,
  }
}

function sortSlots(slots: LiveSlot[]): LiveSlot[] {
  return [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/** Duration in minutes from "1h 30m" / "90 min" / "2 hours" / undefined */
function parseDurationMinutes(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const s = raw.toLowerCase()
  let total = 0
  const hMatch = s.match(/(\d+)\s*(?:h|hr|hour)/)
  const mMatch = s.match(/(\d+)\s*(?:m|min|minute)/)
  if (hMatch) total += parseInt(hMatch[1], 10) * 60
  if (mMatch) total += parseInt(mMatch[1], 10)
  if (total === 0) {
    const plain = s.match(/(\d+)/)
    if (plain) total = parseInt(plain[1], 10)
  }
  return total > 0 ? total : fallback
}

type TripInput = { id: string; title: string; city: string; duration: string; category: string }

interface TripAvailability {
  trip: TripInput
  palisisId: string | null
  slots: LiveSlot[]
  /** "OK" | "NO_PALISIS_LINK" | "NO_SLOTS" | "TOURCMS_ERROR" */
  status: "OK" | "NO_PALISIS_LINK" | "NO_SLOTS" | "TOURCMS_ERROR"
  error?: string
}

/** Add `n` days to a YYYY-MM-DD string (UTC math, returns YYYY-MM-DD) */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(dt)
}

export async function POST(req: Request) {
  try {
    const { trips, startDate } = await req.json() as { trips: TripInput[]; startDate?: string }
    if (!trips?.length) {
      return Response.json({ error: "No trips provided" }, { status: 400 })
    }

    const today = localTodayYMD()
    const parsedDate = parseStrictYMD(startDate)
    const visitDate = parsedDate && parsedDate >= today ? parsedDate : null
    if (!visitDate) {
      return Response.json({
        error: "MISSING_VISIT_DATE",
        message: "A valid visit date (YYYY-MM-DD, today or later) is required to build an itinerary.",
      }, { status: 400 })
    }

    const config = await getTourCMSConfig()
    if (!config) {
      // No mock fallback — refuse honestly so the user knows live data is unavailable.
      return Response.json({
        error: "TOURCMS_NOT_CONFIGURED",
        message: "Live booking integration is not configured. Cannot build a real itinerary.",
      }, { status: 503 })
    }

    /* 1) Resolve palisis ids in parallel. */
    const palisisIds = await Promise.all(trips.map((t) => resolvePalisisId(t.id)))

    /* 2) For each trip, ONE call to datesndeals/search.xml covering both the
       visit date AND the 21-day alternative-date scan window. This is the
       same API the public Palisis booking widget uses to populate its
       departure-date picker, so the data is guaranteed to match what the
       user sees on /trip/[id]. */
    const SCAN_DAYS = 21
    const windowEnd = addDays(visitDate, SCAN_DAYS)

    type TripWindow = TripAvailability & {
      /** All bookable slots in the window, grouped by date */
      slotsByDate: Map<string, LiveSlot[]>
    }

    const availability: TripWindow[] = await Promise.all(
      trips.map(async (trip, i): Promise<TripWindow> => {
        const palisisId = palisisIds[i]
        if (!palisisId) {
          return { trip, palisisId: null, slots: [], slotsByDate: new Map(), status: "NO_PALISIS_LINK" }
        }
        try {
          const res = await showTourDatesAndDeals(config, palisisId, {
            startdate_start: visitDate,
            startdate_end: windowEnd,
          })
          if (!res.ok) {
            return { trip, palisisId, slots: [], slotsByDate: new Map(), status: "TOURCMS_ERROR", error: res.error }
          }
          const shaped = res.dates
            .map(shapeSlotFromDeparture)
            .filter((s): s is LiveSlot => s !== null)
          const slotsByDate = new Map<string, LiveSlot[]>()
          for (const s of shaped) {
            const arr = slotsByDate.get(s.date) ?? []
            arr.push(s)
            slotsByDate.set(s.date, arr)
          }
          for (const [k, arr] of slotsByDate) slotsByDate.set(k, sortSlots(arr))
          const visitSlots = slotsByDate.get(visitDate) ?? []
          if (visitSlots.length === 0) {
            return { trip, palisisId, slots: [], slotsByDate, status: "NO_SLOTS" }
          }
          return { trip, palisisId, slots: visitSlots, slotsByDate, status: "OK" }
        } catch (err) {
          return { trip, palisisId, slots: [], slotsByDate: new Map(), status: "TOURCMS_ERROR", error: String(err) }
        }
      }),
    )

    const bookable = availability.filter((a) => a.status === "OK")
    const unavailable = availability.filter((a) => a.status !== "OK")

    /* 2b) Derive per-trip suggested dates from the same window we already
       fetched — no extra API calls. */
    const suggestedFor = (a: TripWindow): string[] =>
      [...a.slotsByDate.keys()]
        .filter((d) => d !== visitDate && d >= visitDate && d <= windowEnd)
        .sort()
        .slice(0, 8)

    const unavailableTrips = unavailable.map((a) => ({
      tripId: a.trip.id,
      title: a.trip.title,
      reason: a.status,
      suggestedDates: suggestedFor(a),
    }))

    /* Aggregate "best dates" across ALL trips — counts how many trips are
       available on each date in the window. Already free (we have the full
       slotsByDate map in memory). */
    let alternativeDates: Array<{ date: string; tripCount: number; totalTrips: number }> = []
    if (unavailable.length > 0) {
      const dateCounts = new Map<string, number>()
      for (const a of availability) {
        for (const d of a.slotsByDate.keys()) {
          if (d <= visitDate || d > windowEnd) continue
          dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1)
        }
      }
      const totalTrips = trips.length
      alternativeDates = [...dateCounts.entries()]
        .map(([date, tripCount]) => ({ date, tripCount, totalTrips }))
        .sort((a, b) => (b.tripCount - a.tripCount) || a.date.localeCompare(b.date))
        .slice(0, 6)
    }

    // If nothing is bookable on the chosen date, return early — no plan possible.
    if (bookable.length === 0) {
      const hasSuggestions = unavailableTrips.some((u) => u.suggestedDates.length > 0)
      return Response.json({
        error: "NO_AVAILABILITY",
        message: hasSuggestions
          ? `No timeslots for your saved trips on ${visitDate}. We checked the next ${SCAN_DAYS} days — see the suggested dates below.`
          : `None of your saved trips have available timeslots on ${visitDate} or in the next ${SCAN_DAYS} days. Try later in the season.`,
        visitDate,
        unavailableTrips,
        alternativeDates,
        scanDays: SCAN_DAYS,
      }, { status: 409 })
    }

    /* 3) Build a strict prompt with the REAL timeslot menus. */
    const allSettings = await dbGetSettings()
    const settings = allSettings.plannerBehavior as Record<string, unknown>
    const anthropicKey =
      ((allSettings.apiKeys as Record<string, string> | undefined)?.anthropic || process.env.ANTHROPIC_API_KEY || "").trim()
    const dayStartTime = String(settings.dayStartTime ?? "09:00")
    const dayEndTime = String(settings.dayEndTime ?? "21:00")
    const bufferTimeBetweenStops = Number(settings.bufferTimeBetweenStops ?? 30)
    const maxStopsPerDay = Number(settings.maxStopsPerDay ?? 5)
    const defaultActivityDuration = Number(settings.defaultActivityDuration ?? 90)
    const autoInsertMealBreaks = Boolean(settings.autoInsertMealBreaks ?? true)
    const mealBreakDuration = Number(settings.mealBreakDuration ?? 60)
    const lunchBreakTime = String(settings.lunchBreakTime ?? "12:30")
    const dinnerBreakTime = String(settings.dinnerBreakTime ?? "19:00")
    const travelMethodLabel = settings.travelTimeMethod === "walking" ? "walking"
      : settings.travelTimeMethod === "driving" ? "car/driving"
      : "bus/tram (free public transport)"

    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const [vy, vm, vd] = visitDate.split("-").map(Number)
    const visitDayName = DAYS[new Date(Date.UTC(vy, vm - 1, vd)).getUTCDay()]
    const visitPretty = `${visitDayName}, ${vd} ${MONTHS[vm - 1]} ${vy}`

    // Strict per-trip menus. The model MUST pick `time` from these exact values.
    const tripMenuLines = bookable.map((a, i) => {
      const slotLines = a.slots.map((s) =>
        `      • ${s.startTime}${s.endTime ? ` → ${s.endTime}` : ""}` +
        `${s.totalPriceDisplay ? `  ${s.totalPriceDisplay}` : ""}` +
        `${s.spacesRemaining ? `  (${s.spacesRemaining} spaces)` : ""}`,
      ).join("\n")
      const dur = parseDurationMinutes(a.trip.duration, defaultActivityDuration)
      return `${i + 1}. "${a.trip.title}" [${a.trip.id}] — ${a.trip.city || "Luxembourg"} — duration ${dur} min — category ${a.trip.category || "n/a"}
    Available timeslots on ${visitDate}:
${slotLines}`
    }).join("\n\n")

    const unavailableLines = unavailableTrips.length
      ? `\n\nTRIPS WITHOUT AVAILABILITY ON ${visitDate} (DO NOT include in the itinerary):\n` +
        unavailableTrips.map((u) => `  - "${u.title}" [${u.tripId}] — ${u.reason}`).join("\n")
      : ""

    /* 4) Generate the itinerary, constrained to real slots. */
    const prompt = `You are a Luxembourg travel planner. Build a RELAXED, REALISTIC day itinerary using ONLY the live timeslots provided below.

VISIT DATE: ${visitPretty} (${visitDate})
Day window: ${dayStartTime} – ${dayEndTime}
Travel mode between stops: ${travelMethodLabel}
Buffer between activities: ${bufferTimeBetweenStops} minutes
Maximum stops: ${maxStopsPerDay}

CART TRIPS WITH LIVE TIMESLOTS (from Palisis datesndeals/search.xml):

${tripMenuLines}${unavailableLines}

HARD RULES — you MUST obey:
1. For every step, the "time" field MUST be one of the listed timeslot start times for that trip — verbatim, HH:MM. Never invent a time.
2. Copy the matching slot's end time into "endTime", its price (e.g. "€25.00") into "priceFrom", and "spacesRemaining" verbatim (may be "UNLIMITED").
3. Sequence chosen slots so they DON'T overlap and the next start time is at least (previous activity duration + ${bufferTimeBetweenStops} min buffer + realistic ${travelMethodLabel} travel) after the previous start.
4. Prefer geographic proximity when sequencing — same-city trips first, then adjacent areas.
5. If two trips conflict (no non-overlapping combination of their available slots fits in the day window), prefer the better-fitting slots and drop the impossible one from the steps list (do NOT include it).
6. NEVER include any trip from "TRIPS WITHOUT AVAILABILITY" — those have no real slots on this date.
7. Set tripId exactly as given in brackets.

MEAL BREAKS:
${autoInsertMealBreaks ? `- Insert a lunch break (type "food", ~${mealBreakDuration} min) around ${lunchBreakTime} after the morning stop.
- Insert a dinner break (type "food", ~${mealBreakDuration + 15} min) around ${dinnerBreakTime} if the last stop ends before 20:00.
- Insert a coffee break (type "coffee", ~20 min) if there is a >60 min gap between two stops.
- "location" must be the city of the preceding step.
- Set type "none" with empty label/location and durationMinutes 0 if no break fits.` : '- Meal breaks disabled by admin — only insert if absolutely necessary.'}

ALSO EVALUATE:
- CAR RENTAL: recommend only if stops span multiple cities or include rural areas (Vianden, Mullerthal, Echternach, Clervaux).
- HOTEL STAY: recommend only if the last stop ends after ${dayEndTime} or the day exceeds 9 hours.

Return STRICTLY the JSON object matching the schema.`

    if (!anthropicKey) {
      return Response.json({
        error: "AI_NOT_CONFIGURED",
        message: "AI provider is not configured. Add an Anthropic key in Admin → Integrations.",
        visitDate,
        unavailableTrips,
      }, { status: 503 })
    }

    try {
      const anthropic = createAnthropic({ apiKey: anthropicKey })
      const modelId =
        typeof settings.model === "string" && settings.model.startsWith("claude")
          ? (settings.model as string)
          : "claude-haiku-4-5-20251001"
      const { output } = await generateText({
        model: anthropic(modelId),
        output: Output.object({ schema: itinerarySchema }),
        prompt,
      })

      // Validate: each step's time MUST exist in that trip's live slots.
      // If the model hallucinated, snap to the closest real slot.
      const slotMapByTrip = new Map<string, LiveSlot[]>()
      for (const a of bookable) slotMapByTrip.set(a.trip.id, a.slots)

      const toMinutes = (hhmm: string): number => {
        const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
        if (!m) return -1
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
      }
      const nearestSlot = (slots: LiveSlot[], target: string, taken: Set<string>): LiveSlot => {
        const targetMin = toMinutes(target)
        const free = slots.filter((s) => !taken.has(s.componentKey))
        const pool = free.length > 0 ? free : slots
        if (targetMin < 0) return pool[0]
        return [...pool].sort(
          (a, b) => Math.abs(toMinutes(a.startTime) - targetMin) - Math.abs(toMinutes(b.startTime) - targetMin),
        )[0]
      }

      const takenKeys = new Set<string>()
      const reconciledSteps = output.steps
        .filter((s) => slotMapByTrip.has(s.tripId)) // drop hallucinated trips
        .map((s) => {
          const slots = slotMapByTrip.get(s.tripId)!
          const exact = slots.find((x) => x.startTime === s.time)
          // Snap hallucinated times to the slot closest to the AI's intended time,
          // preferring slots not already used by another step.
          const chosen = exact ?? nearestSlot(slots, s.time, takenKeys)
          takenKeys.add(chosen.componentKey)
          const dur = parseDurationMinutes(
            availability.find((a) => a.trip.id === s.tripId)?.trip.duration,
            defaultActivityDuration,
          )
          return {
            ...s,
            time: chosen.startTime,
            endTime: chosen.endTime,
            priceFrom: chosen.totalPriceDisplay ?? chosen.totalPrice ?? null,
            spacesRemaining: chosen.spacesRemaining,
            durationMinutes: s.durationMinutes && s.durationMinutes > 0 ? s.durationMinutes : dur,
          }
        })
        // Final pass: sort chronologically so the timeline stays coherent even
        // if the AI's ordering got tweaked by snapping.
        .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))

      return Response.json({
        ...output,
        steps: reconciledSteps,
        visitDate,
        unavailableTrips,
        alternativeDates,
        scanDays: SCAN_DAYS,
      })
    } catch (aiErr) {
      console.error("[itinerary] AI generation failed:", aiErr)
      return Response.json({
        error: "AI_GENERATION_FAILED",
        message: "Could not build a plan from the live availability. Please try again.",
        visitDate,
        unavailableTrips,
        alternativeDates,
      }, { status: 502 })
    }
  } catch (err) {
    console.error("[itinerary] Error:", err)
    return Response.json({ error: "Failed to generate itinerary" }, { status: 500 })
  }
}
