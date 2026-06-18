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

// Per-key in-flight sweep promises — prevents launching duplicate background
// sweeps for the same cache key within the same process instance.
const _inFlight = new Map<string, Promise<void>>()

// Process-level guard — ensures at most one sweep runs at a time per process.
let _anySweepInProgress = false

// ── DB-backed cross-instance cache ─────────────────────────────────────────
// Persists sweep results so fresh process instances (cold starts, horizontal
// scale-out) can serve from DB instead of triggering a new TourCMS fan-out.
// Uses the existing `integrations` table: key = availability_cache:{cacheKey},
// value = expiresAt timestamp (ms), meta = AvailabilityMap as JSONB.

const DB_AVAIL_KEY_PREFIX = "availability_cache:"

// ── DB-backed distributed sweep lock ─────────────────────────────────────
// Ensures at most one sweep runs globally across all process instances.
// Using a TTL well above the worst-case sweep duration (18 TourCMS calls).
const DB_SWEEP_LOCK_KEY = "availability_sweep_lock"
const SWEEP_LOCK_TTL_MS = 120_000  // 2 minutes

/**
 * Read DB cache for the given key.
 * When `allowStale` is true, returns even expired entries (stale-while-revalidate).
 */
async function dbGetAvailability(
  cacheKey: string,
  opts: { allowStale?: boolean } = {},
): Promise<{ data: AvailabilityMap; expiresAt: number } | null> {
  try {
    const { queryOne } = await import("@/lib/db")
    const row = await queryOne<{ value: string; meta: unknown }>(
      `SELECT value, meta FROM integrations WHERE key = $1`,
      [`${DB_AVAIL_KEY_PREFIX}${cacheKey}`],
    )
    if (!row?.meta) return null
    const expiresAt = parseInt(row.value as string, 10)
    if (!Number.isFinite(expiresAt)) return null
    if (!opts.allowStale && Date.now() >= expiresAt) return null
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

/**
 * Try to atomically acquire the distributed sweep lock.
 * Returns true only if this caller got the lock (no other instance holds it).
 * Uses an optimistic INSERT / conditional UPDATE — the UPDATE only fires when
 * the existing lock timestamp has expired, so concurrent callers get false.
 */
async function tryAcquireSweepLock(): Promise<boolean> {
  try {
    const { query } = await import("@/lib/db")
    const now = Date.now()
    const lockExpiry = now + SWEEP_LOCK_TTL_MS
    const rows = await query<{ key: string }>(
      `INSERT INTO integrations (key, label, value, updated_at)
       VALUES ($1, 'Availability sweep lock (internal)', $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()
         WHERE integrations.value::bigint < $3
       RETURNING key`,
      [DB_SWEEP_LOCK_KEY, String(lockExpiry), String(now)],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

async function releaseSweepLock(): Promise<void> {
  try {
    const { query } = await import("@/lib/db")
    await query(`DELETE FROM integrations WHERE key = $1`, [DB_SWEEP_LOCK_KEY])
  } catch {}
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

/**
 * Run a full TourCMS availability sweep for the given date range.
 * Always called as a fire-and-forget background task — the caller returns
 * immediately with stale/empty data and does NOT await this.
 *
 * Distributed lock: `tryAcquireSweepLock()` MUST be called (and return true)
 * before invoking this function. `releaseSweepLock()` is called in the finally.
 */
async function runSweep(
  cacheKey: string,
  startDate: string,
  endDate: string,
  dateMode: boolean,
  todayStr: string,
  tomorrowStr: string,
  ttlMs: number,
): Promise<void> {
  try {
    const [config, rows] = await Promise.all([
      getTourCMSConfig(),
      dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
    ])

    const tcmsTrips = (rows as { id: string }[]).filter(r => r.id.startsWith("tcms_"))

    if (!config || tcmsTrips.length === 0) return

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

            const raw       = d.spaces_remaining
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
                if (!nextAvailableDate || d.start_date < nextAvailableDate) {
                  nextAvailableDate = d.start_date
                }
              }
            }
          }

          result[row.id] = {
            today:             deduplicateByTime(todayRaw),
            tomorrow:          deduplicateByTime(tomorrowRaw),
            todayGroups:       buildGroups(todayRaw),
            tomorrowGroups:    buildGroups(tomorrowRaw),
            nextAvailableDate: dateMode ? null : nextAvailableDate,
          }
        } catch {
          // skip — card falls back to dummy
        }
      })
    )

    // Write to both process-local cache and DB so other instances benefit.
    _cache.set(cacheKey, { data: result, expiresAt: Date.now() + ttlMs })
    void dbPersistAvailability(cacheKey, result, ttlMs)
  } finally {
    _inFlight.delete(cacheKey)
    _anySweepInProgress = false
    void releaseSweepLock()
  }
}

/**
 * Schedule a background availability sweep for `cacheKey` if:
 *  - no sweep is already in-flight for this key in this process, AND
 *  - no other instance holds the distributed DB lock.
 *
 * Returns immediately (fire-and-forget). Callers must NOT await this.
 */
function scheduleBackgroundSweep(
  cacheKey: string,
  startDate: string,
  endDate: string,
  dateMode: boolean,
  todayStr: string,
  tomorrowStr: string,
  ttlMs: number,
): void {
  if (_anySweepInProgress || _inFlight.has(cacheKey)) return

  void (async () => {
    const acquired = await tryAcquireSweepLock()
    if (!acquired) return
    // Double-check after async lock acquisition
    if (_anySweepInProgress) { void releaseSweepLock(); return }

    _anySweepInProgress = true
    const p = runSweep(cacheKey, startDate, endDate, dateMode, todayStr, tomorrowStr, ttlMs)
    _inFlight.set(cacheKey, p)
    // Not awaited — truly fire-and-forget
  })()
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
  // Only accept a real calendar date in YYYY-MM-DD form within [today, today+30d].
  // This bounds the distinct cache key-space to the valid date window so repeated
  // requests collapse onto the cache rather than cycling through arbitrary strings.
  let dateParam = ""
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 })
    }
    const parsed = new Date(`${rawDate}T00:00:00Z`)
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

  // ── 1. Process-local cache (fresh) ────────────────────────────────────────
  const inMem = _cache.get(cacheKey)
  if (inMem && Date.now() < inMem.expiresAt) {
    return NextResponse.json(inMem.data)
  }

  // ── 2. DB cache (fresh or stale) ──────────────────────────────────────────
  // Always check for stale data too — serves as the SWR payload while a
  // background sweep re-warms it.
  const dbEntry = await dbGetAvailability(cacheKey, { allowStale: true })
  if (dbEntry) {
    _cache.set(cacheKey, dbEntry)  // warm process-local cache
  }

  const freshData =
    (inMem && Date.now() < inMem.expiresAt) ||
    (dbEntry && Date.now() < dbEntry.expiresAt)

  // ── 3. If data is stale or missing, schedule a background sweep ────────────
  // The sweep is NEVER awaited here — the public endpoint always returns
  // immediately with whatever is available (stale or empty).  The distributed
  // DB lock (`tryAcquireSweepLock`) ensures at most one sweep runs globally
  // across all horizontally-scaled instances at any given time.
  if (!freshData) {
    scheduleBackgroundSweep(cacheKey, startDate, endDate, dateMode, todayStr, tomorrowStr, ttlMs)
  }

  // ── 4. Return immediately with cached data (stale is fine) or empty ────────
  const payload = inMem?.data ?? dbEntry?.data ?? {}
  return NextResponse.json(payload)
}
