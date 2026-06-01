import { query, queryOne } from "@/lib/db"

/**
 * Site-wide error logging to PostgreSQL.
 *
 * Used to persist API / AI / integration failures (e.g. Anthropic
 * "invalid x-api-key" 401s, TourCMS/Palisis failures, weather/reviews
 * outages, key-test failures) so admins can audit them in /admin/logs.
 *
 * Every write is FAIL-SOFT: a logging failure must never break the
 * request that triggered it.
 */

export interface ErrorLogEntry {
  id: number
  source: string
  level: "error" | "warn" | "info"
  message: string
  status_code: number | null
  context: Record<string, unknown> | null
  created_at: string
}

let tableReady: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'error',
        message TEXT NOT NULL,
        status_code INTEGER,
        context JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs (source, created_at DESC);
    `)
      .then(() => undefined)
      .catch((err) => {
        tableReady = null
        throw err
      })
  }
  return tableReady
}

/** Pull a human message + HTTP status out of an unknown thrown value. */
export function describeError(err: unknown): { message: string; statusCode: number | null } {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    const statusCode =
      typeof e.statusCode === "number"
        ? e.statusCode
        : typeof e.status === "number"
          ? (e.status as number)
          : null
    const message =
      typeof e.message === "string" && e.message
        ? e.message
        : (() => {
            try {
              return JSON.stringify(err)
            } catch {
              return "Unknown error"
            }
          })()
    return { message, statusCode }
  }
  return { message: String(err ?? "Unknown error"), statusCode: null }
}

/**
 * Bounded retention. The itinerary engine logs EVERY build (a deliberate audit
 * trail), which would otherwise grow error_logs without limit. To keep that
 * safe we (a) drop anything older than the retention window and (b) cap the
 * high-volume 'itinerary' source to its most recent rows. Runs probabilistically
 * (a few % of writes) so it adds negligible per-request cost, and is fail-soft.
 */
const LOG_RETENTION_DAYS = 30
// High-volume sources that record a deliberate audit trail (one row per build /
// per outbound API call) are capped to their most recent rows so they can't grow
// error_logs without bound.
const CAPPED_SOURCES: Record<string, number> = {
  itinerary: 5000,
  tourcms: 3000,
}

async function pruneOldLogs(): Promise<void> {
  try {
    await query(
      `DELETE FROM error_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [String(LOG_RETENTION_DAYS)],
    )
    for (const [source, maxRows] of Object.entries(CAPPED_SOURCES)) {
      await query(
        `DELETE FROM error_logs
          WHERE source = $1
            AND id NOT IN (
              SELECT id FROM error_logs WHERE source = $1
              ORDER BY created_at DESC LIMIT $2
            )`,
        [source, maxRows],
      )
    }
  } catch (err) {
    console.error("[error-log] prune failed:", err)
  }
}

/**
 * Persist an error to the database. Never throws — on any failure it
 * falls back to console.error so it can't take down the caller.
 */
export async function logError(entry: {
  source: string
  message: string
  level?: "error" | "warn" | "info"
  statusCode?: number | null
  context?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await ensureTable()
    await query(
      `INSERT INTO error_logs (source, level, message, status_code, context)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        entry.source.slice(0, 200),
        entry.level ?? "error",
        entry.message.slice(0, 4000),
        entry.statusCode ?? null,
        entry.context ? JSON.stringify(entry.context) : null,
      ]
    )
    // Opportunistic, fail-soft retention so high-volume build logging can't
    // grow the table without bound. Kept off the hot path of every write.
    if (Math.random() < 0.03) void pruneOldLogs()
  } catch (err) {
    console.error("[error-log] failed to persist error:", err, "original:", entry)
  }
}

/** Convenience: log directly from a thrown value. */
export async function logCaughtError(
  source: string,
  err: unknown,
  context?: Record<string, unknown> | null
): Promise<void> {
  const { message, statusCode } = describeError(err)
  await logError({ source, message, statusCode, context })
}

/** List recent error logs (newest first) for the admin viewer. */
export async function dbListErrorLogs(opts?: {
  limit?: number
  source?: string
  level?: "error" | "warn" | "info"
}): Promise<ErrorLogEntry[]> {
  await ensureTable()
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000)
  const where: string[] = []
  const params: (string | number)[] = []
  if (opts?.source) {
    params.push(opts.source)
    where.push(`source = $${params.length}`)
  }
  if (opts?.level) {
    params.push(opts.level)
    where.push(`level = $${params.length}`)
  }
  params.push(limit)
  const whereSql = where.length ? `WHERE ${where.join(" AND ")} ` : ""
  return query<ErrorLogEntry>(
    `SELECT * FROM error_logs ${whereSql}ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  )
}

/** Distinct sources present in the log, for filter chips. */
export async function dbListErrorLogSources(): Promise<string[]> {
  await ensureTable()
  const rows = await query<{ source: string }>(
    `SELECT DISTINCT source FROM error_logs ORDER BY source ASC`
  )
  return rows.map((r) => r.source)
}

/** Delete all logs (or just one source). Returns rows removed. */
export async function dbClearErrorLogs(source?: string): Promise<number> {
  await ensureTable()
  const row = source
    ? await queryOne<{ count: string }>(
        `WITH d AS (DELETE FROM error_logs WHERE source = $1 RETURNING 1) SELECT COUNT(*)::text AS count FROM d`,
        [source]
      )
    : await queryOne<{ count: string }>(
        `WITH d AS (DELETE FROM error_logs RETURNING 1) SELECT COUNT(*)::text AS count FROM d`
      )
  return parseInt(row?.count ?? "0", 10)
}
