/**
 * Shared whole-catalog availability scan for the planner.
 *
 * This is the SINGLE source of the planner's date-level availability truth. Both
 * the public client endpoint (`GET /api/planner/availability`) and the server-side
 * planner chat route (`POST /api/planner`) call `scanCatalogAvailability` so the
 * chat and the Trip Canvas can never disagree about what is bookable on a date.
 *
 * NOT a pure module — it imports the DB pool + TourCMS client, so it must NOT be
 * added to the unit-test pretest transpile list (that list only covers pure
 * decision helpers like availability-parity.ts). The pure precedence logic this
 * relies on lives in availability-parity.ts and is unit-tested there.
 *
 * Palisis/TourCMS is READ-ONLY here (datesndeals + checkavail only) — see replit.md.
 */
import { queryOne } from "@/lib/db"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals, checkAvailability } from "@/lib/tourcms"
import { isCheckavailComponentBookable, resolveSelectedDateFallback } from "@/lib/planner/availability-parity"

/** Per-trip availability over the planner scan window. */
export interface PlannerTripAvailability {
  /** Has at least one bookable departure ON the selected date (false when no date). */
  availableOnSelectedDate: boolean
  /** Bookable dates within the scan window (YYYY-MM-DD, ascending, deduped). */
  availableDates: string[]
  /**
   * True when availability for this trip could NOT be determined for the
   * selected date — i.e. the bulk datesndeals feed failed AND the real-time
   * checkavail fallback also failed/timed out. This is an ERROR state, NOT a
   * confident "not available": downstream (planner chat grounding) MUST treat
   * `unknown` as "couldn't confirm — try again", never as "no openings", so a
   * TourCMS incident can't make the AI confidently state a false negative.
   */
  unknown?: boolean
}

export interface PlannerAvailabilityResponse {
  /** The selected date echoed back (or null). */
  selectedDate: string | null
  /** Scan window actually used. */
  windowStart: string
  windowEnd: string
  windowDays: number
  trips: Record<string, PlannerTripAvailability>
}

const DEFAULT_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

// Cache keyed by "windowStart|windowEnd|selectedDate|party"
const _cache = new Map<string, { data: PlannerAvailabilityResponse; expiresAt: number }>()

/** Drop expired cache entries (called on each scan). */
export function pruneAvailabilityCache() {
  const now = Date.now()
  for (const [k, v] of _cache) if (now >= v.expiresAt) _cache.delete(k)
}

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

/** Run an async mapper over `items` with a bounded number of concurrent
 *  workers, so a whole-catalog availability scan never bursts the TourCMS rate
 *  limit (the per-trip fan-out is the main throttle pressure point). */
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

/** Read admin-configured scan window length (days); fall back to 30. */
export async function getWindowDays(): Promise<number> {
  try {
    const row = await queryOne<{ extra_config: Record<string, unknown> }>(
      `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`
    )
    const raw = row?.extra_config?.availabilityWindowDays
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10)
    if (Number.isFinite(n) && n >= 7 && n <= 120) return n
  } catch {
    // fall through to default
  }
  return DEFAULT_WINDOW_DAYS
}

export interface ScanOptions {
  /** Selected/visit date YYYY-MM-DD, or null for a window-only scan. */
  selectedDate: string | null
  /** Party size (adults + children). Clamped to 1..20. Default 1. */
  partySize?: number
  /** Override the admin scan-window length (days). Defaults to getWindowDays(). */
  windowDays?: number
}

/**
 * Whole-catalog date-level availability scan (the planner's authoritative truth).
 *
 * PASS 1 = bulk datesndeals per trip (cheap, date-level); PASS 2 = real-time
 * checkavail fallback ONLY for trips whose bulk feed missed the selected date.
 * Both TourCMS sources failing for a trip on the selected date → `unknown`
 * (never a confident closure). Results are cached 5 minutes per window+party.
 */
export async function scanCatalogAvailability(opts: ScanOptions): Promise<PlannerAvailabilityResponse> {
  pruneAvailabilityCache()

  const selectedDate =
    typeof opts.selectedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.selectedDate)
      ? opts.selectedDate
      : null
  const partyRaw = typeof opts.partySize === "number" ? opts.partySize : 1
  const partySize = Number.isFinite(partyRaw) ? Math.min(20, Math.max(1, Math.floor(partyRaw))) : 1

  const windowDays =
    typeof opts.windowDays === "number" && opts.windowDays >= 7 && opts.windowDays <= 120
      ? Math.floor(opts.windowDays)
      : await getWindowDays()
  const half = Math.floor(windowDays / 2)

  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const todayStr = toYMD(now)

  // Window selection rule (admin-configurable W = windowDays):
  //  - no date OR (selectedDate - today) < W/2  -> [today, today+W]
  //  - else                                     -> [selectedDate-W/2, selectedDate+W/2]
  let windowStart: string
  let windowEnd: string
  if (!selectedDate) {
    windowStart = todayStr
    windowEnd = toYMD(new Date(now.getTime() + windowDays * DAY_MS))
  } else {
    const sel = new Date(`${selectedDate}T00:00:00.000Z`)
    const daysUntil = Math.round((sel.getTime() - now.getTime()) / DAY_MS)
    if (daysUntil < half) {
      windowStart = todayStr
      windowEnd = toYMD(new Date(now.getTime() + windowDays * DAY_MS))
    } else {
      windowStart = toYMD(new Date(sel.getTime() - half * DAY_MS))
      windowEnd = toYMD(new Date(sel.getTime() + half * DAY_MS))
    }
    // Never scan before today.
    if (windowStart < todayStr) windowStart = todayStr
  }

  const cacheKey = `${windowStart}|${windowEnd}|${selectedDate ?? ""}|p${partySize}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  const [config, rows] = await Promise.all([
    getTourCMSConfig(),
    dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
  ])

  const tcmsTrips = (rows as { id: string }[]).filter((r) => r.id.startsWith("tcms_"))

  const trips: Record<string, PlannerTripAvailability> = {}

  if (config && tcmsTrips.length > 0) {
    // ── PASS 1: bulk datesndeals (cheap, one call per trip) ──────────────────
    // Establishes each trip's bookable DATES at the DATE level. Critically this
    // must NOT require a per-date start_time: "MULTI"/recurring tours (e.g. the
    // museum Combi-ticket with 30-min departures) come back from datesndeals as
    // bookable DATES with NO concrete start_time — the real times only live in
    // the real-time checkavail endpoint. Requiring start_time here is exactly
    // what made those trips falsely report "not available today/tomorrow" in the
    // planner chat while the booking widget showed full slots. Mirrors
    // isDepartureDateBookable in app/api/itinerary/route.ts.
    // A selected-date miss can come from TWO very different situations that must
    // NOT be conflated: (a) datesndeals SUCCEEDED but didn't list the date — a
    // genuine "probably not available, confirm via checkavail"; (b) datesndeals
    // FAILED — we know NOTHING yet, so a checkavail miss must end as `unknown`,
    // never a confident "not available". `ddFailed` carries that distinction.
    const needsSelectedFallback: { id: string; tourId: string; ddFailed: boolean }[] = []
    await mapPool(tcmsTrips, 6, async (row) => {
      const tourId = row.id.replace("tcms_", "")
      try {
        const { dates } = await showTourDatesAndDeals(config, tourId, {
          startdate_start: windowStart,
          startdate_end: windowEnd,
        })

        const bookable = new Set<string>()
        for (const d of dates) {
          if (!d.start_date) continue
          // Parity with the itinerary route (isDepartureDateBookable): a
          // cancelled departure is NOT bookable. Without this the planner
          // over-reports a date as "available" while the itinerary build drops
          // it — the "chat says N open, rebuild yields fewer" mismatch.
          if (d.status && /cancel/i.test(d.status)) continue
          const raw = d.spaces_remaining
          const unlimited = raw === "UNLIMITED"
          const spotsLeft = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
          // Party-size parity with the itinerary scheduler: a slot must hold
          // the whole group to count as bookable. "UNLIMITED" or unparseable
          // seat counts pass (mirrors scheduler.fitsParty).
          const seatsOk = unlimited || Number.isNaN(parseInt(raw ?? "", 10)) || spotsLeft >= partySize
          if (seatsOk) bookable.add(d.start_date)
        }

        trips[row.id] = {
          availableOnSelectedDate: selectedDate ? bookable.has(selectedDate) : false,
          availableDates: Array.from(bookable).sort(),
        }
        // Queue a real-time confirmation when a date is selected but the bulk
        // feed didn't list it. datesndeals UNDER-REPORTS (misses the very first
        // day, MULTI rows, transient incomplete payloads), so we must re-check
        // the authoritative checkavail endpoint — the same source the public
        // booking widget uses — before declaring the date unavailable.
        if (selectedDate && !bookable.has(selectedDate)) {
          needsSelectedFallback.push({ id: row.id, tourId, ddFailed: false })
        }
      } catch {
        // Bulk feed failed — still try the real-time fallback for the selected
        // date so a transient datesndeals error never produces a false
        // "not available". Seed an empty record so the id always exists.
        if (!trips[row.id]) {
          trips[row.id] = { availableOnSelectedDate: false, availableDates: [] }
        }
        if (selectedDate) needsSelectedFallback.push({ id: row.id, tourId, ddFailed: true })
      }
    })

    // ── PASS 2: selected-date checkavail fallback (real-time, authoritative) ──
    // Fires ONLY for trips whose bulk feed didn't list the selected date, so the
    // extra cost is bounded (≤1 checkavail per such trip). Bounded concurrency
    // avoids bursting TourCMS rate limits when many trips miss the date.
    // checkavail returns ZERO components unless a rate quantity (r1) is supplied,
    // so we pass the party size; TourCMS also omits slots that can't seat the
    // group, keeping the result seat-honest. This can ADD availability
    // (flip false→true). If BOTH sources failed for a trip we mark it `unknown`
    // so the chat says "couldn't confirm" instead of a false "no openings".
    if (selectedDate && needsSelectedFallback.length > 0) {
      await mapPool(needsSelectedFallback, 4, async (item) => {
        try {
          const avail = await checkAvailability(config, item.tourId, {
            date: selectedDate,
            show_pickups: "0",
            r1: partySize,
          })
          if (!avail.ok) {
            // checkavail errored. If datesndeals ALSO failed, availability is
            // genuinely unknown — flag it (never a confident "not available").
            if (item.ddFailed) {
              const cur = trips[item.id] ?? { availableOnSelectedDate: false, availableDates: [] }
              trips[item.id] = { ...cur, unknown: true }
            }
            return
          }
          // A checkavail component is bookable on the DATE without needing a
          // per-component start_time (MULTI/recurring tours omit it) — see
          // isCheckavailComponentBookable. Requiring start_time here was the
          // false-negative that undercounted "Available on Today".
          const bookable = avail.components.some((c) =>
            isCheckavailComponentBookable(c, partySize),
          )
          const verdict = resolveSelectedDateFallback({
            ddFailed: item.ddFailed,
            checkavail: { ok: true, bookable },
          })
          if (verdict === "available") {
            const cur = trips[item.id] ?? { availableOnSelectedDate: false, availableDates: [] }
            const dates = cur.availableDates.includes(selectedDate)
              ? cur.availableDates
              : [...cur.availableDates, selectedDate].sort()
            trips[item.id] = { availableOnSelectedDate: true, availableDates: dates }
          } else if (verdict === "unknown") {
            const cur = trips[item.id] ?? { availableOnSelectedDate: false, availableDates: [] }
            trips[item.id] = { ...cur, unknown: true }
          }
          // "not-available"/"no-change" → keep the datesndeals verdict (already
          // "not on date"); never flip to a confident closure off a failed call.
        } catch {
          // Real-time check threw → treat as an unusable checkavail. Dual failure
          // (datesndeals also failed) => unknown; otherwise leave the datesndeals
          // verdict as-is.
          const verdict = resolveSelectedDateFallback({ ddFailed: item.ddFailed, checkavail: null })
          if (verdict === "unknown") {
            const cur = trips[item.id] ?? { availableOnSelectedDate: false, availableDates: [] }
            trips[item.id] = { ...cur, unknown: true }
          }
        }
      })
    }
  }

  const data: PlannerAvailabilityResponse = {
    selectedDate,
    windowStart,
    windowEnd,
    windowDays,
    trips,
  }

  _cache.set(cacheKey, { data, expiresAt: Date.now() + 5 * 60_000 })

  return data
}
