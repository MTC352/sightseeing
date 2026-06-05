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

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
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

/** Check if the DB is reachable */
export async function checkConnection(): Promise<boolean> {
  try {
    await query("SELECT 1")
    return true
  } catch {
    return false
  }
}
