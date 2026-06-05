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
import aiSystemConfigs from "./data/003-ai-system-configs.json"
import { TRIP_ITINERARY_SYSTEM_PROMPT } from "@/lib/ai/trip-itinerary-prompt"

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

type AiSystemConfig = {
  system_key: string
  label: string
  description: string | null
  system_prompt: string | null
  model: string | null
  temperature: number | null
  max_tokens: number | null
  extra_config: unknown
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
 * Seed the "Itinerary Generator" (system_key='trip_itinerary') AI System config
 * row so the admin editor renders the default prompt/model and the single-trip
 * "Generate Itinerary with AI" tool resolves its prompt DB-first in production.
 * Idempotent: never overwrites an existing row (admin edits are preserved).
 */
async function applyTripItineraryConfig(): Promise<MigrationResult> {
  const existing = await queryOne<{ system_key: string }>(
    `SELECT system_key FROM ai_system_configs WHERE system_key = 'trip_itinerary' LIMIT 1`,
  )
  if (existing) {
    return { inserted: 0, skipped: 1, detail: "trip_itinerary config already present" }
  }
  await query(
    `INSERT INTO ai_system_configs (system_key, label, description, system_prompt, model, temperature, max_tokens, extra_config)
     VALUES ('trip_itinerary', 'Itinerary Generator',
       'Single Trip AIs — powers "Generate Itinerary with AI" on the trip edit page (step-by-step itinerary + optional Luxembourg map locations).',
       $1, 'anthropic/claude-haiku-4-5-20251001', 0.6, 1500, '{}'::jsonb)
     ON CONFLICT (system_key) DO NOTHING`,
    [TRIP_ITINERARY_SYSTEM_PROMPT],
  )
  return { inserted: 1, skipped: 0, detail: "trip_itinerary config seeded" }
}

/**
 * Seed the AI System configs (prompts, models, and settings) shown under
 * /admin/ai-systems: blog, chat (per-trip + planner chat form/prompt), help,
 * itinerary (incl. tips prompt + widgets), outdoor_today, and planner (incl.
 * planner behavior settings in extra_config). The `trip_itinerary` row is owned
 * by migration 002 and intentionally excluded here.
 * Idempotent: an existing row (matched by system_key) is left untouched so admin
 * prompt/model/settings edits are preserved.
 */
async function applyAiSystemConfigs(): Promise<MigrationResult> {
  const configs = aiSystemConfigs as AiSystemConfig[]
  let inserted = 0
  let skipped = 0
  for (const c of configs) {
    const existing = await queryOne<{ system_key: string }>(
      `SELECT system_key FROM ai_system_configs WHERE system_key = $1 LIMIT 1`,
      [c.system_key],
    )
    if (existing) {
      skipped++
      continue
    }
    await query(
      `INSERT INTO ai_system_configs (system_key, label, description, system_prompt, model, temperature, max_tokens, extra_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (system_key) DO NOTHING`,
      [
        c.system_key,
        c.label,
        c.description ?? null,
        c.system_prompt ?? null,
        c.model ?? null,
        c.temperature ?? null,
        c.max_tokens ?? null,
        JSON.stringify(c.extra_config ?? {}),
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
  {
    id: "002-trip-itinerary-ai-config",
    name: "Single Trip itinerary generator AI config",
    description:
      "Seeds the 'Itinerary Generator' AI System config (system_key='trip_itinerary') used by 'Generate Itinerary with AI' on the trip edit page. Idempotent: an existing row is left untouched so admin prompt/model edits are preserved.",
    apply: applyTripItineraryConfig,
  },
  {
    id: "003-ai-system-configs",
    name: "AI Systems prompts & settings",
    description:
      "Seeds the AI System configs shown under /admin/ai-systems (blog, chat + planner chat form, help, itinerary + tips, outdoor_today, planner + behavior settings). Excludes trip_itinerary (migration 002). Idempotent: existing rows are left untouched so admin prompt/model/settings edits are preserved.",
    apply: applyAiSystemConfigs,
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
