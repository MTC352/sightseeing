import { dbGetSettings, dbGetTrip } from "@/lib/db/queries"
import { getRainyDateSet } from "@/lib/weather"
import { query } from "@/lib/db"
import {
  getTourCMSConfig,
  showTourDatesAndDeals,
  checkAvailability,
  type DepartureDate,
  type AvailabilityComponent,
} from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { parseHumanDuration } from "@/lib/parse-duration"
import {
  buildSchedule,
  deterministicOrder,
  HARD_MAX_STOPS,
  LATE_NIGHT_SPILL_MIN,
  type CandidateTrip,
  type ComputeLeg,
} from "@/lib/itinerary/scheduler"
import { selectAndOrder, narrate, type CompactCandidate } from "@/lib/itinerary/ai"
import { logError } from "@/lib/error-log"

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
  // NO heuristic guessing. A trip's Palisis tour_id comes ONLY from its
  // published DB row (mirrors /api/planner). If the trip isn't in our DB or
  // isn't published, it isn't plannable — we return null rather than
  // fabricating an id by stripping the "tcms_" prefix.
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

/** Is a datesndeals DATE row bookable at the date level (ignoring whether it
 *  carries a concrete start_time)? "MULTI" tours come back with bookable dates
 *  but no per-date time — the real times only exist in checkAvailability. */
function isDepartureDateBookable(d: DepartureDate): boolean {
  if (!d.start_date) return false
  if (d.status && /cancel/i.test(d.status)) return false
  const raw = d.spaces_remaining
  if (raw && raw !== "UNLIMITED" && parseInt(raw, 10) <= 0) return false
  return true
}

/** Convert a checkAvailability component (real-time timeslot) into LiveSlot. */
function shapeSlotFromComponent(c: AvailabilityComponent, fallbackDate: string): LiveSlot | null {
  if (!c.start_time) return null
  const raw = c.spaces_remaining
  if (raw && raw !== "UNLIMITED" && parseInt(raw, 10) <= 0) return null
  const date = String(c.start_date || fallbackDate)
  const startTime = String(c.start_time).slice(0, 5)
  const priceDisplay = decodeHtmlEntities(c.total_price_display ?? null)
  const priceRaw = decodeHtmlEntities(c.total_price ?? null)
  return {
    date,
    startTime,
    endTime: c.end_time ? String(c.end_time).slice(0, 5) : null,
    totalPrice: priceRaw,
    totalPriceDisplay: priceDisplay,
    spacesRemaining: raw ?? null,
    componentKey: c.component_key || `${date}T${startTime}`,
  }
}

function sortSlots(slots: LiveSlot[]): LiveSlot[] {
  return [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

/** Duration in minutes — delegates to the shared parseHumanDuration helper
 *  so the itinerary builder and any future callers stay in sync. */
function parseDurationMinutes(raw: string | undefined, fallback: number): number {
  return parseHumanDuration(raw, fallback)
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

/** Run an async mapper over `items` with a bounded number of in-flight
 *  promises, preserving input order. The itinerary builder fans out one
 *  TourCMS availability call per cart trip; an unbounded Promise.all would
 *  burst 5+ simultaneous requests and trip TourCMS rate limits, so we cap how
 *  many run at once. The mapper is responsible for its own error handling. */
const TOURCMS_FANOUT_CONCURRENCY = 3
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  const pool = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker,
  )
  await Promise.all(pool)
  return results
}

interface IncomingPreferences {
  group?: string
  interests?: string[]
  duration?: string
  budget?: string
  adults?: number
  children?: number
  dayCount?: number
  /** Free-form constraints from chat/chips, e.g. "no-early-morning". */
  exclusions?: string[]
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
  schedulePrune()
  const limit = rateLimit(req, { limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return limit.response

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
      exclusions: Array.isArray(preferences?.exclusions)
        ? preferences!.exclusions!.filter((e): e is string => typeof e === "string").slice(0, 10)
        : [],
    }
    const isMultiDay = prefs.duration === "multi-day" && prefs.dayCount >= 2
    const exclusions = prefs.exclusions
    // Derive the early-morning constraint from explicit exclusions OR a
    // natural-language hint in the interests list ("no early morning").
    const excludeEarlyMorning =
      exclusions.some((e) => /no[-\s]?early|sleep[-\s]?in|late[-\s]?start/i.test(e)) ||
      prefs.interests.some((i) => /no[-\s]?early|sleep[-\s]?in|late[-\s]?start/i.test(i))
    // Meals are included by default; the user can opt OUT with an explicit
    // "no lunch / no meal breaks" exclusion (chip or chat).
    const excludeMeals =
      exclusions.some((e) => /no[-\s]?(lunch|meal|dinner|food[-\s]?break)|skip[-\s]?(lunch|meal|food)/i.test(e)) ||
      prefs.interests.some((i) => /no[-\s]?(lunch|meal)[-\s]?break|skip[-\s]?(lunch|meal)/i.test(i))
    // OPT-IN accessibility: only when the visitor explicitly asks for step-free /
    // low-mobility planning do we hard-drop physically demanding trips.
    const excludeInaccessible =
      exclusions.some((e) => /wheelchair|accessib|step[-\s]?free|low[-\s]?mobility|no[-\s]?stairs|mobility/i.test(e)) ||
      prefs.interests.some((i) => /wheelchair|accessib|step[-\s]?free|low[-\s]?mobility/i.test(i))
    // Party size drives availability fit only (drop slots without enough spaces).
    const partySize = prefs.adults + prefs.children

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

    /** Per-trip diagnostic record — the audit trail for EVERY build. Captures
     *  whether each TourCMS endpoint was actually called and what it returned,
     *  so /admin/logs can answer "did trip X make the API call, and what came
     *  back?" without guesswork. */
    type TripDiag = {
      tripId: string
      title: string
      palisisId: string | null
      checkavail: { called: boolean; ok?: boolean; components?: number; usable?: number; error?: string }
      datesndeals: { called: boolean; ok?: boolean; dates?: number; error?: string }
      visitSlots: number
      suggestedDates: number
      source: "checkavail" | "datesndeals" | "none"
      status: string
    }

    type TripWindow = TripAvailability & {
      /** All bookable slots in the window, grouped by date */
      slotsByDate: Map<string, LiveSlot[]>
      /** Diagnostic trace persisted on every build */
      diag: TripDiag
    }

    const availability: TripWindow[] = await mapWithConcurrency(
      trips,
      TOURCMS_FANOUT_CONCURRENCY,
      async (trip, i): Promise<TripWindow> => {
        const palisisId = palisisIds[i]
        const diag: TripDiag = {
          tripId: trip.id,
          title: trip.title ?? trip.id,
          palisisId,
          checkavail: { called: false },
          datesndeals: { called: false },
          visitSlots: 0,
          suggestedDates: 0,
          source: "none",
          status: "PENDING",
        }
        if (!palisisId) {
          diag.status = "NO_PALISIS_LINK"
          return { trip, palisisId: null, slots: [], slotsByDate: new Map(), status: "NO_PALISIS_LINK", diag }
        }

        const slotsByDate = new Map<string, LiveSlot[]>()

        // ── (A) PRIMARY — datesndeals over the full 21-day window ────────────
        // One cheap call returns every bookable DATE+timeslot in the window.
        // This is the SAME endpoint that powers the public trip-page
        // availability card (/api/availability), so it gives exact parity with
        // what the customer sees on /trip/[id] — and it serves BOTH the chosen
        // date's concrete timeslots AND the next-21-days alternative-date scan
        // from a single response. Only the date + minimal slot fields are parsed
        // (shapeSlotFromDeparture), keeping the payload lean.
        let ddError: string | null = null
        try {
          diag.datesndeals.called = true
          const res = await showTourDatesAndDeals(config, palisisId, {
            startdate_start: visitDate,
            startdate_end: windowEnd,
          })
          if (res.ok) {
            diag.datesndeals.ok = true
            diag.datesndeals.dates = res.dates.length
            const shaped = res.dates
              .map(shapeSlotFromDeparture)
              .filter((s): s is LiveSlot => s !== null)
            for (const s of shaped) {
              const arr = slotsByDate.get(s.date) ?? []
              arr.push(s)
              slotsByDate.set(s.date, arr)
            }
            // Seed bookable "MULTI" dates (bookable DATE, no concrete time) as
            // empty buckets so they still surface as alternative-date chips.
            for (const d of res.dates) {
              if (isDepartureDateBookable(d)) {
                const key = String(d.start_date)
                if (!slotsByDate.has(key)) slotsByDate.set(key, [])
              }
            }
            for (const [k, arr] of slotsByDate) slotsByDate.set(k, sortSlots(arr))
          } else {
            diag.datesndeals.ok = false
            diag.datesndeals.error = res.error
            ddError = res.error ?? "datesndeals failed"
          }
        } catch (e) {
          diag.datesndeals.ok = false
          diag.datesndeals.error = String(e)
          ddError = String(e)
        }

        let visitSlots: LiveSlot[] = slotsByDate.get(visitDate) ?? []
        if (visitSlots.length > 0) diag.source = "datesndeals"

        // ── (B) SELECTED-DATE FALLBACK — checkavail (real-time) ──────────────
        // Only fires when the bulk feed gave NO concrete slot for the chosen
        // date — typically a "MULTI"/recurring tour that lists the date as
        // bookable but without a per-date start_time. checkavail is the
        // real-time timeslot endpoint, BUT it only returns <component> rows once
        // a rate quantity (r{rate_id}=qty) is supplied, so for ordinary
        // fixed-departure tours it can legitimately come back empty — hence it
        // is a best-effort SUPPLEMENT, not the primary source. The primary
        // source is datesndeals above, which is the SAME endpoint that powers
        // the public trip-page availability card (/api/availability), giving us
        // exact parity with what the customer sees on /trip/[id].
        let caError: string | null = null
        if (visitSlots.length === 0) {
          try {
            diag.checkavail.called = true
            const avail = await checkAvailability(config, palisisId, {
              date: visitDate,
              show_pickups: "0",
            })
            if (avail.ok) {
              diag.checkavail.ok = true
              diag.checkavail.components = avail.components.length
              const comp = avail.components
                .map((c) => shapeSlotFromComponent(c, visitDate))
                .filter((s): s is LiveSlot => s !== null)
              const usable = sortSlots(comp)
              diag.checkavail.usable = usable.length
              if (usable.length > 0) {
                visitSlots = usable
                slotsByDate.set(visitDate, visitSlots)
                diag.source = "checkavail"
              }
            } else {
              diag.checkavail.ok = false
              diag.checkavail.error = avail.error
              caError = avail.error ?? "checkavail failed"
            }
          } catch (e) {
            diag.checkavail.ok = false
            diag.checkavail.error = String(e)
            caError = String(e)
          }
        }

        diag.visitSlots = visitSlots.length
        diag.suggestedDates = [...slotsByDate.keys()].filter(
          (d) => d !== visitDate && d >= visitDate && d <= windowEnd,
        ).length

        // ── (D) CLASSIFY ────────────────────────────────────────────────────
        if (visitSlots.length > 0) {
          diag.status = "OK"
          return { trip, palisisId, slots: visitSlots, slotsByDate, status: "OK", diag }
        }
        // No selected-date slots. If EITHER live call failed we cannot honestly
        // claim "no availability" — surface a retryable TOURCMS_ERROR (keeping
        // any datesndeals suggestions). Only when BOTH calls succeeded and the
        // date is genuinely empty do we report a definitive NO_SLOTS.
        if (caError || ddError) {
          diag.status = "TOURCMS_ERROR"
          return {
            trip, palisisId, slots: [], slotsByDate, status: "TOURCMS_ERROR",
            error: caError ?? ddError ?? "live availability failed", diag,
          }
        }
        diag.status = "NO_SLOTS"
        return { trip, palisisId, slots: [], slotsByDate, status: "NO_SLOTS", diag }
      },
    )

    const bookable = availability.filter((a) => a.status === "OK")
    const unavailable = availability.filter((a) => a.status !== "OK")

    const erroredTrips = availability.filter((a) => a.status === "TOURCMS_ERROR")

    // COMPREHENSIVE BUILD LOG — persist EVERY itinerary build to /admin/logs so
    // we have a complete audit trail for debugging "why didn't trip X get
    // data?". The per-trip diag records, for each trip, whether checkavail and
    // datesndeals were actually called and exactly what each returned (counts /
    // errors), plus the final classification. Logged at warn when any live call
    // failed, otherwise info.
    await logError({
      source: "itinerary",
      level: erroredTrips.length > 0 ? "warn" : "info",
      message: `Itinerary build ${visitDate}: ${bookable.length}/${trips.length} bookable, ${erroredTrips.length} API error(s)`,
      context: {
        visitDate,
        scanDays: SCAN_DAYS,
        tripCount: trips.length,
        bookable: bookable.length,
        trips: availability.map((a) => a.diag),
      },
    })

    // Also surface each live-availability FAILURE as its own error-level row so
    // it is easy to filter. NO_SLOTS / NO_PALISIS_LINK are legitimate "no data"
    // states (not errors) and are captured by the build log above only.
    if (erroredTrips.length > 0) {
      await Promise.all(
        erroredTrips.map((a) =>
          logError({
            source: "itinerary",
            level: "error",
            message: `TourCMS availability failed for trip ${a.trip.id} (${a.trip.title}): ${a.error ?? "unknown error"}`,
            context: {
              tripId: a.trip.id,
              palisisId: a.palisisId,
              visitDate,
              scanDays: SCAN_DAYS,
              diag: a.diag,
            },
          }),
        ),
      )
    }

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
      // Party-size parity with the scheduler: a date only counts a trip when it
      // has at least one slot that can seat the whole group. A MULTI/empty
      // bucket (bookable date, no concrete per-time seat data) counts as
      // available — we can't disprove it (mirrors scheduler.fitsParty's
      // unparseable→pass). Without this filter the chips over-report
      // ("3 trips open") vs what a rebuild can actually schedule.
      const slotFitsParty = (s: { spacesRemaining: string | null }) => {
        const r = (s.spacesRemaining ?? "").toString().trim().toUpperCase()
        if (r === "" || r === "UNLIMITED") return true
        const n = parseInt(r, 10)
        return Number.isNaN(n) ? true : n >= partySize
      }
      const dateCounts = new Map<string, number>()
      for (const a of availability) {
        for (const [d, slots] of a.slotsByDate) {
          if (d <= visitDate || d > windowEnd) continue
          const fits = slots.length === 0 || slots.some(slotFitsParty)
          if (!fits) continue
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
    // DB-managed key first, env as fallback — keep this precedence identical to
    // the planner route. The env key may be stale/invalid while the admin-managed
    // DB key is the source of truth; env-first caused intermittent 401s here.
    const anthropicKey =
      ((allSettings.apiKeys as Record<string, string> | undefined)?.anthropic ?? "").trim() ||
      (process.env.ANTHROPIC_API_KEY ?? "").trim()
    const dayStartTime = String(settings.dayStartTime ?? "09:00")
    const dayEndTime = String(settings.dayEndTime ?? "21:00")
    const bufferTimeBetweenStops = Number(settings.bufferTimeBetweenStops ?? 30)
    const maxStopsPerDay = Number(settings.maxStopsPerDay ?? 5)
    const defaultActivityDuration = Number(settings.defaultActivityDuration ?? 90)
    const autoInsertMealBreaks = Boolean(settings.autoInsertMealBreaks ?? true)
    const mealBreakDuration = Number(settings.mealBreakDuration ?? 60)
    const lunchBreakTime = String(settings.lunchBreakTime ?? "12:30")
    const dinnerBreakTime = String(settings.dinnerBreakTime ?? "19:00")
    // Admin-managed pace + map provider (see lib/itinerary/scheduler.ts).
    const pace = (["relaxed", "balanced", "packed"].includes(String(settings.pace))
      ? String(settings.pace)
      : "balanced") as "relaxed" | "balanced" | "packed"
    const mapProvider = settings.mapProvider === "google" ? "google" : "mapbox"

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
    } else if (prefs.duration === "full-day") {
      // Full-day is the visitor's MAX time option — the WHOLE 24h day PLUS the
      // scheduler's late-night spill — so the budget here matches the scheduler
      // window exactly (buildSchedule: dayEnd = 24*60 + LATE_NIGHT_SPILL_MIN)
      // and evening/late-night tours never trip a false "too many trips for
      // your duration" conflict.
      availableMinutes = 24 * 60 + LATE_NIGHT_SPILL_MIN
    } else {
      // Unset → fall back to the admin's configured daytime window.
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
    // Captured when full-day intent triggers the auto-drop branch (below)
    // so the preflight response can surface a friendly chat note.
    let autoDroppedForFullDay: Array<{ tripId: string; title: string; reason: string }> = []

    if (hasPlanConflict) {
      const overshootMin = Math.max(15, estimatedTotalMinutes - availableMinutes)
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

      /* AUTO-RESOLVE FOR COMMITTED FULL-DAY INTENT
         When the visitor has already explicitly chosen a full-day, single-
         date plan (prefs.duration === "full-day"), the only two sensible
         remaining options in this conflict are:
           a) "Spread across N days"   — directly violates their stated intent.
           b) "Drop the longest trips" — preserves their stated intent.
         Bouncing a multiple-choice card back at them in chat is friction:
         we already know the answer. Instead, skip the conflict entirely
         and let the pipeline proceed with the trimmed `bookable` (which
         the loop below already sliced down to the fitting subset). The
         client surfaces a friendly chat note about which trips were
         auto-dropped so the visitor knows what happened and can object. */
      const autoDropForFullDay = prefs.duration === "full-day" && droppedForFit.length > 0
      if (autoDropForFullDay) {
        autoDroppedForFullDay = droppedForFit
      }
      if (!autoDropForFullDay) {
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
          // Multi-day planning is hidden for now — the "spread across N days"
          // option is intentionally omitted so visitors can't re-enable a
          // multi-day duration through the conflict flow.
          {
            id: "drop-trips",
            label: "Drop the longest trips",
            description: `Remove ${dropCandidates.map((d) => `"${d.title}"`).join(" and ")} from your cart to fit the ${prefs.duration || "single-day"} window.`,
            action: "promptDrop" as const,
            candidateTripIds: dropCandidates.map((d) => d.id),
          },
        ],
      }
      } // end if (!autoDropForFullDay)

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
        // Populated only when the full-day auto-drop branch fired above;
        // empty array otherwise. Client renders a chat note from this.
        autoDroppedForFullDay,
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

    /* ─── HYBRID BUILD PIPELINE ───────────────────────────────────────────
       The AI (when a valid key is present) only SELECTS and ORDERS trips.
       All timing is locked deterministically by lib/itinerary/scheduler.ts,
       so the planner keeps producing realistic itineraries even when the AI
       key is invalid or absent. */
    try {
      // 1) Per-trip geo + highlights + notes for the scheduler & UI.
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

      // 2) Mapbox-backed travel-time helper (driving + walking). Returns a
      //    TravelLeg with null fields on any failure so the scheduler falls
      //    back to the static city matrix and the UI shows "—".
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
      // Optional Google Directions backend, selected by the admin map-provider
      // toggle. Falls back to Mapbox per-leg when unset or when a request fails,
      // so flipping the toggle never breaks travel times.
      const googleRoutingKey =
        (process.env.GOOGLE_MAPS_API_KEY ||
          process.env.GOOGLE_DIRECTIONS_API_KEY ||
          process.env.GOOGLE_PLACES_API_KEY ||
          (allSettings?.apiKeys as Record<string, string> | undefined)?.googleReviews ||
          "").trim()
      const useGoogleRouting = mapProvider === "google" && Boolean(googleRoutingKey)
      const parseLatLng = (s: string): { lat: number; lng: number } | null => {
        if (!s) return null
        const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s)
        if (!m) return null
        const lat = parseFloat(m[1]); const lng = parseFloat(m[2])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        return { lat, lng }
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
      const fetchGoogleProfile = async (
        profile: "driving" | "walking",
        from: { lat: number; lng: number },
        to: { lat: number; lng: number },
      ): Promise<{ durationSec: number; distanceM: number } | null> => {
        if (!googleRoutingKey) return null
        try {
          const url =
            `https://maps.googleapis.com/maps/api/directions/json` +
            `?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` +
            `&mode=${profile}&key=${encodeURIComponent(googleRoutingKey)}`
          const res = await fetch(url, { cache: "no-store" })
          if (!res.ok) {
            console.warn(`[itinerary] google ${profile} ${res.status}`)
            return null
          }
          const data = await res.json() as {
            status?: string
            routes?: Array<{ legs?: Array<{ duration?: { value: number }; distance?: { value: number } }> }>
          }
          if (data.status !== "OK") {
            console.warn(`[itinerary] google ${profile} status ${data.status}`)
            return null
          }
          const leg = data.routes?.[0]?.legs?.[0]
          if (!leg?.duration || !leg?.distance) return null
          return { durationSec: leg.duration.value, distanceM: leg.distance.value }
        } catch (err) {
          console.warn(`[itinerary] google ${profile} fetch failed:`, err)
          return null
        }
      }
      // Per-leg fetch: prefer Google when the admin selected it AND a key is
      // present, otherwise (or on Google failure) fall back to Mapbox.
      const fetchLeg = async (
        profile: "driving" | "walking",
        from: { lat: number; lng: number },
        to: { lat: number; lng: number },
      ): Promise<{ durationSec: number; distanceM: number } | null> => {
        if (useGoogleRouting) {
          const g = await fetchGoogleProfile(profile, from, to)
          if (g) return g
        }
        return fetchProfile(profile, from, to)
      }
      const computeLeg: ComputeLeg = async (originGeo, destGeo, fromLabel, toLabel) => {
        const base = { fromLabel, toLabel }
        const from = parseLatLng(originGeo)
        const to = parseLatLng(destGeo)
        if (!from || !to) {
          return { driveMin: null, walkMin: null, transitMin: null, distanceKm: null, reason: "no_geocode", ...base }
        }
        if (!mapboxToken && !useGoogleRouting) {
          return { driveMin: null, walkMin: null, transitMin: null, distanceKm: null, reason: "no_token", ...base }
        }
        if (Math.abs(from.lat - to.lat) < 1e-5 && Math.abs(from.lng - to.lng) < 1e-5) {
          return { driveMin: 0, walkMin: 0, transitMin: null, distanceKm: 0, reason: "ok", ...base }
        }
        const [drive, walk] = await Promise.all([
          fetchLeg("driving", from, to),
          fetchLeg("walking", from, to),
        ])
        return {
          driveMin: drive ? Math.max(1, Math.round(drive.durationSec / 60)) : null,
          walkMin: walk ? Math.max(1, Math.round(walk.durationSec / 60)) : null,
          transitMin: null,
          distanceKm: drive ? Math.round((drive.distanceM / 1000) * 10) / 10 : null,
          reason: "ok",
          ...base,
        }
      }

      // 3) Build candidate trips (the cart trips bookable on this date).
      const candidates: CandidateTrip[] = bookable.map((b) => {
        const enrich = enrichmentById.get(b.trip.id)
        const details = tripDetailsById.get(b.trip.id)
        const blurb = (enrich?.shortDescription ?? enrich?.description ?? "")
          .replace(/\s+/g, " ").trim()
        return {
          id: b.trip.id,
          title: b.trip.title,
          city: (details?.city || b.trip.city || "Luxembourg").trim() || "Luxembourg",
          category: b.trip.category || "",
          durationMin: parseDurationMinutes(b.trip.duration, defaultActivityDuration),
          slots: b.slots,
          tags: enrich?.tags ?? [],
          blurb,
          highlights: details?.highlights ?? [],
          notes: details?.notes ?? "",
          location: details?.location ?? "",
          departureGeo: details?.departureGeo ?? "",
          endGeo: details?.endGeo ?? "",
        }
      })

      const maxStopsEffective = Math.max(1, Math.min(HARD_MAX_STOPS, maxStopsPerDay))

      // 4) Ordering. AI selects/orders WHICH trips (token-lean, stepwise);
      //    deterministic interest/band ordering is the fallback.
      let ordered: CandidateTrip[] = deterministicOrder(candidates, prefs.interests)
      const aiOrder = await selectAndOrder({
        anthropicKey,
        model: itineraryModel,
        candidates: candidates.map((c): CompactCandidate => ({
          id: c.id,
          title: c.title,
          city: c.city,
          category: c.category,
          durationMin: c.durationMin,
          tags: c.tags,
          blurb: c.blurb,
          slotTimes: c.slots.map((s) => s.startTime),
        })),
        prefs: {
          group: prefs.group,
          interests: prefs.interests,
          duration: prefs.duration,
          budget: prefs.budget,
          dayCount: prefs.dayCount,
          exclusions,
        },
        visitDate,
        maxStops: maxStopsEffective,
      })
      if (aiOrder && aiOrder.length > 0) {
        const byId = new Map(candidates.map((c) => [c.id, c]))
        const picked = aiOrder.map((id) => byId.get(id)).filter((c): c is CandidateTrip => Boolean(c))
        const rest = ordered.filter((c) => !aiOrder.includes(c.id))
        ordered = [...picked, ...rest]
      }

      // 5) Deterministic timing — the single source of truth for slots,
      //    travel, buffers, early-arrival, lunch and the max-stops cap.
      const cityTravelMin = (fromCity: string, toCity: string): number => {
        const a = normCity(fromCity); const b = normCity(toCity)
        if (a === b) return 12
        return CITY_TRAVEL_MIN[a]?.[b] ?? CITY_TRAVEL_MIN[b]?.[a] ?? 15
      }
      // Deterministic weather signal — flag outdoor stops if the visit date is
      // forecast wet. Fail-soft: empty set when no key / fetch fails.
      let rainyDay = false
      try {
        rainyDay = (await getRainyDateSet()).has(visitDate)
      } catch {
        /* ignore — no weather flagging */
      }
      const { steps, dropped, notes: schedNotes } = await buildSchedule({
        candidates: ordered,
        config: {
          dayStartTime,
          dayEndTime,
          bufferTimeBetweenStops,
          maxStopsPerDay,
          defaultActivityDuration,
          autoInsertMealBreaks,
          mealBreakDuration,
          lunchBreakTime,
          dinnerBreakTime,
          travelMethodLabel,
          pace,
        },
        prefs: {
          duration: prefs.duration,
          dayCount: prefs.dayCount,
          isMultiDay,
          excludeEarlyMorning,
          excludeMeals,
          interests: prefs.interests,
          userMealBreaks,
          excludeInaccessible,
          partySize,
        },
        visitDate,
        addDays,
        computeLeg,
        cityTravelMin,
        weather: { rainyDay },
      })

      // 6) Narration. AI writes summary + tips over the LOCKED timeline;
      //    a deterministic fallback keeps the canvas populated when AI is down.
      const timelineText = steps.map((s, i) => {
        const brk = s.breakAfter && s.breakAfter.type !== "none"
          ? `\n     ↳ ${s.breakAfter.label} (~${s.breakAfter.durationMinutes} min) in ${s.breakAfter.location}`
          : ""
        const travel = s.travelToNext ? `\n     ↳ travel: ${s.travelToNext}` : ""
        return `${i + 1}. ${s.time}–${s.endTime} ${s.tripTitle} (${s.tripCity})${travel}${brk}`
      }).join("\n")

      let summary = ""
      let tips: string[] = []
      let carSuggestion: { recommended: boolean; reason: string } = { recommended: false, reason: "" }
      let hotelSuggestion: { recommended: boolean; area: string; reason: string } = { recommended: false, area: "", reason: "" }

      const narration = steps.length > 0
        ? await narrate({
            anthropicKey,
            model: itineraryModel,
            temperature: itineraryTemperature,
            maxOutputTokens: itineraryMaxTokens,
            timelineText,
            tipsInstructions,
            styleGuidance: prompt.slice(0, 1200),
          })
        : null

      if (narration) {
        summary = narration.summary
        tips = narration.tips
        carSuggestion = narration.carSuggestion
        hotelSuggestion = narration.hotelSuggestion
      } else {
        const cities = Array.from(new Set(steps.map((s) => s.tripCity).filter(Boolean)))
        const first = steps[0]
        const last = steps[steps.length - 1]
        const planLabel = isMultiDay
          ? `${prefs.dayCount}-day`
          : prefs.duration === "half-day"
            ? "half-day"
            : prefs.duration === "1-2h"
              ? "quick"
              : "full-day"
        if (steps.length === 0) {
          summary = "We couldn't fit any of your saved trips into the selected day window. Try extending your trip length, adding days, or picking another date."
        } else {
          summary = `A ${planLabel} plan with ${steps.length} stop${steps.length === 1 ? "" : "s"}${cities.length ? ` across ${cities.join(", ")}` : ""}, starting at ${first.time} and wrapping up by ${last.endTime}. Times are locked to live availability with realistic travel and a relaxed pace.`
        }
        const hasMeal = steps.some((s) => s.breakAfter?.type === "food")
        tips = [
          "Public transport is free across Luxembourg — buses, trams and trains.",
          "Aim to arrive 5–10 minutes before each start time.",
          hasMeal ? "A meal break is built into your day — no need to rush." : "Pack a snack; the schedule is tight between stops.",
          cities.length > 1 ? "Your day spans several towns — a rental car keeps travel relaxed." : "Everything's close together — comfy shoes are all you need.",
        ]
      }

      // Admin widget toggles (currently force-off).
      const carOut = showCarWidget ? carSuggestion : { ...carSuggestion, recommended: false }
      const hotelOut = showHotelWidget ? hotelSuggestion : { ...hotelSuggestion, recommended: false }

      // Roll trips that couldn't be timed into the unavailable list so the
      // existing partial-success chat path names them for the visitor.
      const combinedUnavailable = [
        ...unavailableTrips,
        ...(conflictPayload?.droppedForFit.map((d) => ({
          tripId: d.tripId, title: d.title, reason: "DOES_NOT_FIT_DURATION", suggestedDates: [] as string[],
        })) ?? []),
        ...dropped.map((d) => ({
          tripId: d.tripId, title: d.title, reason: d.reason, suggestedDates: [] as string[],
        })),
      ]

      void schedNotes // retained for future debugging; surfaced via summary

      return Response.json({
        steps,
        summary,
        tips,
        carSuggestion: carOut,
        hotelSuggestion: hotelOut,
        visitDate,
        unavailableTrips: combinedUnavailable,
        alternativeDates,
        scanDays: SCAN_DAYS,
        widgets: { showCarWidget, showHotelWidget },
        autoFilledTrips: [],
        conflict: conflictPayload,
      })
    } catch (buildErr) {
      console.error("[itinerary] build pipeline failed:", buildErr)
      await logError({
        source: "itinerary",
        level: "error",
        message: `Itinerary build pipeline failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`,
        context: { visitDate, tripIds: trips.map((t) => t.id) },
      })
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
    await logError({
      source: "itinerary",
      level: "error",
      message: `Itinerary request failed: ${err instanceof Error ? err.message : String(err)}`,
    })
    return Response.json({ error: "Failed to generate itinerary" }, { status: 500 })
  }
}
