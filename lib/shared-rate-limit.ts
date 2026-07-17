/**
 * lib/shared-rate-limit.ts
 *
 * PostgreSQL-backed cross-instance rate limiter for expensive public routes.
 *
 * WHY THIS EXISTS:
 * The process-local Map in lib/rate-limit.ts is adequate for per-endpoint
 * per-IP throttling on a single-instance server, but it provides no protection
 * in an autoscaled deployment where multiple instances share the same upstream
 * quota (TourCMS API calls, AI tokens). An attacker distributing requests
 * across IPs and instances can bypass per-process limits entirely.
 *
 * APPROACH:
 * A single PostgreSQL table (shared_rate_limits) stores fixed-window counters
 * keyed by bucket name + window timestamp.  INSERT … ON CONFLICT … DO UPDATE
 * is atomic in PostgreSQL, so concurrent requests from different instances
 * share a single accurate counter without races.
 *
 * The table is created lazily with CREATE TABLE IF NOT EXISTS on first use.
 * This is safe across concurrent instances and idempotent.  The initialisation
 * promise is cached per-process so the DDL runs at most once per Node process.
 *
 * FAIL-OPEN:
 * On any DB error the limiter returns `allowed: true` so a transient database
 * issue or cold-start delay never blocks legitimate users.  Shared limiting is
 * a best-effort abuse control, not an availability gate.
 *
 * CLEANUP:
 * Old rows are pruned once per five-minute window per process to prevent the
 * table from growing without bound.  No external cron or trigger required.
 */

import { query } from "@/lib/db"

/* ── Table setup ─────────────────────────────────────────────────────────── */

const SETUP_SQL = `
  CREATE TABLE IF NOT EXISTS shared_rate_limits (
    bucket_key  TEXT    NOT NULL,
    window_start BIGINT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket_key, window_start)
  )
`

let _setupPromise: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!_setupPromise) {
    _setupPromise = query(SETUP_SQL)
      .then(() => { /* table exists */ })
      .catch(() => {
        // Reset so the next caller tries again (transient connection error).
        _setupPromise = null
      })
  }
  return _setupPromise
}

/* ── Periodic cleanup ────────────────────────────────────────────────────── */

let _lastPrune = 0

function maybePrune(): void {
  const now = Date.now()
  if (now - _lastPrune < 5 * 60_000) return
  _lastPrune = now
  // Fire-and-forget; failures are harmless (old rows just stay a bit longer).
  query(`DELETE FROM shared_rate_limits WHERE window_start < $1`, [
    now - 10 * 60_000,
  ]).catch(() => { /* ignore */ })
}

/* ── IP extraction ───────────────────────────────────────────────────────── */

/**
 * Extract the client IP from a request.  Mirrors the strategy in
 * lib/rate-limit.ts: prefer `x-real-ip` (set by the trusted proxy layer,
 * not forgeable by clients), then the RIGHTMOST hop in `x-forwarded-for`
 * (the nearest trusted proxy's addition).  The leftmost XFF entry can be
 * forged by the client and MUST NOT be used for rate limiting.
 */
export function getClientIp(request: Request): string {
  const headers = request.headers
  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const hops = forwarded.split(",").map((s) => s.trim()).filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return "unknown"
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export interface SharedRateLimitResult {
  allowed: boolean
  /** Remaining requests in the current window (approximate). */
  remaining: number
  /** Current count (approximate). */
  count: number
}

/**
 * Increment a shared (cross-instance) rate limit counter and check whether
 * the caller is within the allowed budget.
 *
 * @param key       Bucket identifier — use a stable string that describes the
 *                  protected resource, e.g. "avail_scan" (global budget) or
 *                  "planner:1.2.3.4" (per-IP).  Keep it short.
 * @param limit     Maximum requests allowed in the window.
 * @param windowMs  Window length in milliseconds.
 */
export async function sharedRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Promise<SharedRateLimitResult> {
  // Skip shared limiting in dev — the same single proxy IP would exhaust the
  // global budget and make the planner unusable during local development.
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, remaining: limit, count: 0 }
  }

  try {
    await ensureTable()
    maybePrune()

    const windowStart = Math.floor(Date.now() / windowMs) * windowMs

    const rows = await query<{ count: number }>(
      `INSERT INTO shared_rate_limits (bucket_key, window_start, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (bucket_key, window_start)
         DO UPDATE SET count = shared_rate_limits.count + 1
         RETURNING count`,
      [key, windowStart],
    )

    const count = rows[0]?.count ?? 1
    const allowed = count <= limit
    const remaining = Math.max(0, limit - count)
    return { allowed, remaining, count }
  } catch {
    // Fail open: a DB error must not break the user experience.
    return { allowed: true, remaining: limit, count: 0 }
  }
}
