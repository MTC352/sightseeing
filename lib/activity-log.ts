import { query } from "@/lib/db"

/**
 * User-attributed activity / audit log to PostgreSQL.
 *
 * Distinct from `error_logs` (which captures API/AI/integration FAILURES).
 * This is a deliberate AUDIT TRAIL of who-did-what in the admin panel:
 * logins, CRUD on content (trips, blog, jobs, …), settings/integration
 * changes, user-management changes, and importer (Palisis) runs.
 *
 * Every write is FAIL-SOFT: a logging failure must never break the request
 * that triggered it.
 */

export interface ActivityLogEntry {
  id: number
  user_id: string | null
  user_name: string | null
  user_email: string | null
  user_role: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  context: Record<string, unknown> | null
  created_at: string
}

/** Minimal actor shape — works with a session payload or a raw user row. */
export interface ActivityActor {
  id?: string | null
  name?: string | null
  email?: string | null
  role?: string | null
}

let tableReady: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID,
        user_name TEXT,
        user_email TEXT,
        user_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        summary TEXT NOT NULL,
        context JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action, created_at DESC);
    `)
      .then(() => undefined)
      .catch((err) => {
        tableReady = null
        throw err
      })
  }
  return tableReady
}

// Audit entries are retained for a year — long enough to be a useful trail
// without growing unbounded. Pruned opportunistically and fail-soft.
const LOG_RETENTION_DAYS = 365

async function pruneOldLogs(): Promise<void> {
  try {
    await query(
      `DELETE FROM activity_log WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [String(LOG_RETENTION_DAYS)],
    )
  } catch (err) {
    console.error("[activity-log] prune failed:", err)
  }
}

/** UUIDs only — guards the user_id UUID column against non-uuid actor ids. */
function asUuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

/**
 * Persist an activity entry. Never throws — on any failure it falls back to
 * console.error so it can't take down the caller.
 */
export async function logActivity(entry: {
  actor?: ActivityActor | null
  action: string
  summary: string
  entityType?: string | null
  entityId?: string | number | null
  context?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await ensureTable()
    const actor = entry.actor ?? {}
    await query(
      `INSERT INTO activity_log
         (user_id, user_name, user_email, user_role, action, entity_type, entity_id, summary, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        asUuid(actor.id),
        actor.name?.slice(0, 200) ?? null,
        actor.email?.slice(0, 200) ?? null,
        actor.role?.slice(0, 50) ?? null,
        entry.action.slice(0, 100),
        entry.entityType?.slice(0, 50) ?? null,
        entry.entityId != null ? String(entry.entityId).slice(0, 200) : null,
        entry.summary.slice(0, 1000),
        entry.context ? JSON.stringify(entry.context) : null,
      ],
    )
    if (Math.random() < 0.03) void pruneOldLogs()
  } catch (err) {
    console.error("[activity-log] failed to persist activity:", err, "original:", entry)
  }
}

/** List recent activity (newest first) for the superadmin viewer. */
export async function dbListActivity(opts?: {
  limit?: number
  action?: string
  userId?: string
}): Promise<ActivityLogEntry[]> {
  await ensureTable()
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000)
  const where: string[] = []
  const params: (string | number)[] = []
  if (opts?.action) {
    params.push(opts.action)
    where.push(`action = $${params.length}`)
  }
  if (opts?.userId) {
    const uid = asUuid(opts.userId)
    if (uid) {
      params.push(uid)
      where.push(`user_id = $${params.length}`)
    }
  }
  params.push(limit)
  const whereSql = where.length ? `WHERE ${where.join(" AND ")} ` : ""
  return query<ActivityLogEntry>(
    `SELECT * FROM activity_log ${whereSql}ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  )
}

/** Distinct actors present in the log, for the actor filter dropdown. */
export async function dbListActivityActors(): Promise<
  { id: string; name: string | null; email: string | null }[]
> {
  await ensureTable()
  return query<{ id: string; name: string | null; email: string | null }>(
    `SELECT DISTINCT ON (user_id) user_id AS id, user_name AS name, user_email AS email
       FROM activity_log
      WHERE user_id IS NOT NULL
      ORDER BY user_id, created_at DESC`,
  )
}

/** Distinct actions present in the log, for the action filter dropdown. */
export async function dbListActivityActions(): Promise<string[]> {
  await ensureTable()
  const rows = await query<{ action: string }>(
    `SELECT DISTINCT action FROM activity_log ORDER BY action ASC`,
  )
  return rows.map((r) => r.action)
}
