import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export interface AvTimeslot {
  time: string
  spotsLeft: number
  spotsTotal: number
  rateName?: string   // variant name from DepartureDate.note, e.g. "Classical Tasting"
}

export interface AvSlotGroup {
  name: string           // variant name; "" = single unnamed group
  slots: AvTimeslot[]
}

export interface AvTripAvailability {
  /** Deduplicated flat list (best availability per time) — used for card chip preview */
  today: AvTimeslot[]
  tomorrow: AvTimeslot[]
  /** Grouped by variant name — used for the full-timeslot modal */
  todayGroups: AvSlotGroup[]
  tomorrowGroups: AvSlotGroup[]
  /** Earliest bookable date strictly AFTER tomorrow (YYYY-MM-DD), within the
   *  scan window. Non-date mode only — lets cards show "Next timeslot available
   *  on {date}" when there are no today/tomorrow slots. null when none found. */
  nextAvailableDate?: string | null
}

export type AvailabilityMap = Record<string, AvTripAvailability>

// ── Process-local cache: keyed by "startDate|endDate" ─────────────────────
const _cache = new Map<string, { data: AvailabilityMap; expiresAt: number }>()

// Per-key in-flight promises — deduplicates concurrent requests for the same
// cold cache key so N simultaneous callers share one TourCMS sweep instead of
// each launching their own.
const _inFlight = new Map<string, Promise<AvailabilityMap>>()

// Global one-at-a-time sweep guard — even sequential requests for different
// date keys can't launch concurrent sweeps. If a sweep is already running for
// any key, new cache-miss requests first try the DB before returning empty.
let _anySweepInProgress = false

// ── DB-backed cross-instance cache ─────────────────────────────────────────
// Persists sweep results so fresh process instances (cold starts, horizontal
// scale-out) can serve from DB instead of triggering a new TourCMS fan-out.
// Uses the existing `integrations` table: key = availability_cache:{cacheKey},
// value = expiresAt timestamp (ms), meta = AvailabilityMap as JSONB.

const DB_AVAIL_KEY_PREFIX = "availability_cache:"

async function dbGetAvailability(
  cacheKey: string,
): Promise<{ data: AvailabilityMap; expiresAt: number } | null> {
  try {
    const { queryOne } = await import("@/lib/db")
    const row = await queryOne<{ value: string; meta: unknown }>(
      `SELECT value, meta FROM integrations WHERE key = $1`,
      [`${DB_AVAIL_KEY_PREFIX}${cacheKey}`],
    )
    if (!row?.meta) return null
    const expiresAt = parseInt(row.value as string, 10)
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) return null
    return { data: row.meta as AvailabilityMap, expiresAt }
  } catch {
    return null
  }
}

async function dbPersistAvailability(
  cacheKey: string,
  data: AvailabilityMap,
  ttlMs: number,
): Promise<void> {
  try {
    const { query } = await import("@/lib/db")
    const expiresAt = Date.now() + ttlMs
    await query(
      `INSERT INTO integrations (key, label, value, meta, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, meta = EXCLUDED.meta, updated_at = NOW()`,
      [
        `${DB_AVAIL_KEY_PREFIX}${cacheKey}`,
        "Availability Cache (internal)",
        String(expiresAt),
        JSON.stringify(data),
      ],
    )
  } catch {
    // Fail-soft: if the write fails, other instances don't get the warm data
    // for this cycle, but correctness is not affected.
  }
}

function pruneAvailabilityCache() {
  const now = Date.now()
  for (const [key, entry] of _cache) {
    if (now >= entry.expiresAt) _cache.delete(key)
  }
}

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]
}

/** Group a raw slot array by rateName, preserving insertion order. */
function buildGroups(slots: AvTimeslot[]): AvSlotGroup[] {
  const map = new Map<string, AvTimeslot[]>()
  for (const s of slots) {
    const key = s.rateName ?? ""
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, slots: items }))
}

/** Deduplicate a slot list by time, keeping the entry with the highest spotsLeft. */
function deduplicateByTime(slots: AvTimeslot[]): AvTimeslot[] {
  const best = new Map<string, AvTimeslot>()
  for (const s of slots) {
    const existing = best.get(s.time)
    if (!existing || s.spotsLeft > existing.spotsLeft) {
      best.set(s.time, s)
    }
  }
  return Array.from(best.values()).sort((a, b) => a.time.localeCompare(b.time))
}

export async function GET(req: Request) {
  schedulePrune()
  pruneAvailabilityCache()
  const rl = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = new URL(req.url)
  const rawDate = (searchParams.get("date") ?? "").trim()

  const now         = new Date()
  const todayStr    = toYMD(now)
  const tomorrowStr = toYMD(new Date(now.getTime() + 86_400_000))

  // Non-date mode scans a 30-day window (not just today/tomorrow) so we can
  // surface the next bookable date for trips with no today/tomorrow slots.
  const horizonStr = toYMD(new Date(now.getTime() + 30 * 86_400_000))

  // ── Validate + clamp the attacker-controlled `date` param ─────────────────
  // This endpoint is public and unauthenticated. The `date` value feeds both
  // the in-process cache key AND the upstream TourCMS date range, so an
  // unvalidated value lets a caller bust the cache with unlimited unique /
  // malformed strings and force a fresh ~18-call fan-out on every request.
  // We accept ONLY a real calendar date in YYYY-MM-DD form within the scan
  // window [today, today+30d]; anything else is rejected up front. This bounds
  // the number of distinct cache keys to the valid date window so repeated
  // requests collapse onto the cache instead of amplifying upstream calls.
  let dateParam = ""
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 })
    }
    const parsed = new Date(`${rawDate}T00:00:00Z`)
    // Reject non-real dates (e.g. 2026-02-31 rolls over) by round-tripping.
    if (isNaN(parsed.getTime()) || toYMD(parsed) !== rawDate) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 })
    }
    if (rawDate < todayStr || rawDate > horizonStr) {
      return NextResponse.json(
        { error: "Date out of range. Only the next 30 days are available." },
        { status: 400 },
      )
    }
    dateParam = rawDate
  }

  const startDate = dateParam || todayStr
  const endDate   = dateParam || horizonStr
  const dateMode  = dateParam !== ""
  const ttlMs     = dateMode ? 60_000 : 5 * 60_000

  const cacheKey = `${startDate}|${endDate}`

  // ── 1. Process-local cache (fastest path) ─────────────────────────────────
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  // ── 2. In-flight dedup: join an ongoing sweep for the same key ─────────────
  const existing = _inFlight.get(cacheKey)
  if (existing) {
    return NextResponse.json(await existing)
  }

  // ── 3. DB cache: check for a fresh result written by another instance ───────
  // This is the primary cross-instance protection. A cold instance that finds
  // fresh DB data serves it immediately without triggering a new TourCMS sweep.
  const dbEntry = await dbGetAvailability(cacheKey)
  if (dbEntry) {
    _cache.set(cacheKey, dbEntry)     // warm the process-local cache
    return NextResponse.json(dbEntry.data)
  }

  // ── 4. Global one-at-a-time sweep guard ────────────────────────────────────
  // If any sweep is currently running (for a different key), return empty rather
  // than stacking another fan-out. The caller gets `{}` and can retry; the
  // running sweep will write its result to both the process-local cache and DB,
  // so the next request for any key benefits from the DB guard above.
  if (_anySweepInProgress) {
    return NextResponse.json({})
  }

  // ── 5. Run a sweep — at most one at a time globally ────────────────────────
  _anySweepInProgress = true
  const sweepPromise: Promise<AvailabilityMap> = (async () => {
    try {
      const [config, rows] = await Promise.all([
        getTourCMSConfig(),
        dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
      ])

      const tcmsTrips = (rows as { id: string }[]).filter(r => r.id.startsWith("tcms_"))

      if (!config || tcmsTrips.length === 0) {
        return {}
      }

      const result: AvailabilityMap = {}

      await Promise.all(
        tcmsTrips.map(async (row) => {
          const tourId = row.id.replace("tcms_", "")
          try {
            const { dates } = await showTourDatesAndDeals(config, tourId, {
              startdate_start: startDate,
              startdate_end:   endDate,
            })

            const todayRaw: AvTimeslot[]    = []
            const tomorrowRaw: AvTimeslot[] = []
            let nextAvailableDate: string | null = null

            for (const d of dates) {
              if (!d.start_time) continue

              const raw      = d.spaces_remaining
              const unlimited = raw === "UNLIMITED"
              const spotsLeft  = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
              const spotsTotal = unlimited ? 100 : Math.max(spotsLeft + 8, 15)

              const slot: AvTimeslot = {
                time:      d.start_time.slice(0, 5),
                spotsLeft,
                spotsTotal,
                rateName:  d.note?.trim() || undefined,
              }

              if (dateMode) {
                todayRaw.push(slot)
              } else {
                if (d.start_date === todayStr)         todayRaw.push(slot)
                else if (d.start_date === tomorrowStr) tomorrowRaw.push(slot)
                else if (
                  d.start_date &&
                  d.start_date > tomorrowStr &&
                  (unlimited || spotsLeft > 0)
                ) {
                  // Track the earliest ACTUALLY-BOOKABLE date beyond tomorrow
                  // (skip sold-out departures so the card never points users at
                  // a date they can't book).
                  if (!nextAvailableDate || d.start_date < nextAvailableDate) {
                    nextAvailableDate = d.start_date
                  }
                }
              }
            }

            result[row.id] = {
              today:          deduplicateByTime(todayRaw),
              tomorrow:       deduplicateByTime(tomorrowRaw),
              todayGroups:    buildGroups(todayRaw),
              tomorrowGroups: buildGroups(tomorrowRaw),
              nextAvailableDate: dateMode ? null : nextAvailableDate,
            }
          } catch {
            // skip — card falls back to dummy
          }
        })
      )

      // Persist to both process-local cache and DB so other instances benefit.
      _cache.set(cacheKey, { data: result, expiresAt: Date.now() + ttlMs })
      void dbPersistAvailability(cacheKey, result, ttlMs)

      return result
    } finally {
      _inFlight.delete(cacheKey)
      _anySweepInProgress = false
    }
  })()

  _inFlight.set(cacheKey, sweepPromise)
  return NextResponse.json(await sweepPromise)
}
