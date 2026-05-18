/**
 * lib/departing-soon-cache.ts
 *
 * Shared in-process caches for the "Departing Soon" homepage widget.
 *
 * NEW ARCHITECTURE (window-based discovery, no periodic cron):
 *
 *   1. discoveryCache  — ALL upcoming bookable timeslots for the next N days
 *                        (N = `departing_soon_discovery_window_days`, default 7),
 *                        for every published+synced trip. Built from a single
 *                        `datesndeals` call per trip. The cache stays valid for
 *                        the full window — when the window expires, the next
 *                        homepage read triggers a background refresh (no cron
 *                        needed). The admin can also force-refresh from the
 *                        settings panel.
 *
 *   2. availabilityCache — per-displayed-slot real-time spaces_remaining,
 *                        refreshed via one parallel `checkavail` per slot.
 *                        Keyed by `${tripId}:${date}:${time}` so the entry
 *                        invalidates naturally as earlier slots depart.
 *
 * Read flow: read endpoint pulls the top-N earliest upcoming slots (1 per trip)
 * from `discoveryCache.allSlots`, then overlays real-time availability.
 *
 * A Promise-based lock dedupes concurrent availability refreshes so 1000
 * simultaneous homepage hits cause exactly ONE upstream call cluster.
 */

import { getTourCMSClient } from "@/lib/tourcms"
import { dbGetSettings } from "@/lib/db/queries"

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiscoverySlot {
  tripId: string
  palisisId: string
  tripTitle: string
  tripImage: string
  tripPermalink: string
  tripCategory: string
  tripCity: string
  date: string                 // YYYY-MM-DD (operator local date)
  time: string                 // HH:MM     (display only)
  startTimeUtcSeconds: number  // sort/match key (synthesized from date+time, Lux TZ)
  priceDisplay: string
  /** Initial spaces seen during discovery (datesndeals) — overlaid by availability cache when present. */
  initialSpacesRemaining: number | "UNLIMITED"
}

export interface AvailabilityRecord {
  spacesRemaining: number | "UNLIMITED"
  stillBookable: boolean
}

export interface DiscoveryCache {
  /** Every upcoming bookable timeslot for the window, across all trips. */
  allSlots: DiscoverySlot[]
  refreshedAt: number
  /** When this window expires (refreshedAt + daysFetched*86400000). */
  expiresAt: number
  daysFetched: number
  failedTripCount: number
  tripsChecked: number
}

export interface AvailabilityCache {
  /** Composite key: `${tripId}:${date}:${time}` — invalidates naturally when the displayed slot shifts. */
  bySlotKey: Record<string, AvailabilityRecord>
  refreshedAt: number
}

// ── Module-level state ─────────────────────────────────────────────────────
// NOTE: This is process-local. If Replit scales horizontally each instance
// has its own cache — that's OK; the lazy bootstrap warms each instance.

export let discoveryCache: DiscoveryCache | null = null
export let availabilityCache: AvailabilityCache | null = null
let availabilityRefreshLock: Promise<void> | null = null

// Bootstrap-in-progress guard so the lazy bootstrap doesn't fire twice
let discoveryBootstrapInFlight: Promise<unknown> | null = null

export function setDiscoveryCache(next: DiscoveryCache | null) {
  discoveryCache = next
}
export function setAvailabilityCache(next: AvailabilityCache | null) {
  availabilityCache = next
}

// ── Helpers ────────────────────────────────────────────────────────────────

function forceArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

function slotKey(s: { tripId: string; date: string; time: string }): string {
  return `${s.tripId}:${s.date}:${s.time}`
}

async function getNumericSetting(key: string, fallback: number, min: number, max: number): Promise<number> {
  try {
    const s = await dbGetSettings()
    const k = (s?.apiKeys as Record<string, string> | undefined) ?? {}
    const raw = parseInt(k[key] ?? "", 10)
    if (isNaN(raw)) return fallback
    return Math.max(min, Math.min(max, raw))
  } catch {
    return fallback
  }
}

/** Discovery window: how many days of `datesndeals` to fetch per trip. Default 7. */
export async function getDiscoveryWindowDays(): Promise<number> {
  return getNumericSetting("departing_soon_discovery_window_days", 7, 3, 30)
}
export async function getAvailabilityTtlSeconds(): Promise<number> {
  return getNumericSetting("departing_soon_availability_ttl_seconds", 20, 10, 120)
}
export async function getAutoUpdateIntervalSeconds(): Promise<number> {
  return getNumericSetting("departing_soon_auto_update_interval_seconds", 30, 15, 300)
}
export async function getSlotCount(): Promise<number> {
  return getNumericSetting("departing_soon_slot_count", 5, 3, 10)
}
async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  try {
    const s = await dbGetSettings()
    const k = (s?.apiKeys as Record<string, string> | undefined) ?? {}
    const v = k[key]
    if (v === undefined || v === null || v === "") return fallback
    return v === "true"
  } catch {
    return fallback
  }
}
export async function getAutoUpdateEnabled(): Promise<boolean> {
  return getBoolSetting("departing_soon_auto_update", false)
}
/** Master visibility toggle — when false, widget hides and all upstream work skips. Default ON. */
export async function getWidgetEnabled(): Promise<boolean> {
  return getBoolSetting("departing_soon_widget_enabled", true)
}
/** Show "Limited availability" pills AND run the availability cron. Default ON. */
export async function getShowAvailability(): Promise<boolean> {
  return getBoolSetting("departing_soon_show_availability", true)
}

/** True when the discovery window is empty or has elapsed. */
export function isDiscoveryExpired(): boolean {
  if (!discoveryCache) return true
  return Date.now() >= discoveryCache.expiresAt
}

/** Compute UTC seconds from a Luxembourg local date+time string (datesndeals doesn't return UTC). */
function lxToUtcSeconds(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = (time || "00:00").split(":").map(Number)
  const asUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0)
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Luxembourg",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
    const parts = dtf.formatToParts(new Date(asUtc))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
    const luxAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
    const offsetMs = luxAsUtc - asUtc
    return Math.floor((asUtc - offsetMs) / 1000)
  } catch {
    return Math.floor((asUtc - 3_600_000) / 1000)
  }
}

// ── computeDisplayedSlots ──────────────────────────────────────────────────
// The top-N earliest upcoming slots, one per trip, drawn from discoveryCache.allSlots.
// Both the read endpoint AND the availability refresh use this so they always
// agree on which slots are "displayed".

export async function computeDisplayedSlots(): Promise<DiscoverySlot[]> {
  if (!discoveryCache) return []
  const slotCount = await getSlotCount()
  const nowUtc = Math.floor(Date.now() / 1000)

  const earliestPerTrip = new Map<string, DiscoverySlot>()
  for (const s of discoveryCache.allSlots) {
    if (s.startTimeUtcSeconds <= nowUtc) continue
    const existing = earliestPerTrip.get(s.tripId)
    if (!existing || s.startTimeUtcSeconds < existing.startTimeUtcSeconds) {
      earliestPerTrip.set(s.tripId, s)
    }
  }
  return [...earliestPerTrip.values()]
    .sort((a, b) => a.startTimeUtcSeconds - b.startTimeUtcSeconds)
    .slice(0, slotCount)
}

// ── refreshAvailability ────────────────────────────────────────────────────
// Pure async function — gated by:
//   1. In-flight lock (dedupe): if a refresh is already running, await it.
//   2. TTL: if last refresh was more recent than departing_soon_availability_ttl_seconds, skip.
//   3. Master + show-availability toggles must be ON.
//   4. Discovery cache must exist (otherwise nothing to display).
//
// Does ONE parallel checkavail per CURRENTLY DISPLAYED slot.

export async function refreshAvailability(): Promise<void> {
  if (availabilityRefreshLock) return availabilityRefreshLock

  availabilityRefreshLock = (async () => {
    try {
      if (!(await getWidgetEnabled())) return
      if (!(await getShowAvailability())) return

      const ttl = await getAvailabilityTtlSeconds()
      if (availabilityCache && (Date.now() - availabilityCache.refreshedAt) / 1000 < ttl) return

      const displayed = await computeDisplayedSlots()
      if (displayed.length === 0) return

      const tourcms = await getTourCMSClient()
      if (!tourcms) return

      const results = await Promise.allSettled(
        displayed.map((s) => tourcms.checkAvailability(s.palisisId, { date: s.date, r1: 1 })),
      )

      const newBySlotKey: Record<string, AvailabilityRecord> = {}

      results.forEach((r, i) => {
        const slot = displayed[i]
        const key = slotKey(slot)
        if (r.status === "rejected") {
          // Transient — keep last known record if any, else mark sold-out
          newBySlotKey[key] =
            availabilityCache?.bySlotKey[key] ?? { spacesRemaining: 0, stillBookable: false }
          return
        }
        if (!r.value.ok) {
          newBySlotKey[key] = { spacesRemaining: 0, stillBookable: false }
          return
        }
        const components = forceArray(r.value.components)
        // Match by start_time (HH:MM). If only one component, just take it.
        const match =
          components.find((c) => (c.start_time ?? "").slice(0, 5) === slot.time.slice(0, 5))
          ?? (components.length === 1 ? components[0] : undefined)
        if (!match) {
          newBySlotKey[key] = { spacesRemaining: 0, stillBookable: false }
          return
        }
        const raw = match.spaces_remaining
        const spacesRemaining: number | "UNLIMITED" =
          raw === "UNLIMITED" ? "UNLIMITED" : Math.max(0, Number(raw ?? 0))
        newBySlotKey[key] = { spacesRemaining, stillBookable: true }
      })

      availabilityCache = { bySlotKey: newBySlotKey, refreshedAt: Date.now() }
    } finally {
      availabilityRefreshLock = null
    }
  })()

  return availabilityRefreshLock
}

// ── Cron auth ──────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server"

export function isAuthorizedCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return process.env.NODE_ENV !== "production"
  }
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret")
  return provided === expected
}

// ── refreshDiscovery ───────────────────────────────────────────────────────
// Fetches `datesndeals` for the next windowDays days for every published+synced
// trip and stores ALL bookable upcoming timeslots in `discoveryCache.allSlots`.
// One call per trip — no per-trip checkavail.
//
// Called by:
//   - Lazy bootstrap (first homepage hit after cold start)
//   - Lazy expiry refresh (homepage hit after window elapsed) — non-blocking
//   - Admin "Refresh Now" button (force=true)

export interface RefreshDiscoveryResult {
  ok: true
  slotsFound: number       // total bookable slots across all trips
  tripsWithSlots: number   // trips that contributed at least one slot
  failedTripCount: number
  tripsChecked: number
  daysFetched: number
  durationMs: number
  rateLimitSkipped: boolean
}

export async function refreshDiscovery(force: boolean): Promise<RefreshDiscoveryResult | { ok: false; error: string }> {
  const start = Date.now()

  if (!(await getWidgetEnabled())) {
    return { ok: false, error: "WIDGET_DISABLED" }
  }

  // Window-based gate: skip when cache still inside its window unless forced.
  if (!force && discoveryCache && !isDiscoveryExpired()) {
    return {
      ok: true,
      slotsFound: discoveryCache.allSlots.length,
      tripsWithSlots: new Set(discoveryCache.allSlots.map((s) => s.tripId)).size,
      failedTripCount: discoveryCache.failedTripCount,
      tripsChecked: discoveryCache.tripsChecked,
      daysFetched: discoveryCache.daysFetched,
      durationMs: 0,
      rateLimitSkipped: false,
    }
  }

  const tourcms = await getTourCMSClient()
  if (!tourcms) {
    return { ok: false, error: "TOURCMS_NOT_CONFIGURED" }
  }

  // Rate-limit guard
  const rl = getLastKnownRateLimit()
  if (rl !== null && rl.remaining < 200) {
    console.warn(`[departing-soon] Skipping discovery — rate-limit remaining=${rl.remaining} < 200`)
    return {
      ok: true,
      slotsFound: discoveryCache?.allSlots.length ?? 0,
      tripsWithSlots: discoveryCache ? new Set(discoveryCache.allSlots.map((s) => s.tripId)).size : 0,
      failedTripCount: 0,
      tripsChecked: 0,
      daysFetched: discoveryCache?.daysFetched ?? 0,
      durationMs: Date.now() - start,
      rateLimitSkipped: true,
    }
  }

  const windowDays = await getDiscoveryWindowDays()

  // Lazy-import to avoid circular deps with queries.ts
  const { dbListTrips } = await import("@/lib/db/queries")
  const allTrips = (await dbListTrips({ publicOnly: true })) as Array<{
    id: string
    title: string
    palisis_id?: string
    image?: string
    permalink?: string
    category?: string
    city?: string
  }>
  const synced = allTrips.filter((t) => t.palisis_id)

  const today = new Date()
  const ts = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const endDate = new Date(Date.now() + (windowDays - 1) * 86_400_000)
  const horizon = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`
  const nowUtcSeconds = Math.floor(Date.now() / 1000)

  let failedTripCount = 0
  const collected: DiscoverySlot[] = []

  // datesndeals only — 1 call per trip. Collect ALL bookable upcoming slots.
  for (const trip of synced) {
    try {
      const dnd = await tourcms.showDatesAndDeals(trip.palisis_id!, {
        startdate_start: ts,
        startdate_end: horizon,
        order: "start_date",
      })
      if (!dnd.ok || dnd.dates.length === 0) continue

      for (const d of dnd.dates) {
        const status = (d.status ?? "").toUpperCase()
        const bookable = !status || status === "OPEN" || status === "AVAILABLE"
        if (!bookable) continue
        if (d.spaces_remaining === "0") continue
        const startUtc = lxToUtcSeconds(d.start_date, d.start_time ?? "00:00")
        if (startUtc <= nowUtcSeconds) continue

        const rawSpaces = d.spaces_remaining
        const initialSpacesRemaining: number | "UNLIMITED" =
          rawSpaces === "UNLIMITED" ? "UNLIMITED"
          : rawSpaces == null || rawSpaces === "" ? "UNLIMITED"
          : Math.max(0, Number(rawSpaces))

        collected.push({
          tripId: trip.id,
          palisisId: trip.palisis_id!,
          tripTitle: trip.title,
          tripImage: trip.image ?? "",
          tripPermalink: trip.permalink ?? "",
          tripCategory: trip.category ?? "Tours",
          tripCity: trip.city ?? "Luxembourg",
          date: d.start_date,
          time: (d.start_time ?? "00:00").slice(0, 5),
          startTimeUtcSeconds: startUtc,
          priceDisplay: d.price_1_display ?? (d.price_1 ? `${d.price_1} €` : ""),
          initialSpacesRemaining,
        })
      }
    } catch (err) {
      failedTripCount++
      console.warn("[departing-soon] discovery: trip failed", trip.id, err)
    }
  }

  collected.sort((a, b) => a.startTimeUtcSeconds - b.startTimeUtcSeconds)

  const now = Date.now()
  discoveryCache = {
    allSlots: collected,
    refreshedAt: now,
    expiresAt: now + windowDays * 86_400_000,
    daysFetched: windowDays,
    failedTripCount,
    tripsChecked: synced.length,
  }

  // Window changed → previous availability records may now refer to slots that
  // are no longer displayed. Drop and refresh.
  availabilityCache = null
  if (await getShowAvailability()) {
    await refreshAvailability().catch((e) =>
      console.warn("[departing-soon] post-discovery availability refresh failed:", e),
    )
  }

  return {
    ok: true,
    slotsFound: collected.length,
    tripsWithSlots: new Set(collected.map((s) => s.tripId)).size,
    failedTripCount,
    tripsChecked: synced.length,
    daysFetched: windowDays,
    durationMs: Date.now() - start,
    rateLimitSkipped: false,
  }
}

// ── Lazy bootstrap / expiry refresh ────────────────────────────────────────
// Replaces the periodic discovery cron. Called from the read endpoint:
//   - if cache empty → fire bootstrap (read returns 503 once, then succeeds)
//   - if cache expired → fire refresh in the background, serve stale until done
//
// Both paths share `discoveryBootstrapInFlight` so concurrent reads don't race.

export function triggerDiscoveryBootstrap(): void {
  if (discoveryBootstrapInFlight) return
  discoveryBootstrapInFlight = refreshDiscovery(false)
    .catch((e) => console.warn("[departing-soon] bootstrap failed:", e))
    .finally(() => { discoveryBootstrapInFlight = null })
}

// ── Rate-limit tracking ────────────────────────────────────────────────────

interface RateLimitSnapshot {
  remaining: number
  recordedAt: number
}
let lastRateLimit: RateLimitSnapshot | null = null

export function recordRateLimit(remaining: number) {
  lastRateLimit = { remaining, recordedAt: Date.now() }
}
export function getLastKnownRateLimit(): RateLimitSnapshot | null {
  if (!lastRateLimit) return null
  if (Date.now() - lastRateLimit.recordedAt > 10 * 60 * 1000) return null
  return lastRateLimit
}
