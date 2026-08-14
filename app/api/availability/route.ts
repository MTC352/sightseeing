import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import {
  getTourCMSConfig,
  showTourDatesAndDeals,
  checkAvailability,
  type AvailabilityComponent,
} from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"
import { getSearchAvailabilityConfig } from "@/lib/search-availability-source"
import { getLastKnownRateLimit } from "@/lib/departing-soon-cache"

export const dynamic = "force-dynamic"

// Minimum TourCMS hourly quota (remaining GET hits) required before the search
// page is allowed to fan out real-time checkavail calls. Mirrors the guard the
// Departing Soon / Last Minute Deals refreshers use so search can never drain
// the shared quota out from under the homepage widgets. Same threshold (200).
const CHECKAVAIL_MIN_QUOTA = 200

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
   *  scan window.  Non-date mode only — lets cards show "Next timeslot available
   *  on {date}" when there are no today/tomorrow slots. null when none found. */
  nextAvailableDate?: string | null
}

export type AvailabilityMap = Record<string, AvTripAvailability>

// ── Process-local cache: keyed by "startDate|endDate" ─────────────────────
const _cache = new Map<string, { data: AvailabilityMap; expiresAt: number }>()

// Whether a no-date background sweep is in-flight in this process.
let _noDateSweepInProgress = false

// ── DB-backed cross-instance cache ─────────────────────────────────────────
// Persists sweep results so fresh process instances (cold starts, horizontal
// scale-out) can serve from DB instead of triggering a new TourCMS fan-out.
// Uses the `integrations` table: key = availability_cache:{cacheKey},
// value = expiresAt timestamp (ms), meta = AvailabilityMap as JSONB.

const DB_AVAIL_KEY_PREFIX = "availability_cache:"

// ── DB-backed distributed sweep lock ──────────────────────────────────────
// Ensures at most one no-date sweep runs globally across all process instances.
// TTL matches the no-date cache TTL so the lock and cache expire in lock-step.
const DB_NODATE_LOCK_KEY = "availability_sweep_lock"
const NODATE_LOCK_TTL_MS = 5 * 60_000   // 5 minutes — same as no-date cache TTL

/**
 * Read DB cache for the given key.
 * `allowStale=true` returns even expired entries (stale-while-revalidate).
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
    // Fail-soft: cache miss on other instances for this cycle but correctness is fine.
  }
}

/**
 * Atomically try to acquire the global no-date sweep lock.
 * Returns true only when this caller won the lock (no other instance holds it).
 * The conditional UPDATE only fires when the stored timestamp has expired,
 * so concurrent callers racing on a fresh lock all lose except one.
 */
async function tryAcquireNodateLock(ttlMs: number = NODATE_LOCK_TTL_MS): Promise<boolean> {
  try {
    const { query } = await import("@/lib/db")
    const now = Date.now()
    const expiry = now + ttlMs
    const rows = await query<{ key: string }>(
      `INSERT INTO integrations (key, label, value, updated_at)
       VALUES ($1, 'Availability sweep lock (internal)', $2, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()
         WHERE integrations.value::bigint < $3
       RETURNING key`,
      [DB_NODATE_LOCK_KEY, String(expiry), String(now)],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

async function releaseNodateLock(): Promise<void> {
  try {
    const { query } = await import("@/lib/db")
    await query(`DELETE FROM integrations WHERE key = $1`, [DB_NODATE_LOCK_KEY])
  } catch {}
}

function pruneAvailabilityCache() {
  const now = Date.now()
  for (const [key, entry] of _cache) {
    if (now >= entry.expiresAt) _cache.delete(key)
  }
}

// All "today/tomorrow" and past-slot decisions are made in the app's operating
// timezone (Luxembourg), NOT UTC/server-local — otherwise the day boundary and
// the "now" cutoff drift by 1–2h and mislabel dates around midnight.
const APP_TZ = "Europe/Luxembourg"

// Calendar date (YYYY-MM-DD) of `d` in Luxembourg time. en-CA yields ISO order.
function toYMD(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(d)
}

// Current wall-clock time of `d` in Luxembourg as zero-padded "HH:MM" (00–23).
// Slot times are also "HH:MM", so a lexicographic compare is a valid time compare.
function toHM(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d)
}

/**
 * Drop slots that already started today. Applied at RESPONSE time (not when the
 * cache is built) so the cutoff always reflects the real current minute even as
 * cached data ages. Only removes slots strictly before `cutoff` — a slot at the
 * current minute is kept, and every upcoming slot is preserved, so no still-
 * bookable timeslot is ever hidden. Empty variant groups are pruned.
 */
function hidePastTodaySlots(map: AvailabilityMap, cutoff: string): AvailabilityMap {
  const keep = (s: AvTimeslot) => s.time >= cutoff
  const out: AvailabilityMap = {}
  for (const [tripId, av] of Object.entries(map)) {
    out[tripId] = {
      ...av,
      today: av.today.filter(keep),
      todayGroups: (av.todayGroups ?? [])
        .map((g) => ({ ...g, slots: g.slots.filter(keep) }))
        .filter((g) => g.slots.length > 0),
    }
  }
  return out
}

/** Group a raw slot array by rateName, preserving insertion order. */
function buildGroups(slots: AvTimeslot[]): AvSlotGroup[] {
  const map = new Map<string, AvTimeslot[]>()
  for (const s of slots) {
    const k = s.rateName ?? ""
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(s)
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

// ── Real-time checkavail path ──────────────────────────────────────────────
//
// Opt-in alternative to the datesndeals sweep (toggled from the Dev-mode
// db-migrations tab).  Fans out one checkAvailability call PER TRIP PER DATE and
// blocks the request on the result — accurate to the current minute and
// party-size aware, but far heavier on the TourCMS API.  A short (admin-
// configurable) process-local cache (keyed by party size + date range) plus
// bounded concurrency keeps the fan-out from hammering the TourCMS hourly limit.

const _rtCache = new Map<string, { data: AvailabilityMap; expiresAt: number }>()
const RT_CONCURRENCY = 6

function pruneRtCache() {
  const now = Date.now()
  for (const [k, e] of _rtCache) {
    if (now >= e.expiresAt) _rtCache.delete(k)
  }
}

/** Bounded-concurrency map — caps simultaneous checkavail calls so a large
 *  catalog can't burst past the TourCMS rate limit in one request. */
async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
}

/** Convert real-time checkavail components into card timeslots — same spot-count
 *  synthesis as the datesndeals path so both sources render identically. */
function componentsToSlots(components: AvailabilityComponent[]): AvTimeslot[] {
  const slots: AvTimeslot[] = []
  for (const c of components) {
    if (!c.start_time) continue
    const raw        = c.spaces_remaining
    const unlimited  = raw === "UNLIMITED"
    const spotsLeft  = unlimited ? 99 : Math.max(0, parseInt(raw ?? "0", 10))
    const spotsTotal = unlimited ? 100 : Math.max(spotsLeft + 8, 15)
    slots.push({
      time:     c.start_time.slice(0, 5),
      spotsLeft,
      spotsTotal,
      rateName: c.note?.trim() || undefined,
    })
  }
  return slots
}

async function runCheckavailRealtime(opts: {
  dateMode: boolean
  dateParam: string
  todayStr: string
  tomorrowStr: string
  horizonStr: string
  persons: number
  datesndealsCacheMs: number
}): Promise<AvailabilityMap> {
  const { dateMode, dateParam, todayStr, tomorrowStr, horizonStr, persons, datesndealsCacheMs } = opts

  const [config, rows] = await Promise.all([
    getTourCMSConfig(),
    dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
  ])
  const tcmsTrips = (rows as { id: string }[]).filter(r => r.id.startsWith("tcms_"))
  if (!config || tcmsTrips.length === 0) return {}

  // nextAvailableDate (30-day lookahead) is the one field checkavail can't
  // supply cheaply — reuse the cached datesndeals sweep, scheduling one when
  // absent so it's warm for the next request. No-date mode only.
  let sweep: AvailabilityMap | null = null
  if (!dateMode) {
    const sweepKey = `${todayStr}|${horizonStr}`
    const mem = _cache.get(sweepKey)
    if (mem) {
      sweep = mem.data
    } else {
      const db = await dbGetAvailability(sweepKey, { allowStale: true })
      if (db) { _cache.set(sweepKey, db); sweep = db.data }
    }
    if (!sweep) scheduleNodateSweep(sweepKey, todayStr, tomorrowStr, horizonStr, datesndealsCacheMs)
  }

  const datesToQuery = dateMode ? [dateParam] : [todayStr, tomorrowStr]

  const result: AvailabilityMap = {}
  await mapPool(tcmsTrips, RT_CONCURRENCY, async (row) => {
    const tourId = row.id.replace("tcms_", "")
    const perDate: Record<string, AvTimeslot[]> = {}
    for (const date of datesToQuery) {
      try {
        const { ok, components } = await checkAvailability(config, tourId, {
          date,
          show_pickups: "0",
          r1: persons,
        })
        perDate[date] = ok ? componentsToSlots(components) : []
      } catch {
        // One failing trip must never break the whole page — card falls back to
        // its dummy/empty state.
        perDate[date] = []
      }
    }

    if (dateMode) {
      const raw = perDate[dateParam] ?? []
      result[row.id] = {
        today:             deduplicateByTime(raw),
        tomorrow:          [],
        todayGroups:       buildGroups(raw),
        tomorrowGroups:    [],
        nextAvailableDate: null,
      }
    } else {
      const todayRaw    = perDate[todayStr]    ?? []
      const tomorrowRaw = perDate[tomorrowStr] ?? []
      result[row.id] = {
        today:             deduplicateByTime(todayRaw),
        tomorrow:          deduplicateByTime(tomorrowRaw),
        todayGroups:       buildGroups(todayRaw),
        tomorrowGroups:    buildGroups(tomorrowRaw),
        nextAvailableDate: sweep?.[row.id]?.nextAvailableDate ?? null,
      }
    }
  })

  return result
}

// ── No-date sweep ──────────────────────────────────────────────────────────
//
// This is the ONLY code path that fans out to all TourCMS trips.
// It is NEVER triggered by date-mode public requests — only by no-date
// cache misses (and at most once per NODATE_LOCK_TTL_MS globally via the
// DB distributed lock, which is held for the full TTL even after the sweep
// completes so that the lock and cache expire in lock-step).
//
// As a side-effect it also writes per-date cache entries for each date in
// the scan window so that date-mode GETs can serve from that data without
// ever triggering their own fan-out.

async function runNodateSweep(
  cacheKey: string,   // "todayStr|horizonStr"
  todayStr: string,
  tomorrowStr: string,
  horizonStr: string,
  ttlMs: number = NODATE_LOCK_TTL_MS,
): Promise<void> {
  const NO_DATE_TTL = ttlMs   // configurable datesndeals cache TTL (0 = uncached)
  const DATE_TTL    = NO_DATE_TTL         // pre-warmed per-date entries share the same TTL

  try {
    const [config, rows] = await Promise.all([
      getTourCMSConfig(),
      dbListTrips({ publicOnly: true }).catch(() => [] as unknown[]),
    ])

    const tcmsTrips = (rows as { id: string }[]).filter(r => r.id.startsWith("tcms_"))
    if (!config || tcmsTrips.length === 0) return

    const result: AvailabilityMap = {}

    // perDate[dateStr][tripId] = raw slots for that date (fills date-mode cache)
    const perDate = new Map<string, Map<string, AvTimeslot[]>>()

    await Promise.all(
      tcmsTrips.map(async (row) => {
        const tourId = row.id.replace("tcms_", "")
        try {
          const { dates } = await showTourDatesAndDeals(config, tourId, {
            startdate_start: todayStr,
            startdate_end:   horizonStr,
          })

          const todayRaw: AvTimeslot[]    = []
          const tomorrowRaw: AvTimeslot[] = []
          let nextAvailableDate: string | null = null

          for (const d of dates) {
            if (!d.start_time || !d.start_date) continue

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

            // Collect into per-date buckets (for side-effect date-mode warming)
            if (!perDate.has(d.start_date)) perDate.set(d.start_date, new Map())
            const tripBucket = perDate.get(d.start_date)!
            if (!tripBucket.has(row.id)) tripBucket.set(row.id, [])
            tripBucket.get(row.id)!.push(slot)

            // No-date result bucketing
            if (d.start_date === todayStr)         todayRaw.push(slot)
            else if (d.start_date === tomorrowStr) tomorrowRaw.push(slot)
            else if (
              d.start_date > tomorrowStr &&
              (unlimited || spotsLeft > 0)
            ) {
              if (!nextAvailableDate || d.start_date < nextAvailableDate) {
                nextAvailableDate = d.start_date
              }
            }
          }

          result[row.id] = {
            today:             deduplicateByTime(todayRaw),
            tomorrow:          deduplicateByTime(tomorrowRaw),
            todayGroups:       buildGroups(todayRaw),
            tomorrowGroups:    buildGroups(tomorrowRaw),
            nextAvailableDate,
          }
        } catch {
          // skip — card falls back to dummy
        }
      })
    )

    // Write the primary no-date result
    const noDateExpiry = Date.now() + NO_DATE_TTL
    _cache.set(cacheKey, { data: result, expiresAt: noDateExpiry })
    void dbPersistAvailability(cacheKey, result, NO_DATE_TTL)

    // Side-effect: write per-date entries so date-mode GETs serve from cache.
    // This is the ONLY way date-mode cache entries get populated — never from
    // a public-triggered sweep.
    for (const [date, tripMap] of perDate) {
      const dateResult: AvailabilityMap = {}
      for (const [tripId, rawSlots] of tripMap) {
        const deduped = deduplicateByTime(rawSlots)
        dateResult[tripId] = {
          today:         deduped,
          tomorrow:      [],
          todayGroups:   buildGroups(rawSlots),
          tomorrowGroups: [],
          nextAvailableDate: null,
        }
      }
      const dateKey = `${date}|${date}`
      const dateExpiry = Date.now() + DATE_TTL
      _cache.set(dateKey, { data: dateResult, expiresAt: dateExpiry })
      void dbPersistAvailability(dateKey, dateResult, DATE_TTL)
    }
  } finally {
    _noDateSweepInProgress = false
    // Note: the DB lock is NOT released here — it expires after NODATE_LOCK_TTL_MS
    // so that a fresh lock acquisition is impossible until the cache also expires.
    // This ensures the global sweep rate is hard-bounded to 1 per TTL period.
  }
}

/**
 * Schedule a background no-date sweep if:
 *  - no sweep is in-flight in this process, AND
 *  - the distributed DB lock can be acquired (no other instance swept recently).
 *
 * Fire-and-forget — must NOT be awaited by the caller.
 */
function scheduleNodateSweep(
  cacheKey: string,
  todayStr: string,
  tomorrowStr: string,
  horizonStr: string,
  ttlMs: number = NODATE_LOCK_TTL_MS,
): void {
  if (_noDateSweepInProgress) return

  void (async () => {
    const acquired = await tryAcquireNodateLock(ttlMs)
    if (!acquired) return
    if (_noDateSweepInProgress) {
      // Another async path in this process raced us — don't double-sweep.
      void releaseNodateLock()
      return
    }
    _noDateSweepInProgress = true
    // Not awaited — truly fire-and-forget.
    void runNodateSweep(cacheKey, todayStr, tomorrowStr, horizonStr, ttlMs)
  })()
}

export async function GET(req: Request) {
  schedulePrune()
  pruneAvailabilityCache()
  const rl = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  const { searchParams } = new URL(req.url)
  const rawDate = (searchParams.get("date") ?? "").trim()
  // Party size for real-time checkavail (r1=N). Clamped to a sane range so an
  // attacker-controlled value can't request an absurd quantity. Ignored by the
  // datesndeals path (which takes no rate quantity).
  const persons = Math.min(50, Math.max(1, parseInt(searchParams.get("persons") ?? "1", 10) || 1))

  const now         = new Date()
  const todayStr    = toYMD(now)
  const tomorrowStr = toYMD(new Date(now.getTime() + 86_400_000))
  const horizonStr  = toYMD(new Date(now.getTime() + 30 * 86_400_000))

  // ── Validate + clamp the attacker-controlled `date` param ─────────────────
  // Accept ONLY a real YYYY-MM-DD within [today, today+30d]. This bounds the
  // date-mode key-space to 31 possible values.
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

  const dateMode = dateParam !== ""
  const cacheKey = dateMode ? `${dateParam}|${dateParam}` : `${todayStr}|${horizonStr}`

  // Hide already-started slots whenever the response's `today` field represents
  // the actual current day: no-date mode always, date-mode only when the picked
  // date IS today. Future dates keep every slot (their morning is not "past").
  const cutoff = toHM(now)
  const applyFilter = (map: AvailabilityMap): AvailabilityMap =>
    !dateMode || dateParam === todayStr ? hidePastTodaySlots(map, cutoff) : map

  // ── Availability source + cache durations (Dev-mode configurable) ─────────
  // Both cache TTLs are admin-configurable. See the note below on when the
  // "checkavail" source actually engages (date mode + sufficient quota only).
  const { source, datesndealsCacheMs, checkavailCacheMs } = await getSearchAvailabilityConfig()

  // Real-time checkavail is opt-in AND deliberately scoped to DATE MODE only.
  //
  // The no-date "browse" view (Today/Tomorrow across the WHOLE catalog) loads on
  // every search visit. Running a blocking per-trip checkavail fan-out there on
  // each request — with only a 30s cache — exhausts the shared TourCMS hourly
  // quota and saturates the single autoscale instance. That starves the homepage
  // widgets (Departing Soon / Last Minute Deals, which skip when quota < 200) and
  // degrades the instance enough that the CSS bundle fails to load — leaving
  // unstyled full-screen SVG icons on the homepage and failing the platform
  // healthcheck. So no-date ALWAYS uses the cheap datesndeals sweep.
  //
  // checkavail runs only when a visitor commits to a specific date — far rarer —
  // and even then yields to the same rate-limit guard the homepage widgets use,
  // falling through to the (pre-warmed) datesndeals per-date cache when the quota
  // is low rather than piling onto an exhausted limit.
  if (source === "checkavail" && dateMode) {
    const rl = getLastKnownRateLimit()
    if (rl === null || rl.remaining >= CHECKAVAIL_MIN_QUOTA) {
      pruneRtCache()
      const rtKey = `checkavail|${persons}|${cacheKey}`
      const cached = _rtCache.get(rtKey)
      if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(applyFilter(cached.data))
      }
      const data = await runCheckavailRealtime({
        dateMode, dateParam, todayStr, tomorrowStr, horizonStr, persons, datesndealsCacheMs,
      })
      _rtCache.set(rtKey, { data, expiresAt: Date.now() + checkavailCacheMs })
      return NextResponse.json(applyFilter(data))
    }
    // Quota low — fall through to the cached datesndeals path below.
  }

  // ── 1. Process-local cache (fresh) ────────────────────────────────────────
  const inMem = _cache.get(cacheKey)
  if (inMem && Date.now() < inMem.expiresAt) {
    return NextResponse.json(applyFilter(inMem.data))
  }

  // ── 2. DB cache (fresh or stale — served either way for SWR) ──────────────
  const dbEntry = await dbGetAvailability(cacheKey, { allowStale: true })
  if (dbEntry) _cache.set(cacheKey, dbEntry)  // warm process-local cache

  const dataIsFresh =
    (inMem != null && Date.now() < inMem.expiresAt) ||
    (dbEntry != null && Date.now() < dbEntry.expiresAt)

  // ── 3. Trigger background sweep — NO-DATE MODE ONLY ───────────────────────
  //
  // DATE MODE is deliberately NEVER allowed to trigger a TourCMS fan-out from
  // a public request.  Date-mode cache entries are pre-warmed as a side-effect
  // of the no-date sweep (see runNodateSweep → perDate side-effect writes).
  //
  // NO-DATE mode: at most one sweep every NODATE_LOCK_TTL_MS (5 min) globally
  // across all horizontally-scaled instances, enforced by the DB lock held for
  // the full TTL period even after the sweep completes.
  if (!dataIsFresh && !dateMode) {
    scheduleNodateSweep(cacheKey, todayStr, tomorrowStr, horizonStr, datesndealsCacheMs)
  }

  // ── 4. Return immediately — stale data if available, empty map otherwise ──
  const payload = inMem?.data ?? dbEntry?.data ?? {}
  return NextResponse.json(applyFilter(payload))
}
