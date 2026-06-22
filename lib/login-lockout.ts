/**
 * lib/login-lockout.ts
 * DB-backed per-account login lockout.
 *
 * Lockout state lives in admin_users.failed_login_attempts and
 * admin_users.locked_until. Because the state is in PostgreSQL it is shared
 * across all application instances and survives restarts — there is no bypass
 * through IP rotation, horizontal scale-out, or cold starts.
 *
 * Lockout is keyed by admin_users.id (canonical, not by the submitted
 * identifier string) so an attacker cannot split the counter by alternating
 * between the email and username for the same account.
 *
 * Tiers (consecutive failures → lockout window):
 *   0–4   failures: no lockout, attempt is allowed
 *   5–9   failures: 5-minute lockout
 *   10–19 failures: 30-minute lockout
 *   20+   failures: 2-hour lockout
 *
 * A successful authentication resets both columns immediately.
 */

import { queryOne } from "@/lib/db"

/** Milliseconds per lockout tier keyed by the lower bound of the failure range. */
const TIERS: [failures: number, windowMs: number][] = [
  [20, 2 * 60 * 60 * 1000],   // 20+  → 2 hours
  [10, 30 * 60 * 1000],        // 10+  → 30 minutes
  [5,  5 * 60 * 1000],         // 5+   → 5 minutes
]

function lockoutWindowMs(failures: number): number {
  for (const [threshold, ms] of TIERS) {
    if (failures >= threshold) return ms
  }
  return 0
}

/**
 * Atomically increment the failure counter for an account and apply a lockout
 * window if the new count crosses a tier boundary. Returns the remaining
 * lockout seconds after the increment (0 when no lockout applies yet).
 */
export async function recordDbLoginFailure(userId: string): Promise<number> {
  const row = await queryOne<{ failed_login_attempts: number; locked_until: string | null }>(
    `UPDATE admin_users
        SET failed_login_attempts = failed_login_attempts + 1
      WHERE id = $1
      RETURNING failed_login_attempts, locked_until`,
    [userId],
  )
  if (!row) return 0

  const failures = row.failed_login_attempts
  const windowMs = lockoutWindowMs(failures)
  if (windowMs === 0) return 0

  // Apply a new lockout window if this increment crossed a tier boundary.
  const updated = await queryOne<{ locked_until: string }>(
    `UPDATE admin_users
        SET locked_until = NOW() + ($1 || ' milliseconds')::INTERVAL
      WHERE id = $2
        AND (locked_until IS NULL OR locked_until < NOW() + ($1 || ' milliseconds')::INTERVAL)
      RETURNING locked_until`,
    [windowMs, userId],
  )

  const lockedUntil = updated
    ? new Date(updated.locked_until).getTime()
    : (row.locked_until ? new Date(row.locked_until).getTime() : 0)

  return lockedUntil > Date.now() ? Math.ceil((lockedUntil - Date.now()) / 1000) : 0
}

/**
 * Reset the failure counter and lockout after a successful authentication.
 */
export async function resetDbLoginFailures(userId: string): Promise<void> {
  await queryOne(
    `UPDATE admin_users
        SET failed_login_attempts = 0,
            locked_until = NULL
      WHERE id = $1`,
    [userId],
  )
}
