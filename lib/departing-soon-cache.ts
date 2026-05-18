/**
 * lib/departing-soon-cache.ts
 *
 * Shared in-process caches for the "Departing Soon" homepage widget.
 *
 * Two-layer architecture:
 *   1. discoveryCache  — the top-5 candidate slots, rebuilt by a cron every
 *                        few minutes via datesndeals + checkavail walks.
 *   2. availabilityCache — per-slot real-time spaces_remaining, refreshed
 *                        far more often (one parallel checkavail per slot).
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
  startTimeUtcSeconds: number  // sort/match key
  priceDisplay: string
  componentKey: string
}

export interface AvailabilityRecord {
  spacesRemaining: number | "UNLIMITED"
  stillBookable: boolean
}

export interface DiscoveryCache {
  slots: DiscoverySlot[]
  refreshedAt: number
  failedTripCount: number
  tripsChecked: number
}

export interface AvailabilityCache {
  byTripId: Record<string, AvailabilityRecord>
  refreshedAt: number
}

// ── Module-level state ─────────────────────────────────────────────────────
// NOTE: This is process-local. If Replit scales horizontally each instance
// has its own cache — that's OK; the discovery cron warms all of them.

export let discoveryCache: DiscoveryCache | null = null
export let availabilityCache: AvailabilityCache | null = null
let availabilityRefreshLock: Promise<void> | null = null

// Bootstrap-in-progress guard so the lazy bootstrap doesn't fire twice
let discoveryBootstrapInFlight: Promise<void> | null = null

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

export async function getDiscoveryIntervalSeconds(): Promise<number> {
  return getNumericSetting("departing_soon_discovery_interval_seconds", 300, 60, 3600)
}
export async function getAvailabilityTtlSeconds(): Promise<number> {
  return getNumericSetting("departing_soon_availability_ttl_seconds", 20, 10, 120)
}
export async function getAutoUpdateIntervalSeconds(): Promise<number> {
  return getNumericSetting("departing_soon_auto_update_interval_seconds", 30, 15, 300)
}
export async function getAutoUpdateEnabled(): Promise<boolean> {
  try {
    const s = await dbGetSettings()
    const k = (s?.apiKeys as Record<string, string> | undefined) ?? {}
    return k.departing_soon_auto_update === "true"
  } catch {
    return false
  }
}

// ── refreshAvailability ────────────────────────────────────────────────────
// Pure async function — gated by:
//   1. In-flight lock (dedupe): if a refresh is already running, await it.
//   2. TTL: if last refresh was more recent than departing_soon_availability_ttl_seconds, skip.
//   3. Discovery cache must exist (otherwise nothing to refresh).
//
// Does ONE parallel checkavail per cached slot — currently max 5.

export async function refreshAvailability(): Promise<void> {
  // Fast path: if a refresh is in flight, share its promise. Checked first so
  // we never start two refresh cycles for the same burst of callers.
  if (availabilityRefreshLock) return availabilityRefreshLock

  // CRITICAL: assign the lock synchronously (before any await) so concurrent
  // callers that arrive between awaits in the prechecks below all see it.
  // The async body is wrapped in an IIFE and stored in the lock; any early
  // exit must clear the lock so the next caller can try again.
  availabilityRefreshLock = (async () => {
    try {
      const ttl = await getAvailabilityTtlSeconds()
      if (availabilityCache && (Date.now() - availabilityCache.refreshedAt) / 1000 < ttl) return
      if (!discoveryCache || discoveryCache.slots.length === 0) return

      const tourcms = await getTourCMSClient()
      if (!tourcms) return

      const slots = discoveryCache.slots
      const newAvailability: Record<string, AvailabilityRecord> = {}

      const results = await Promise.allSettled(
        slots.map((s) => tourcms.checkAvailability(s.palisisId, { date: s.date, r1: 1 })),
      )

      results.forEach((r, i) => {
        const slot = slots[i]
        if (r.status === "rejected") {
          // Transient — keep last known record if any
          newAvailability[slot.tripId] =
            availabilityCache?.byTripId[slot.tripId] ?? { spacesRemaining: 0, stillBookable: false }
          return
        }
        if (!r.value.ok) {
          newAvailability[slot.tripId] = { spacesRemaining: 0, stillBookable: false }
          return
        }
        const components = forceArray(r.value.components)
        const match = components.find(
          (c) => Number(c.start_time_utcseconds ?? 0) === slot.startTimeUtcSeconds,
        )
        if (!match) {
          newAvailability[slot.tripId] = { spacesRemaining: 0, stillBookable: false }
          return
        }
        const raw = match.spaces_remaining
        const spacesRemaining: number | "UNLIMITED" =
          raw === "UNLIMITED" ? "UNLIMITED" : Math.max(0, Number(raw ?? 0))
        newAvailability[slot.tripId] = { spacesRemaining, stillBookable: true }
      })

      availabilityCache = { byTripId: newAvailability, refreshedAt: Date.now() }
    } finally {
      availabilityRefreshLock = null
    }
  })()

  return availabilityRefreshLock
}

// ── Cron auth ──────────────────────────────────────────────────────────────
// Guards the /api/cron/* endpoints from public abuse. When CRON_SECRET is set,
// callers must present it as `?secret=` or `X-Cron-Secret` header. Without
// the env var, only same-origin / dev access is allowed (defense in depth via
// proxy.ts is still recommended in production).

import type { NextRequest } from "next/server"

export function isAuthorizedCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // No secret configured — only allow when request is internal (no Origin
    // header set, e.g. server-to-server / curl from within the container) or
    // from the same host. This is a soft guard; configure CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production"
  }
  const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-cron-secret")
  return provided === expected
}

// ── refreshDiscovery ───────────────────────────────────────────────────────
// Heavy: one datesndeals + up-to-3 checkavail calls per published+synced trip.
// Called only from the discovery cron + the admin "Refresh Now" button.
// Always finishes by triggering a refreshAvailability() pass on the new top-5.

export interface RefreshDiscoveryResult {
  ok: true
  slotsFound: number
  failedTripCount: number
  tripsChecked: number
  durationMs: number
  rateLimitSkipped: boolean
}

export async function refreshDiscovery(force: boolean): Promise<RefreshDiscoveryResult | { ok: false; error: string }> {
  const start = Date.now()
  const interval = await getDiscoveryIntervalSeconds()

  if (!force && discoveryCache && (Date.now() - discoveryCache.refreshedAt) / 1000 < interval) {
    return {
      ok: true,
      slotsFound: discoveryCache.slots.length,
      failedTripCount: discoveryCache.failedTripCount,
      tripsChecked: discoveryCache.tripsChecked,
      durationMs: 0,
      rateLimitSkipped: false,
    }
  }

  const tourcms = await getTourCMSClient()
  if (!tourcms) {
    return { ok: false, error: "TOURCMS_NOT_CONFIGURED" }
  }

  // Rate-limit guard — don't risk hitting the wall mid-cycle
  const rl = getLastKnownRateLimit()
  if (rl !== null && rl.remaining < 200) {
    console.warn(`[departing-soon] Skipping discovery — rate-limit remaining=${rl.remaining} < 200`)
    return {
      ok: true,
      slotsFound: discoveryCache?.slots.length ?? 0,
      failedTripCount: 0,
      tripsChecked: 0,
      durationMs: Date.now() - start,
      rateLimitSkipped: true,
    }
  }

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
  const in90 = new Date(Date.now() + 90 * 86_400_000)
  const horizon = `${in90.getFullYear()}-${String(in90.getMonth() + 1).padStart(2, "0")}-${String(in90.getDate()).padStart(2, "0")}`
  const nowUtcSeconds = Math.floor(Date.now() / 1000)

  let failedTripCount = 0
  const collected: DiscoverySlot[] = []

  for (const trip of synced) {
    try {
      const dnd = await tourcms.showDatesAndDeals(trip.palisis_id!, {
        startdate_start: ts,
        startdate_end: horizon,
        order: "start_date",
      })
      if (!dnd.ok || dnd.dates.length === 0) continue

      // Candidate dates: OPEN and not 0-spaces (UNLIMITED counts as bookable)
      const candidates = dnd.dates
        .filter((d) => {
          const status = (d.status ?? "").toUpperCase()
          const bookable = !status || status === "OPEN" || status === "AVAILABLE"
          if (!bookable) return false
          if (d.spaces_remaining === "0") return false
          return true
        })
        .slice(0, 3)

      let chosen: DiscoverySlot | null = null
      for (const cand of candidates) {
        const ca = await tourcms.checkAvailability(trip.palisis_id!, { date: cand.start_date, r1: 1 })
        if (!ca.ok) continue
        const comps = forceArray(ca.components)
          .filter((c) => Number(c.start_time_utcseconds ?? 0) > nowUtcSeconds)
          .sort((a, b) => Number(a.start_time_utcseconds ?? 0) - Number(b.start_time_utcseconds ?? 0))
        const earliest = comps[0]
        if (!earliest) continue

        chosen = {
          tripId: trip.id,
          palisisId: trip.palisis_id!,
          tripTitle: trip.title,
          tripImage: trip.image ?? "",
          tripPermalink: trip.permalink ?? "",
          tripCategory: trip.category ?? "Tours",
          tripCity: trip.city ?? "Luxembourg",
          date: earliest.start_date ?? cand.start_date,
          time: earliest.start_time ?? cand.start_time ?? "00:00",
          startTimeUtcSeconds: Number(earliest.start_time_utcseconds ?? 0),
          priceDisplay: earliest.total_price_display
            ?? cand.price_1_display
            ?? (cand.price_1 ? `${cand.price_1} €` : ""),
          componentKey: earliest.component_key ?? "",
        }
        break
      }

      if (chosen) collected.push(chosen)
    } catch (err) {
      failedTripCount++
      console.warn("[departing-soon] discovery: trip failed", trip.id, err)
    }
  }

  const top5 = collected
    .sort((a, b) => a.startTimeUtcSeconds - b.startTimeUtcSeconds)
    .slice(0, 5)

  discoveryCache = {
    slots: top5,
    refreshedAt: Date.now(),
    failedTripCount,
    tripsChecked: synced.length,
  }

  // Reset availability cache so the next read forces a fresh availability pass
  availabilityCache = null
  await refreshAvailability().catch((e) => console.warn("[departing-soon] post-discovery availability refresh failed:", e))

  return {
    ok: true,
    slotsFound: top5.length,
    failedTripCount,
    tripsChecked: synced.length,
    durationMs: Date.now() - start,
    rateLimitSkipped: false,
  }
}

// ── Lazy bootstrap ─────────────────────────────────────────────────────────
// In dev (no Scheduled Deployment running), we don't want the homepage to show
// an empty/503 forever. The read endpoint calls this to fire-and-forget a
// discovery refresh when the cache is empty.

export function triggerDiscoveryBootstrap(): void {
  if (discoveryBootstrapInFlight) return
  discoveryBootstrapInFlight = refreshDiscovery(false)
    .then(() => undefined)
    .catch((e) => console.warn("[departing-soon] bootstrap failed:", e))
    .finally(() => { discoveryBootstrapInFlight = null })
}

// ── Rate-limit tracking ────────────────────────────────────────────────────
// TourCMS doesn't reliably return rate-limit headers on every response, but
// when it does we record them here. The discovery cron consults this before
// kicking off a heavy cycle.

interface RateLimitSnapshot {
  remaining: number
  recordedAt: number
}
let lastRateLimit: RateLimitSnapshot | null = null

export function recordRateLimit(remaining: number) {
  lastRateLimit = { remaining, recordedAt: Date.now() }
}
export function getLastKnownRateLimit(): RateLimitSnapshot | null {
  // Treat anything older than 10 minutes as stale (unknown)
  if (!lastRateLimit) return null
  if (Date.now() - lastRateLimit.recordedAt > 10 * 60 * 1000) return null
  return lastRateLimit
}
