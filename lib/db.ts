/**
 * lib/db.ts
 * PostgreSQL connection pool singleton.
 * Replaces the in-memory admin-store for all persistent operations.
 */
import { Pool } from "pg"

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
}

/**
 * Build the pg Pool config from DATABASE_URL.
 *
 * SSL handling: we set `ssl` EXPLICITLY and strip `sslmode` from the connection
 * string rather than letting pg-connection-string interpret it. As of
 * pg-connection-string >=2.x, `sslmode=require|prefer|verify-ca` are treated as
 * `verify-full` (full CA chain + hostname verification). Production's
 * DATABASE_URL uses `sslmode=require`, so the parser applies strict
 * verification; any trust-store / hostname mismatch in the deploy environment
 * then terminates the connection ("Connection terminated unexpectedly"). We
 * encrypt in transit but skip chain verification (`rejectUnauthorized: false`)
 * — the historical meaning of `sslmode=require` and the standard pattern for
 * Replit-managed Postgres. `sslmode=disable` (the dev DB) keeps SSL off.
 */
function buildPoolConfig() {
  const raw = process.env.DATABASE_URL
  const base = {
    max: 10,
    idleTimeoutMillis: 30000,
    // Generous connect timeout so a cold/suspended managed DB has time to wake
    // on the first connection instead of failing fast during a deploy.
    connectionTimeoutMillis: 15000,
  }
  if (!raw) return base
  try {
    const u = new URL(raw)
    const mode = u.searchParams.get("sslmode")
    const ssl: false | { rejectUnauthorized: boolean } =
      mode && mode !== "disable" ? { rejectUnauthorized: false } : false
    u.searchParams.delete("sslmode")
    return { ...base, connectionString: u.toString(), ssl }
  } catch {
    // Non-URL connection string: pass it through untouched and let the driver /
    // libpq apply its own SSL behavior. Do NOT force ssl:false here — that could
    // silently downgrade an otherwise-encrypted connection to plaintext.
    return { ...base, connectionString: raw }
  }
}

function createPool(): Pool {
  const pool = new Pool(buildPoolConfig())
  pool.on("error", (err) => {
    console.error("[db] Unexpected pool error:", err)
  })
  return pool
}

// Survive Next.js hot-module reloads in dev
export const pool: Pool = (global.__pgPool ??= createPool())

/** Run a query — returns rows array */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

/** Run a query and return the first row or null */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** A query function bound to a single transaction client. */
export type TxQuery = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

/**
 * Run `fn` inside a single BEGIN/COMMIT transaction. The callback receives a
 * query function bound to the transaction's client; everything either commits
 * together or rolls back on error. Use for multi-row destructive writes.
 */
export async function withTransaction<T>(
  fn: (q: TxQuery) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const q: TxQuery = async <R = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) => (await client.query(sql, params)).rows as R[]
    const result = await fn(q)
    await client.query("COMMIT")
    return result
  } catch (e) {
    try {
      await client.query("ROLLBACK")
    } catch {
      /* ignore rollback failure — original error is more useful */
    }
    throw e
  } finally {
    client.release()
  }
}

/**
 * Resolve `promise`, but fall back to `fallback` if it does not settle within
 * `ms`. Used to keep server-rendered, healthcheck-critical pages (e.g. the
 * homepage `/`) fast and deploy-safe: a cold/slow/contended DB connection can
 * otherwise block render for up to `connectionTimeoutMillis` per query, which
 * makes `/` exceed the deploy healthcheck deadline. These reads are all
 * additive (structured data, header/footer injection) and degrade gracefully.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
    timer.unref?.()
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Check if the DB is reachable */
export async function checkConnection(): Promise<boolean> {
  try {
    await query("SELECT 1")
    return true
  } catch {
    return false
  }
}
