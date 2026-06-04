/**
 * lib/data-migrations/index.ts
 *
 * Code-defined, version-controlled DATA migrations.
 *
 * ⚠️ SCOPE: These migrations move CONTENT/DATA only (rows like help articles,
 * AI prompts, settings). They MUST NOT contain DDL (CREATE/ALTER/DROP TABLE).
 * Production *schema* is managed exclusively by Replit's Publish flow — see
 * `replit.md` ("Data Migrations") and the database skill. The `data_migrations`
 * tracking table itself is created in development and reaches production via
 * Publish, NOT by runtime DDL here.
 *
 * Each migration is IDEMPOTENT: running it twice is safe and never duplicates
 * rows. The admin runner (/admin/db-migrations) records applied migrations in
 * the `data_migrations` table so the UI can show dev vs live status.
 */
import { query, queryOne } from "@/lib/db"
import adminDocs from "./data/001-admin-docs.json"

export type MigrationResult = {
  inserted: number
  skipped: number
  detail: string
}

export type DataMigration = {
  id: string
  name: string
  description: string
  /** Idempotent data-only application. No DDL. */
  apply: () => Promise<MigrationResult>
}

type AdminDoc = {
  question: string
  answer: string
  category: string
  status: string
  sort_order: number
  audience: string
  attachments: unknown
}

/** Postgres "undefined_table" — the tracking table hasn't reached this DB yet. */
function isUndefinedTable(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "42P01"
  )
}

async function applyAdminDocs(): Promise<MigrationResult> {
  const docs = adminDocs as AdminDoc[]
  let inserted = 0
  let skipped = 0
  for (const d of docs) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM help_articles WHERE question = $1 AND audience = $2 LIMIT 1`,
      [d.question, d.audience],
    )
    if (existing) {
      skipped++
      continue
    }
    await query(
      `INSERT INTO help_articles (question, answer, category, status, sort_order, audience, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        d.question,
        d.answer,
        d.category,
        d.status ?? "published",
        d.sort_order ?? 0,
        d.audience ?? "admin",
        JSON.stringify(Array.isArray(d.attachments) ? d.attachments : []),
      ],
    )
    inserted++
  }
  return {
    inserted,
    skipped,
    detail: `${inserted} inserted, ${skipped} already present`,
  }
}

/**
 * The ordered registry. Add new migrations to the END with the next numeric id.
 * Keep ids stable once shipped — they are the tracking keys.
 */
export const DATA_MIGRATIONS: DataMigration[] = [
  {
    id: "001-admin-docs",
    name: "Admin documentation articles",
    description:
      "Seeds the internal admin documentation articles (help_articles, audience='admin') that power the /admin/docs page. Idempotent: existing articles with the same question are left untouched.",
    apply: applyAdminDocs,
  },
]

export type MigrationStatus = {
  id: string
  name: string
  description: string
  applied: boolean
  appliedAt: string | null
}

export async function getMigrationStatus(): Promise<{
  trackingTableMissing: boolean
  migrations: MigrationStatus[]
}> {
  let appliedRows: { id: string; applied_at: string }[] = []
  let trackingTableMissing = false
  try {
    appliedRows = await query<{ id: string; applied_at: string }>(
      `SELECT id, applied_at FROM data_migrations`,
    )
  } catch (e) {
    if (isUndefinedTable(e)) trackingTableMissing = true
    else throw e
  }
  const appliedMap = new Map(appliedRows.map((r) => [r.id, r.applied_at]))
  return {
    trackingTableMissing,
    migrations: DATA_MIGRATIONS.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      applied: appliedMap.has(m.id),
      appliedAt: appliedMap.get(m.id) ?? null,
    })),
  }
}

export type RunResult =
  | {
      id: string
      ok: true
      recorded: boolean
      inserted: number
      skipped: number
      detail: string
    }
  | { id: string; ok: false; error: string }

export async function runMigrations(ids: string[]): Promise<RunResult[]> {
  const results: RunResult[] = []
  // Dedupe while preserving order so a doubled id can't run twice in one call.
  for (const id of Array.from(new Set(ids))) {
    const m = DATA_MIGRATIONS.find((x) => x.id === id)
    if (!m) {
      results.push({ id, ok: false, error: "Unknown migration id" })
      continue
    }
    try {
      const res = await m.apply()
      let recorded = true
      try {
        await query(
          `INSERT INTO data_migrations (id, name) VALUES ($1,$2)
           ON CONFLICT (id) DO UPDATE SET applied_at = NOW(), name = EXCLUDED.name`,
          [m.id, m.name],
        )
      } catch (e) {
        // Tracking table not in this DB yet (publish pending). The data was
        // still applied idempotently, so report success with recorded=false.
        if (isUndefinedTable(e)) recorded = false
        else throw e
      }
      results.push({ id, ok: true, recorded, ...res })
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message })
    }
  }
  return results
}
