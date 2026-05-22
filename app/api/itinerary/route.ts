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

/** Decode HTML entities Palisis sometimes embeds in price strings
 *  (e.g. "&#8364;25" → "€25", "&amp;" → "&"). Server-side, no DOM. */
function decodeHtmlEntities(s: string | null | undefined): string | null {
  if (s == null) return s ?? null
  return String(s)
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(n, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => {
      const code = parseInt(n, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&pound;/g, "£")
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
  const priceDisplay = decodeHtmlEntities(offerDisplay ?? d.price_1_display ?? null)
  const priceRaw = decodeHtmlEntities(d.offer_price_1 ?? d.price_1 ?? null)
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

interface IncomingPreferences {
  group?: string
  interests?: string[]
  duration?: string
  budget?: string
  adults?: number
  children?: number
  dayCount?: number
  /** Chat-supplied meal/break windows. At most one entry per type
   *  (enforced by the planner client before we ever see them). */
  mealBreaks?: Array<{
    type: "lunch" | "dinner" | "coffee"
    earliest: string
    latest: string
    durationMinutes: number
  }>
}

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line prefer-const
    let { trips: rawTrips, startDate, preferences, mode } = await req.json() as {
      trips: Array<Partial<TripInput> & { id: string }>
      startDate?: string
      preferences?: IncomingPreferences | null
      /** "preflight" → run availability + duration-conflict checks and
       *  return the decision payload WITHOUT calling the AI. The planner
       *  page calls this first so the chat can ask the user about
       *  conflicts BEFORE any "Your Day Itinerary" card or canvas load.
       *  Anything else (undefined included) does the full build. */
      mode?: "preflight" | "build"
    }
    if (!rawTrips?.length) {
      return Response.json({ error: "No trips provided" }, { status: 400 })
    }
    // Defensive: meal-break placeholder ids (lunch/dinner/coffee, meal_*,
    // tcms_lunch, etc.) sometimes leak in from the AI's buildItinerary
    // step list. They aren't real trips and would otherwise surface in
    // the "trips without availability" sidebar panel as "tcms_lunch".
    const isMealBreakId = (id: string) =>
      id === "lunch" || id === "dinner" || id === "coffee"
      || id.startsWith("meal_") || id.startsWith("tcms_lunch")
      || id.startsWith("tcms_dinner") || id.startsWith("tcms_coffee")
    rawTrips = rawTrips.filter((t) => !isMealBreakId(t.id))
    if (!rawTrips.length) {
      return Response.json({ error: "No trips provided" }, { status: 400 })
    }
    const isPreflight = mode === "preflight"
    // Hydrate trips: accept either fully-populated {id,title,city,duration,
    // category} (cart path) OR id-only payloads (chat path where the AI's
    // plan references trips that may not be in the visitor's cart yet).
    // Missing fields are resolved from our DB so the prompt and the
    // Palisis lookup downstream both get the canonical row.
    const trips: TripInput[] = await Promise.all(rawTrips.map(async (t) => {
      const needsHydration = !t.title || !t.duration || !t.city || !t.category
      if (!needsHydration) return t as TripInput
      const row = (await dbGetTrip(t.id, { publicOnly: true }).catch(() => null)) as Record<string, unknown> | null
      return {
        id: t.id,
        title: t.title || (typeof row?.title === "string" ? row.title : t.id),
        city: t.city || (typeof row?.city === "string" ? row.city : ""),
        duration: t.duration || (typeof row?.duration === "string" ? row.duration : ""),
        category: t.category || (typeof row?.category === "string" ? row.category : ""),
      }
    }))
    if (trips.length === 0) {
      return Response.json({ error: "No trips provided" }, { status: 400 })
    }
    // Normalise visitor preferences (all optional — older clients won't send them).
    const prefs: Required<IncomingPreferences> = {
      group: typeof preferences?.group === "string" ? preferences.group : "",
      interests: Array.isArray(preferences?.interests) ? preferences!.interests!.slice(0, 6) : [],
      duration: typeof preferences?.duration === "string" ? preferences.duration : "",
      budget: typeof preferences?.budget === "string" ? preferences.budget : "",
      adults: typeof preferences?.adults === "number" && preferences.adults >= 1 ? Math.min(20, preferences.adults) : 1,
      children: typeof preferences?.children === "number" && preferences.children >= 0 ? Math.min(20, preferences.children) : 0,
      dayCount: typeof preferences?.dayCount === "number" && preferences.dayCount >= 1 ? Math.min(14, Math.floor(preferences.dayCount)) : 1,
      mealBreaks: Array.isArray(preferences?.mealBreaks) ? preferences!.mealBreaks! : [],
    }
    const isMultiDay = prefs.duration === "multi-day" && prefs.dayCount >= 2

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

    /* 2c) Enrich bookable trips with description + tags + lat/lng-less city
       hints from our DB. The sidebar only forwards id/title/city/duration/
       category — but the AI plans much better when it can also see what
       the trip IS (a nightlife crawl shouldn't be at 09:00, a sunrise
       hike shouldn't be at 17:00). One round-trip for all ids. */
    type TripEnrichment = {
      shortDescription: string | null
      tags: string[]
      description: string | null
    }
    const enrichmentById = new Map<string, TripEnrichment>()
    try {
      const ids = bookable.map((b) => b.trip.id)
      if (ids.length > 0) {
        const enrichRes = await query<{
          id: string
          short_description: string | null
          tags: string[] | null
          description: string | null
        }>(
          `SELECT id, short_description, tags, description
             FROM trips
            WHERE id = ANY($1::text[])`,
          [ids],
        )
        for (const row of enrichRes) {
          enrichmentById.set(row.id, {
            shortDescription: row.short_description,
            tags: Array.isArray(row.tags) ? row.tags : [],
            description: row.description,
          })
        }
      }
    } catch {
      // Enrichment is purely additive — fall back to id/title/category if
      // the trips table is unavailable for any reason.
    }

    /* 2d) Plan-conflict detection: do the cart trips even FIT in the
       visitor's chosen duration window?  When they obviously don't (e.g.
       5 trips with half-day selected), we refuse to silently drop trips
       — instead we return a structured 422 the planner page can turn into
       a chat prompt asking the visitor to extend / multi-day / drop. */
    const allSettings = await dbGetSettings()
    const settings = allSettings.plannerBehavior as Record<string, unknown>
    const itinerarySettings = (allSettings.itineraryBehavior ?? {}) as Record<string, unknown>
    const adminPromptTemplate = String(itinerarySettings.systemPrompt ?? "").trim()
    const adminTipsPrompt = String(itinerarySettings.tipsPrompt ?? "").trim()
    // Car-rental and hotel cross-sell widgets are temporarily disabled on
    // the planner. The admin toggles + DB fields are kept intact so they
    // can be re-enabled later without a migration; we just force-off here.
    const showCarWidget = false
    const showHotelWidget = false
    const itineraryModel = typeof itinerarySettings.model === "string" ? itinerarySettings.model : null
    const itineraryTemperature = typeof itinerarySettings.temperature === "number" ? itinerarySettings.temperature : null
    const itineraryMaxTokens = typeof itinerarySettings.maxTokens === "number" && itinerarySettings.maxTokens > 0
      ? Math.min(8192, Math.floor(itinerarySettings.maxTokens))
      : null
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

    // User-supplied meal/break windows from chat — REPLACE the admin
    // defaults entry-for-entry. Validated by the planner client; we just
    // index by type here. Missing types fall back to the admin defaults.
    const userMealBreaks = new Map<"lunch" | "dinner" | "coffee", {
      earliest: string; latest: string; durationMinutes: number
    }>()
    if (Array.isArray(preferences?.mealBreaks)) {
      for (const mb of preferences!.mealBreaks!) {
        if (mb && (mb.type === "lunch" || mb.type === "dinner" || mb.type === "coffee")) {
          userMealBreaks.set(mb.type, {
            earliest: mb.earliest,
            latest: mb.latest,
            durationMinutes: mb.durationMinutes,
          })
        }
      }
    }
    const travelMethodLabel = settings.travelTimeMethod === "walking" ? "walking"
      : settings.travelTimeMethod === "driving" ? "car/driving"
      : "bus/tram (free public transport)"

    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const [vy, vm, vd] = visitDate.split("-").map(Number)
    const visitDayName = DAYS[new Date(Date.UTC(vy, vm - 1, vd)).getUTCDay()]
    const visitPretty = `${visitDayName}, ${vd} ${MONTHS[vm - 1]} ${vy}`

    // Strict per-trip menus. The model MUST pick `time` from these exact
    // values. We also expose the short description + tags so the AI can
    // detect time-of-day suitability (nightlife, sunrise, indoor wet-
    // weather, kids-friendly, etc.) and proximity hints.
    let tripMenuLines = bookable.map((a, i) => {
      const slotLines = a.slots.map((s) =>
        `      • ${s.startTime}${s.endTime ? ` → ${s.endTime}` : ""}` +
        `${s.totalPriceDisplay ? `  ${s.totalPriceDisplay}` : ""}` +
        `${s.spacesRemaining ? `  (${s.spacesRemaining} spaces)` : ""}`,
      ).join("\n")
      const dur = parseDurationMinutes(a.trip.duration, defaultActivityDuration)
      const enrich = enrichmentById.get(a.trip.id)
      // Short, AI-readable blurb. Trim long descriptions to keep prompt
      // tokens lean — the AI only needs enough to classify type-of-day
      // and rough vibe (e.g. "wine tasting", "nightlife", "river cruise").
      const blurb = (enrich?.shortDescription ?? enrich?.description ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240)
      const tagLine = enrich?.tags?.length ? `   Tags: ${enrich.tags.slice(0, 8).join(", ")}\n` : ""
      const blurbLine = blurb ? `   What it is: ${blurb}${blurb.length === 240 ? "…" : ""}\n` : ""
      return `${i + 1}. "${a.trip.title}" [${a.trip.id}] — ${a.trip.city || "Luxembourg"} — duration ${dur} min — category ${a.trip.category || "n/a"}
${blurbLine}${tagLine}    Available timeslots on ${visitDate}:
${slotLines}`
    }).join("\n\n")

    /* Geographic + time-of-day planning hints — derived from the cart so
       the prompt has CONCRETE numbers, not just abstract "prefer nearby"
       advice. Luxembourg distances are short; the matrix below covers the
       common destinations our catalog actually ships to. */
    const CITY_TRAVEL_MIN: Record<string, Record<string, number>> = {
      "luxembourg city": { "luxembourg city": 10, esch: 25, vianden: 40, echternach: 30, mullerthal: 35, clervaux: 55, mondorf: 20, remich: 25, larochette: 25 },
      esch: { esch: 10, "luxembourg city": 25, mondorf: 25, remich: 30 },
      vianden: { vianden: 10, "luxembourg city": 40, clervaux: 30, echternach: 30 },
      echternach: { echternach: 10, "luxembourg city": 30, mullerthal: 10, vianden: 30 },
      mullerthal: { mullerthal: 10, "luxembourg city": 35, echternach: 10 },
      clervaux: { clervaux: 10, "luxembourg city": 55, vianden: 30 },
      mondorf: { mondorf: 10, "luxembourg city": 20, esch: 25, remich: 15 },
      remich: { remich: 10, "luxembourg city": 25, mondorf: 15 },
      larochette: { larochette: 10, "luxembourg city": 25 },
    }
    const normCity = (c?: string): string => (c || "luxembourg city").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z\s-]/g, "").trim() || "luxembourg city"
    // Both `tripCities` and the prompt-facing travel/menu blocks are
    // rebuilt from `bookable` AFTER any plan-conflict trim below, so the
    // AI never sees trips that were dropped to fit the visitor's duration
    // (architect feedback: prompt + reconciliation must operate on the
    // same trip set).
    const buildTripCities = () => Array.from(new Set(bookable.map((b) => normCity(b.trip.city))))
    const buildTravelMatrixLines = (cities: string[]) => {
      const lines: string[] = []
      for (const a of cities) {
        for (const b of cities) {
          if (a >= b) continue
          const mins = CITY_TRAVEL_MIN[a]?.[b] ?? CITY_TRAVEL_MIN[b]?.[a]
          if (typeof mins === "number") {
            lines.push(`  • ${a} ↔ ${b}: ~${mins} min by ${travelMethodLabel}`)
          }
        }
      }
      return lines
    }
    const buildCityTravelMatrix = (lines: string[]) => lines.length
      ? `INTER-CITY TRAVEL TIMES (use these to compute realistic gaps between stops):\n${lines.join("\n")}\n  • Same city / same neighbourhood: ~10–15 min on foot or public transport`
      : `All cart trips are in the same city — keep travel between stops to ~10–15 min on foot or public transport.`
    let tripCities = buildTripCities()
    let travelMatrixLines = buildTravelMatrixLines(tripCities)
    let cityTravelMatrix = buildCityTravelMatrix(travelMatrixLines)

    const unavailableLines = unavailableTrips.length
      ? `\n\nTRIPS WITHOUT AVAILABILITY ON ${visitDate} (DO NOT include in the itinerary):\n` +
        unavailableTrips.map((u) => `  - "${u.title}" [${u.tripId}] — ${u.reason}`).join("\n")
      : ""

    /* 4) Generate the itinerary, constrained to real slots.

       The base prompt is admin-editable in /admin/ai-systems/itinerary.
       It uses {{placeholders}} that we substitute with live data here.
       If no admin prompt is set we fall back to the built-in template. */
    // Build per-meal rule lines. User-supplied windows take precedence
    // over admin defaults — and when the visitor SET a meal window in
    // chat, the rule is MUST-HAVE: dropping a trip to make room is the
    // expected tradeoff, and that tradeoff MUST be named in the summary.
    const lunchUser = userMealBreaks.get("lunch")
    const dinnerUser = userMealBreaks.get("dinner")
    const coffeeUser = userMealBreaks.get("coffee")
    const lunchRule = lunchUser
      ? `- LUNCH (visitor requirement, must-have): insert a "food" breakAfter the morning stop so the lunch starts between ${lunchUser.earliest} and ${lunchUser.latest}, lasting ~${lunchUser.durationMinutes} min. If respecting this lunch window forces you to drop a trip, drop the lowest-priority trip and NAME IT EXPLICITLY in the summary like "Skipped X to fit the visitor's lunch window".`
      : `- LUNCH: insert a "food" break (~${mealBreakDuration} min) so it starts between 12:00 and 14:00 (target ${lunchBreakTime}) after the morning stop. If trip slots force lunch outside 12:00–14:00 you MUST mention this tradeoff in the summary (e.g. "No 12–14 lunch break possible — the only fit is at 14:30").`
    const dinnerRule = dinnerUser
      ? `- DINNER (visitor requirement, must-have): insert a "food" breakAfter a late-afternoon stop so dinner starts between ${dinnerUser.earliest} and ${dinnerUser.latest}, lasting ~${dinnerUser.durationMinutes} min. Same tradeoff rule as lunch — if you must drop a trip to fit dinner, name it in the summary.`
      : `- DINNER: insert a "food" break (~${mealBreakDuration + 15} min) so it starts between 18:30 and 20:30 (target ${dinnerBreakTime}) ONLY if the last stop ends after 18:30 or the day extends past 19:00.`
    const coffeeRule = coffeeUser
      ? `- COFFEE (visitor requirement): insert a "coffee" breakAfter a stop so the coffee starts between ${coffeeUser.earliest} and ${coffeeUser.latest}, lasting ~${coffeeUser.durationMinutes} min.`
      : `- COFFEE: insert a "coffee" break (~20 min) if there is a >60 min gap between two stops.`

    const mealBreaksBlock = autoInsertMealBreaks || userMealBreaks.size > 0
      ? `${lunchRule}
${dinnerRule}
${coffeeRule}
- "location" must be the city of the preceding step.
- Set type "none" with empty label/location and durationMinutes 0 if no break fits.
- CRITICAL: never pack two stops back-to-back through a lunch/dinner window without inserting a break — that is the #1 visitor complaint. If you cannot fit BOTH the meal and every cart trip on this date, prefer to drop one trip and KEEP THE MEAL, then explain the choice in the summary so the visitor can decide whether to accept it or pick a different date.`
      : '- Meal breaks disabled by admin — only insert if absolutely necessary.'

    /* Plan-conflict detection (runs AFTER we know which trips are
       bookable on the chosen date — no point flagging an overpack on
       trips that already got filtered out). We estimate the total time
       the visitor's cart needs vs the time their `duration` preference
       allows. If it clearly doesn't fit AND they aren't in multi-day,
       we surface a 422 with the structured options the planner page
       turns into a chat question instead of silently dropping trips. */
    const totalActivityMinutes = bookable.reduce(
      (sum, b) => sum + parseDurationMinutes(b.trip.duration, defaultActivityDuration),
      0,
    )
    const bufferMinutes = Math.max(0, bookable.length - 1) * bufferTimeBetweenStops
    const expectedMealMinutes = (userMealBreaks.size > 0
      ? Array.from(userMealBreaks.values()).reduce((s, m) => s + m.durationMinutes, 0)
      : (autoInsertMealBreaks ? mealBreakDuration : 0))
    // Average inter-city travel minutes for the trips actually in the cart.
    let interCityTravelEst = 0
    if (tripCities.length > 1) {
      const pairCount = (tripCities.length * (tripCities.length - 1)) / 2
      const totalPair = travelMatrixLines.reduce((s, line) => {
        const m = line.match(/~(\d+) min/)
        return s + (m ? Number(m[1]) : 30)
      }, 0)
      interCityTravelEst = pairCount > 0 ? Math.round(totalPair / pairCount) * Math.max(0, bookable.length - 1) : 0
    } else {
      interCityTravelEst = Math.max(0, bookable.length - 1) * 15
    }
    const estimatedTotalMinutes = totalActivityMinutes + bufferMinutes + expectedMealMinutes + interCityTravelEst

    const parseHHMM = (s: string): number => {
      const [h, m] = s.split(":").map(Number)
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
    }
    const dayWindowMinutes = Math.max(60, parseHHMM(dayEndTime) - parseHHMM(dayStartTime))
    let availableMinutes: number
    if (isMultiDay) {
      availableMinutes = dayWindowMinutes * prefs.dayCount
    } else if (prefs.duration === "1-2h") {
      availableMinutes = 120
    } else if (prefs.duration === "half-day") {
      availableMinutes = 300
    } else {
      // "full-day" or unset → full configured day window
      availableMinutes = dayWindowMinutes
    }

    // Overshoot threshold: 15% slack to avoid annoying conflict prompts on
    // borderline cases. The AI can usually squeeze borderline plans by
    // picking tighter timeslots.
    const overshootRatio = estimatedTotalMinutes / Math.max(1, availableMinutes)
    const hasPlanConflict = !isMultiDay && bookable.length >= 2 && overshootRatio > 1.15

    /* When the visitor's saved trips overshoot their chosen duration, we
       used to refuse with 422 and leave the Trip Canvas empty. The
       visitor was then stuck staring at an empty plan with no clue what
       to change. New behaviour: we still surface the "change duration /
       go multi-day / drop trips" suggestion in chat (via `conflict` on
       the success response), but we ALSO build a best-fit subset that
       respects the visitor's CURRENT preferences so the Trip Canvas
       has something real to render. The subset is greedy-shortest-first
       so we keep as many trips as possible within the time window.   */
    let conflictPayload: {
      reason: string
      tripCount: number
      estimatedMinutes: number
      availableMinutes: number
      currentDuration: string
      droppedForFit: Array<{ tripId: string; title: string; reason: string }>
      options: Array<{
        id: string
        label: string
        description: string
        action: "updateDuration" | "promptDrop"
        duration?: string
        dayCount?: number
        candidateTripIds?: string[]
      }>
    } | null = null

    if (hasPlanConflict) {
      const overshootMin = Math.max(15, estimatedTotalMinutes - availableMinutes)
      const minDayCount = Math.max(2, Math.ceil(estimatedTotalMinutes / Math.max(1, dayWindowMinutes)))
      const tripsSortedLongest = bookable
        .map((b) => ({
          id: b.trip.id,
          title: b.trip.title,
          minutes: parseDurationMinutes(b.trip.duration, defaultActivityDuration),
        }))
        .sort((a, b) => b.minutes - a.minutes)
      const dropCandidates = tripsSortedLongest.slice(0, Math.min(2, bookable.length - 1))

      // Greedy-shortest-first fit with INCREMENTAL overhead. The earlier
      // version pre-subtracted overhead computed from the FULL cart, which
      // was overly pessimistic — adding fewer trips means fewer buffers,
      // fewer city hops, and (usually) one meal break instead of N. Here
      // we charge overhead per additional kept trip so the budget reflects
      // the actual subset being built.
      const tripsByShortest = [...tripsSortedLongest].sort((a, b) => a.minutes - b.minutes)
      const oneMealMinutes = (autoInsertMealBreaks || userMealBreaks.size > 0)
        ? (userMealBreaks.size > 0
            ? Math.max(...Array.from(userMealBreaks.values()).map((m) => m.durationMinutes))
            : mealBreakDuration)
        : 0
      // Per-extra-trip overhead = one buffer + average inter-city hop.
      // We use 15 min as the same-city baseline the matrix block falls
      // back to, matching what the AI prompt is told to assume.
      const perExtraTripOverhead = bufferTimeBetweenStops + 15
      const keepIds = new Set<string>()
      let consumed = oneMealMinutes // meal break charged once if used at all
      for (const t of tripsByShortest) {
        const incremental = t.minutes + (keepIds.size > 0 ? perExtraTripOverhead : 0)
        if (consumed + incremental <= availableMinutes) {
          keepIds.add(t.id)
          consumed += incremental
        }
      }
      // Always keep at least one trip so the canvas has something to show.
      if (keepIds.size === 0 && tripsByShortest.length > 0) {
        keepIds.add(tripsByShortest[0].id)
      }

      const droppedForFit = bookable
        .filter((b) => !keepIds.has(b.trip.id))
        .map((b) => ({
          tripId: b.trip.id,
          title: b.trip.title,
          reason: `Would not fit your ${prefs.duration || "single-day"} window — change duration or visit date to include it.`,
        }))

      conflictPayload = {
        reason: "TOO_MANY_TRIPS_FOR_DURATION",
        tripCount: bookable.length,
        estimatedMinutes: estimatedTotalMinutes,
        availableMinutes,
        currentDuration: prefs.duration || "full-day",
        droppedForFit,
        options: [
          ...(prefs.duration !== "full-day" ? [{
            id: "switch-fullday",
            label: "Make it a full-day trip",
            description: `Use the full ${dayStartTime}–${dayEndTime} window so all ${bookable.length} trips can fit.`,
            action: "updateDuration" as const,
            duration: "full-day",
          }] : []),
          {
            id: "switch-multiday",
            label: `Spread across ${minDayCount} days`,
            description: `Plan ${bookable.length} trips over ${minDayCount} consecutive days starting ${visitDate}.`,
            action: "updateDuration" as const,
            duration: "multi-day",
            dayCount: minDayCount,
          },
          {
            id: "drop-trips",
            label: "Drop the longest trips",
            description: `Remove ${dropCandidates.map((d) => `"${d.title}"`).join(" and ")} from your cart to fit the ${prefs.duration || "single-day"} window.`,
            action: "promptDrop" as const,
            candidateTripIds: dropCandidates.map((d) => d.id),
          },
        ],
      }

      // Trim `bookable` to the fitting subset for the rest of the
      // pipeline AND rebuild every prompt-facing block derived from it,
      // so the AI prompt and the server-side reconciliation operate on
      // the SAME trip set (architect feedback). Overshoot estimate is
      // unused beyond this point.
      void overshootMin
      for (let i = bookable.length - 1; i >= 0; i--) {
        if (!keepIds.has(bookable[i].trip.id)) bookable.splice(i, 1)
      }
      // PREFLIGHT EARLY RETURN — see block below the if-conflict scope.
      tripMenuLines = bookable.map((a, i) => {
        const slotLines = a.slots.map((s) =>
          `      • ${s.startTime}${s.endTime ? ` → ${s.endTime}` : ""}` +
          `${s.totalPriceDisplay ? `  ${s.totalPriceDisplay}` : ""}` +
          `${s.spacesRemaining ? `  (${s.spacesRemaining} spaces)` : ""}`,
        ).join("\n")
        const dur = parseDurationMinutes(a.trip.duration, defaultActivityDuration)
        const enrich = enrichmentById.get(a.trip.id)
        const blurb = (enrich?.shortDescription ?? enrich?.description ?? "")
          .replace(/\s+/g, " ").trim().slice(0, 240)
        const tagLine = enrich?.tags?.length ? `   Tags: ${enrich.tags.slice(0, 8).join(", ")}\n` : ""
        const blurbLine = blurb ? `   What it is: ${blurb}${blurb.length === 240 ? "…" : ""}\n` : ""
        return `${i + 1}. "${a.trip.title}" [${a.trip.id}] — ${a.trip.city || "Luxembourg"} — duration ${dur} min — category ${a.trip.category || "n/a"}
${blurbLine}${tagLine}    Available timeslots on ${visitDate}:
${slotLines}`
      }).join("\n\n")
      tripCities = buildTripCities()
      travelMatrixLines = buildTravelMatrixLines(tripCities)
      cityTravelMatrix = buildCityTravelMatrix(travelMatrixLines)
    }

    /* ─── PREFLIGHT EARLY RETURN ──────────────────────────────────────
       The planner page calls this endpoint TWICE for chat-built plans:
       once with mode:"preflight" to discover availability + duration
       conflicts, and (only if the preflight is clean) a second time
       without `mode` for the real AI build. This way the chat can ask
       the visitor about conflicts BEFORE any "Your Day Itinerary" card
       appears on the Trip Canvas. Preflight skips the AI call entirely
       so the round-trip is cheap (just trip hydration + TourCMS
       availability fetches that the real build would do anyway).      */
    if (isPreflight) {
      const status: "READY" | "NEEDS_DECISION" =
        (conflictPayload || unavailableTrips.length > 0) ? "NEEDS_DECISION" : "READY"
      return Response.json({
        kind: "preflight",
        status,
        visitDate,
        scanDays: SCAN_DAYS,
        conflict: conflictPayload,
        unavailableTrips,
        alternativeDates,
        bookableTripIds: bookable.map((b) => b.trip.id),
      })
    }

    const placeholders: Record<string, string> = {
      visitDate,
      visitPretty,
      dayStartTime,
      dayEndTime,
      travelMethodLabel,
      bufferTimeBetweenStops: String(bufferTimeBetweenStops),
      maxStopsPerDay: String(maxStopsPerDay),
      tripMenuLines,
      unavailableLines,
      mealBreaksBlock,
      cityTravelMatrix,
      visitorProfile: (() => {
        // Compact visitor profile that the prompt can read via {{visitorProfile}}.
        // Empty preference fields are omitted so the AI doesn't anchor on "unknown".
        const lines: string[] = []
        if (prefs.group) lines.push(`- Group type: ${prefs.group}`)
        const partySize = prefs.adults + prefs.children
        if (partySize > 0) {
          lines.push(`- Party size: ${prefs.adults} adult${prefs.adults === 1 ? "" : "s"}${prefs.children > 0 ? `, ${prefs.children} child${prefs.children === 1 ? "" : "ren"}` : ""} (${partySize} total)`)
        }
        if (prefs.interests.length) lines.push(`- Interests: ${prefs.interests.join(", ")}`)
        if (prefs.budget) lines.push(`- Budget: ${prefs.budget}`)
        if (prefs.duration) {
          lines.push(`- Trip length: ${prefs.duration}${isMultiDay ? ` (${prefs.dayCount} days)` : ""}`)
        }
        return lines.length ? lines.join("\n") : "- No saved preferences (use sensible defaults)."
      })(),
      tripDayPlanRule: isMultiDay
        ? `MULTI-DAY MODE (${prefs.dayCount} days starting {{visitDate}}): Spread the cart trips across ${prefs.dayCount} consecutive days. Group trips for the SAME day together and prefix each group's first step with a Markdown heading like "Day 1 — {{visitDate}}" inside its "title" field. Use the visit date for day 1; for later days assume the SAME timeslot pattern is available (you only have day-1 slots, but it's reasonable to plan the same morning/afternoon shape on subsequent days). Try hard to include EVERY cart trip across the whole multi-day plan before dropping any.`
        : `SINGLE-DAY MODE: Sequence ALL cart trips into ONE day if at all possible. Only drop a trip if there is genuinely no non-overlapping slot combination that fits within the day window — and if you do drop one, mention it in the summary so the visitor knows.`,
    }
    const fillPlaceholders = (template: string): string =>
      template.replace(/\{\{(\w+)\}\}/g, (_m, k) => placeholders[k] ?? "")

    const DEFAULT_BUILD_TEMPLATE = `You are a Luxembourg travel planner. Build a RELAXED, REALISTIC itinerary using ONLY the live timeslots provided below.

VISIT DATE: {{visitPretty}} ({{visitDate}})
Day window: {{dayStartTime}} – {{dayEndTime}}
Travel mode between stops: {{travelMethodLabel}}
Buffer between activities: {{bufferTimeBetweenStops}} minutes
Maximum stops per day: {{maxStopsPerDay}}

VISITOR PROFILE — tailor pacing, restaurant suggestions and tone to this:
{{visitorProfile}}

CART TRIPS WITH LIVE TIMESLOTS (from Palisis datesndeals/search.xml):

{{tripMenuLines}}{{unavailableLines}}

DAY-PLAN RULE:
{{tripDayPlanRule}}

{{cityTravelMatrix}}

HARD RULES — you MUST obey:
1. For every step, the "time" field MUST be one of the listed timeslot start times for that trip — verbatim, HH:MM. Never invent a time.
2. Copy the matching slot's end time into "endTime", its price (e.g. "€25.00") into "priceFrom", and "spacesRemaining" verbatim (may be "UNLIMITED").
3. Sequence chosen slots so they DON'T overlap and the next start time is at least (previous activity duration + {{bufferTimeBetweenStops}} min buffer + the inter-city travel from the matrix above) after the previous start. Use the matrix MINUTES, not guesses.
4. GEOGRAPHIC SEQUENCING — minimise back-and-forth:
   • Group same-city stops together. Never zig-zag (City → Vianden → City → Vianden).
   • When the cart spans multiple cities, plan a one-direction arc: e.g. start in Luxembourg City → continue to Mullerthal → finish in Echternach (geographically adjacent).
   • A round-trip out to Vianden / Clervaux / Mullerthal should anchor either the morning OR the afternoon — never split it across the day.
5. TIME-OF-DAY SUITABILITY — read each trip's "What it is" blurb + Tags + Category and schedule accordingly:
   • NIGHTLIFE / bar crawl / late-night tours → only schedule with a start time at or after 18:00.
   • SUNRISE / early-morning hikes / breakfast tours → only before 10:00.
   • DINNER cruises / evening cruises / sunset tours → start between 17:00 and 20:00.
   • OUTDOOR hikes, walking tours, castle visits → daylight only — start no later than 16:00 in winter, 18:00 in summer.
   • INDOOR museums, wine tastings, spa, escape rooms → flexible, good rain-day filler.
   • If a trip's only available slot violates these rules, KEEP IT but flag the mismatch in the "summary" so the visitor can swap dates.
6. INCLUDE EVERY CART TRIP that's bookable on this date. Do not silently drop a trip just because slots are tight — push it into a later time of day, swap to a different available slot, or (in multi-day mode) move it to a different day. Only drop a trip as an absolute last resort, and if you do drop one you MUST name it in the summary together with the reason.
7. NEVER include any trip from "TRIPS WITHOUT AVAILABILITY" — those have no real slots on this date.
8. Set tripId exactly as given in brackets.

MEAL BREAKS:
{{mealBreaksBlock}}

ALSO EVALUATE:
- CAR RENTAL: recommend only if stops span multiple cities or include rural areas (Vianden, Mullerthal, Echternach, Clervaux).
- HOTEL STAY: recommend only if the last stop ends after {{dayEndTime}} or the day exceeds 9 hours.

Return STRICTLY the JSON object matching the schema.`

    const DEFAULT_TIPS_PROMPT = `Generate 3-5 short, actionable tips for the visitor's day in Luxembourg based on the itinerary above.
- Each tip ≤ 18 words.
- Focus on practical advice: weather, free public transport, what to bring, best photo moments, local food recommendations near the planned stops, time-saving hints.
- Write in plain everyday English. No emojis. No marketing fluff.`

    const buildTemplate = adminPromptTemplate || DEFAULT_BUILD_TEMPLATE
    const tipsInstructions = adminTipsPrompt || DEFAULT_TIPS_PROMPT
    const prompt = `${fillPlaceholders(buildTemplate)}

TIPS — populate the "tips" array using these instructions:
${tipsInstructions}`

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
      // Prefer the model configured under /admin/ai-systems/itinerary; fall
      // back to the planner setting, then a known-good default.
      const rawModel =
        itineraryModel ??
        (typeof settings.model === "string" ? (settings.model as string) : null) ??
        "claude-haiku-4-5-20251001"
      // Vercel-AI-Gateway-style ids look like "anthropic/<model>" — strip the prefix
      // for the direct Anthropic SDK.
      const modelId = rawModel.startsWith("anthropic/") ? rawModel.slice("anthropic/".length) : rawModel
      const { output } = await generateText({
        model: anthropic(modelId),
        output: Output.object({ schema: itinerarySchema }),
        temperature: itineraryTemperature ?? undefined,
        maxOutputTokens: itineraryMaxTokens ?? undefined,
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
      const addMinutes = (hhmm: string, mins: number): string => {
        const base = toMinutes(hhmm)
        if (base < 0) return hhmm
        const total = Math.max(0, Math.min(24 * 60 - 1, base + Math.round(mins)))
        const h = Math.floor(total / 60)
        const m = total % 60
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      }
      const parseTravelMinutes = (s: string | null | undefined): number => {
        if (!s) return 0
        // Accumulate both hour and minute components so "1h 30min",
        // "1 hr 15 min", "2 hours" and "45 minutes" all parse correctly.
        let total = 0
        const hourMatch = /(\d+(?:\.\d+)?)\s*(?:hr|hour|hours|h\b)/i.exec(s)
        if (hourMatch) total += Math.round(parseFloat(hourMatch[1]) * 60)
        const minMatch = /(\d+)\s*(?:min|mins|minute|minutes|m\b)/i.exec(s)
        if (minMatch) total += parseInt(minMatch[1], 10)
        if (total > 0) return total
        // Fall back to the first bare integer ("15" → 15 min).
        const bare = /\b(\d+)\b/.exec(s)
        return bare ? parseInt(bare[1], 10) : 0
      }

      // One small batch fetch for per-trip "things to do" + "important notes".
      // We match on either our internal id OR the palisis id we resolved earlier
      // so the planner cart's mixed id formats both work.
      const tripIdsForDetails = Array.from(new Set([
        ...trips.map((t) => t.id),
        ...palisisIds.filter((p): p is string => Boolean(p)),
      ]))
      const tripDetailsById = new Map<string, {
        highlights: string[]
        notes: string
        city: string
        location: string
        departureGeo: string
        endGeo: string
      }>()
      if (tripIdsForDetails.length > 0) {
        try {
          const rows = (await query(
            `SELECT id, palisis_id, highlights, essential_information, short_description,
                    city, departure_location, departure_geocode, end_geocode
               FROM trips
              WHERE id = ANY($1::text[]) OR palisis_id = ANY($1::text[])`,
            [tripIdsForDetails],
          )) as Array<{
            id: string
            palisis_id: string | null
            highlights: string[] | null
            essential_information: string | null
            short_description: string | null
            city: string | null
            departure_location: string | null
            departure_geocode: string | null
            end_geocode: string | null
          }>
          for (const row of rows) {
            // Keep the full essential-info text — the UI applies a collapsible
            // "Read more" once it crosses a length threshold.
            const notes = (row.essential_information || row.short_description || "").trim()
            const entry = {
              highlights: Array.isArray(row.highlights)
                ? row.highlights.filter((h): h is string => typeof h === "string" && h.trim() !== "").slice(0, 4)
                : [],
              notes,
              city: (row.city || "").trim(),
              location: (row.departure_location || "").trim(),
              departureGeo: (row.departure_geocode || "").trim(),
              endGeo: (row.end_geocode || "").trim(),
            }
            tripDetailsById.set(row.id, entry)
            if (row.palisis_id) tripDetailsById.set(row.palisis_id, entry)
          }
        } catch (err) {
          console.warn("[itinerary] trip details fetch failed:", err)
        }
      }

      // ─── Mapbox-backed travel-time helper ───────────────────────────────
      // Calls the Directions API for driving + walking profiles between two
      // "lat,lng" strings. Returns null on any failure / missing inputs so
      // the UI can show "—" instead of a fabricated number. Public transit
      // is not supported by Mapbox and is reported back as null too.
      // IMPORTANT: `settings` earlier in this handler is shadowed to
      // `allSettings.plannerBehavior`, so the apiKeys map lives on the
      // top-level allSettings object — that's what we must read here.
      const mapboxToken =
        process.env.mapbox ||
        process.env.MAPBOX ||
        process.env.MAPBOX_TOKEN ||
        process.env.MAPBOX_ACCESS_TOKEN ||
        process.env.NEXT_PUBLIC_MAPBOX ||
        process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
        process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
        (allSettings?.apiKeys as Record<string, string> | undefined)?.mapbox ||
        ""

      const parseLatLng = (s: string): { lat: number; lng: number } | null => {
        if (!s) return null
        const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s)
        if (!m) return null
        const lat = parseFloat(m[1])
        const lng = parseFloat(m[2])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        return { lat, lng }
      }

      type TravelLeg = {
        driveMin: number | null
        walkMin: number | null
        transitMin: number | null
        distanceKm: number | null
        /** Why we couldn't compute a real value — drives the UI's helper
         *  text ("add a Mapbox token" vs "address missing on the trip"). */
        reason: "ok" | "no_token" | "no_geocode"
        /** Human-readable origin / destination for the timeline. */
        fromLabel: string | null
        toLabel: string | null
      }
      const fetchProfile = async (
        profile: "driving" | "walking",
        from: { lat: number; lng: number },
        to: { lat: number; lng: number },
      ): Promise<{ durationSec: number; distanceM: number } | null> => {
        if (!mapboxToken) return null
        try {
          const url =
            `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
            `${from.lng},${from.lat};${to.lng},${to.lat}` +
            `?access_token=${encodeURIComponent(mapboxToken)}&overview=false&geometries=geojson`
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) {
            const body = await res.text().catch(() => "")
            console.warn(`[itinerary] mapbox ${profile} ${res.status}: ${body.slice(0, 200)}`)
            return null
          }
          const data = await res.json() as { routes?: Array<{ duration: number; distance: number }> }
          const r = data?.routes?.[0]
          if (!r) return null
          return { durationSec: r.duration, distanceM: r.distance }
        } catch (err) {
          console.warn(`[itinerary] mapbox ${profile} fetch failed:`, err)
          return null
        }
      }
      const computeLeg = async (
        originGeo: string,
        destGeo: string,
        fromLabel: string | null,
        toLabel: string | null,
      ): Promise<TravelLeg> => {
        const base = { fromLabel, toLabel }
        const from = parseLatLng(originGeo)
        const to = parseLatLng(destGeo)
        if (!from || !to) {
          return { driveMin: null, walkMin: null, transitMin: null, distanceKm: null, reason: "no_geocode", ...base }
        }
        if (!mapboxToken) {
          return { driveMin: null, walkMin: null, transitMin: null, distanceKm: null, reason: "no_token", ...base }
        }
        // Same point → no travel at all.
        if (Math.abs(from.lat - to.lat) < 1e-5 && Math.abs(from.lng - to.lng) < 1e-5) {
          return { driveMin: 0, walkMin: 0, transitMin: null, distanceKm: 0, reason: "ok", ...base }
        }
        const [drive, walk] = await Promise.all([
          fetchProfile("driving", from, to),
          fetchProfile("walking", from, to),
        ])
        return {
          driveMin: drive ? Math.max(1, Math.round(drive.durationSec / 60)) : null,
          walkMin: walk ? Math.max(1, Math.round(walk.durationSec / 60)) : null,
          // Mapbox doesn't support public transit — explicitly null so the UI
          // shows "—" instead of fabricating a number.
          transitMin: null,
          distanceKm: drive ? Math.round((drive.distanceM / 1000) * 10) / 10 : null,
          reason: "ok",
          ...base,
        }
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
          const finalDuration = s.durationMinutes && s.durationMinutes > 0 ? s.durationMinutes : dur

          // Palisis often returns end_time === start_time when the underlying
          // catalogue row doesn't carry a real duration. In that case we
          // derive the real end from `finalDuration` so the timeline math
          // (and the "Confirmed: 10:00 - 11:30" label) is meaningful.
          const slotStartMin = toMinutes(chosen.startTime)
          // LiveSlot.endTime is nullable when Palisis didn't return one —
          // treat that as "derive it" rather than passing null into toMinutes.
          const slotEndMin = chosen.endTime ? toMinutes(chosen.endTime) : -1
          const needsDerivedEnd =
            !chosen.endTime || slotEndMin < 0 || slotEndMin <= slotStartMin || slotEndMin - slotStartMin < finalDuration * 0.5
          const endTime = needsDerivedEnd ? addMinutes(chosen.startTime, finalDuration) : chosen.endTime!

          const travelMinutes = parseTravelMinutes(s.travelToNext)
          const details = tripDetailsById.get(s.tripId)

          return {
            ...s,
            time: chosen.startTime,
            endTime,
            priceFrom: chosen.totalPriceDisplay ?? chosen.totalPrice ?? null,
            spacesRemaining: chosen.spacesRemaining,
            durationMinutes: finalDuration,
            travelMinutes,
            tripHighlights: details?.highlights ?? [],
            tripNotes: details?.notes ?? "",
            tripCity: details?.city ?? "",
            tripLocation: details?.location ?? "",
          }
        })
        // Final pass: sort chronologically so the timeline stays coherent even
        // if the AI's ordering got tweaked by snapping.
        .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))

      // ─── Attach real travel times between consecutive stops via Mapbox ───
      // For each consecutive pair we look up the END geocode of the current
      // stop and the DEPARTURE geocode of the next, then hit the Directions
      // API. Results overwrite the AI's hallucinated `travelToNext` text and
      // also drive a structured `travelLeg` object the UI renders verbatim
      // (driving / walking / distance / transit). Missing geocodes or token
      // → travelLeg with all null fields → UI shows "—".
      await Promise.all(
        reconciledSteps.map(async (step, i) => {
          const next = reconciledSteps[i + 1]
          if (!next) return
          const curDetails = tripDetailsById.get(step.tripId)
          const nextDetails = tripDetailsById.get(next.tripId)
          const fromLabel = (curDetails?.location || curDetails?.city || "").trim() || null
          const toLabel = (nextDetails?.location || nextDetails?.city || "").trim() || null
          const leg = await computeLeg(
            curDetails?.endGeo ?? "",
            nextDetails?.departureGeo ?? "",
            fromLabel,
            toLabel,
          )
          ;(step as typeof step & { travelLeg: TravelLeg }).travelLeg = leg
          if (leg.driveMin !== null) {
            step.travelMinutes = leg.driveMin
            const km = leg.distanceKm
            step.travelToNext = km !== null
              ? `${leg.driveMin} min by car · ${km} km`
              : `${leg.driveMin} min by car`
          } else {
            // No real data — drop the AI's fabricated string entirely so the
            // UI falls back to "—" labels instead of a fake "15 min".
            step.travelMinutes = 0
            step.travelToNext = null
          }

          // ─── Dynamic break-duration adjustment ──────────────────────────
          // The AI proposes a break length up front, but until we know the
          // real travel time we can't tell if it actually fits. Recompute
          // it from the gap between this step's end and the next step's
          // confirmed start, subtracting travel + a 5-minute arrival
          // buffer. Three outcomes:
          //   gap < travel+15        → no time for a break, drop it.
          //   gap ≈ travel           → keep it short (15 min min).
          //   gap > travel + break   → expand to fill so the timeline
          //                            doesn't show awkward dead time.
          const brk = step.breakAfter
          if (brk && brk.type !== "none" && leg.driveMin !== null) {
            const endMin = toMinutes(step.endTime || step.time)
            const nextStartMin = toMinutes(next.time)
            const gap = nextStartMin - endMin
            const buffer = 5
            const available = gap - leg.driveMin - buffer
            if (available < 15) {
              // No room for a meaningful break — silently drop it. The
              // timeline already shows the travel block + ETA.
              step.breakAfter = { ...brk, type: "none" }
            } else {
              const requested = brk.durationMinutes ?? 0
              // Snap to the nearest 5 minutes for tidiness and clamp into
              // [15, available] so the break + travel + buffer = gap.
              const target = Math.max(15, Math.min(available, requested > 0 ? requested : available))
              const snapped = Math.round(target / 5) * 5
              step.breakAfter = { ...brk, durationMinutes: snapped }
            }
          }
        }),
      )

      // ─── Enforce "include every cart trip" ───
      // The prompt asks the model to include every cart trip, but we don't
      // trust prose alone — if the AI silently dropped a bookable trip we
      // append it here using its earliest non-conflicting slot. Dropped
      // trips are also surfaced in the response so the UI can flag them
      // even when we can't auto-recover.
      const presentTripIds = new Set(reconciledSteps.map((s) => s.tripId))
      const droppedByAi: { tripId: string; title: string; reason: string }[] = []
      for (const a of bookable) {
        if (presentTripIds.has(a.trip.id)) continue
        // Try to find a slot whose key isn't already used by another step.
        const fallback = a.slots.find((sl) => !takenKeys.has(sl.componentKey)) ?? a.slots[0]
        if (!fallback) {
          droppedByAi.push({ tripId: a.trip.id, title: a.trip.title, reason: "no live slots available" })
          continue
        }
        takenKeys.add(fallback.componentKey)
        const dur = parseDurationMinutes(a.trip.duration, defaultActivityDuration)
        const slotStartMin = toMinutes(fallback.startTime)
        const slotEndMin = fallback.endTime ? toMinutes(fallback.endTime) : -1
        const needsDerivedEnd = !fallback.endTime || slotEndMin < 0 || slotEndMin <= slotStartMin
        const endTime = needsDerivedEnd ? addMinutes(fallback.startTime, dur) : fallback.endTime!
        const details = tripDetailsById.get(a.trip.id)
        // Cast to the shape that matches existing reconciledSteps entries.
        const appended = {
          tripId: a.trip.id,
          title: a.trip.title,
          time: fallback.startTime,
          endTime,
          priceFrom: fallback.totalPriceDisplay ?? fallback.totalPrice ?? null,
          spacesRemaining: fallback.spacesRemaining,
          durationMinutes: dur,
          travelMinutes: 0,
          travelToNext: null,
          tripHighlights: details?.highlights ?? [],
          tripNotes: details?.notes ?? "",
          tripCity: details?.city ?? "",
          tripLocation: details?.location ?? "",
          breakAfter: null,
        } as unknown as typeof reconciledSteps[number]
        reconciledSteps.push(appended)
        droppedByAi.push({ tripId: a.trip.id, title: a.trip.title, reason: "auto-added — AI omitted" })
      }
      // Re-sort if we appended anything so the timeline stays chronological.
      if (droppedByAi.length > 0) {
        reconciledSteps.sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      }

      // Apply admin widget toggles: if disabled, force-hide regardless of
      // what the AI recommended.
      const carSuggestion = showCarWidget
        ? output.carSuggestion
        : { ...output.carSuggestion, recommended: false }
      const hotelSuggestion = showHotelWidget
        ? output.hotelSuggestion
        : { ...output.hotelSuggestion, recommended: false }

      // Roll the "dropped to fit the visitor's chosen duration" trips
      // into unavailableTrips so the existing partial-success chat path
      // names them. They aren't unavailable per se (Palisis had slots) —
      // the visitor's prefs simply couldn't fit them. The conflict
      // payload below carries the structured prefs-change options.
      const combinedUnavailable = [
        ...unavailableTrips,
        ...(conflictPayload?.droppedForFit.map((d) => ({
          tripId: d.tripId,
          title: d.title,
          reason: "DOES_NOT_FIT_DURATION",
          suggestedDates: [] as string[],
        })) ?? []),
      ]
      return Response.json({
        ...output,
        carSuggestion,
        hotelSuggestion,
        steps: reconciledSteps,
        visitDate,
        unavailableTrips: combinedUnavailable,
        alternativeDates,
        scanDays: SCAN_DAYS,
        widgets: { showCarWidget, showHotelWidget },
        autoFilledTrips: droppedByAi,
        conflict: conflictPayload,
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
