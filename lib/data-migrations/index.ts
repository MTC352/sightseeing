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
import { query, queryOne, withTransaction } from "@/lib/db"
import adminDocs from "./data/001-admin-docs.json"
import aiSystemConfigs from "./data/003-ai-system-configs.json"
import ebikeConditionsMedia from "./data/005-ebike-conditions-media.json"
import mediaLibraryFiles from "./data/008-media-library-files.json"
import tripImages from "./data/009-trip-images.json"
import { TRIP_ITINERARY_SYSTEM_PROMPT } from "@/lib/ai/trip-itinerary-prompt"

export type MigrationResult = {
  inserted: number
  skipped: number
  /** Rows overwritten in-place (only when applied with overwrite). */
  updated?: number
  detail: string
}

/** Options passed to an overwrite-capable migration's apply(). */
export type ApplyOptions = {
  /** When true, overwrite existing rows instead of skipping them. */
  overwrite?: boolean
  /** Restrict the run to these natural keys (e.g. system_key). */
  onlyKeys?: string[]
}

export type DataMigration = {
  id: string
  name: string
  description: string
  /**
   * Whether this migration supports an opt-in overwrite of existing rows.
   * Defaults to false (pure skip-if-exists). Only set true for migrations
   * whose apply() honours ApplyOptions.overwrite.
   */
  overwritable?: boolean
  /** Idempotent data-only application. No DDL. */
  apply: (opts?: ApplyOptions) => Promise<MigrationResult>
}

/** The AI System prompts & settings migration — the overwrite-capable one. */
export const AI_SYSTEM_CONFIG_MIGRATION_ID = "003-ai-system-configs"

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

type MediaFileSeed = {
  filename: string
  title: string | null
  url: string
  mime_type: string
  size_bytes: number
  storage: string
  content_hash: string
  uploaded_by: string | null
}

type TripImageSeed = {
  id: string
  image: string | null
  gallery: string[]
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
async function applyAiSystemConfigs(opts?: ApplyOptions): Promise<MigrationResult> {
  const overwrite = opts?.overwrite === true
  const onlyKeys = opts?.onlyKeys
  const configs = (aiSystemConfigs as AiSystemConfig[]).filter(
    (c) => !onlyKeys || onlyKeys.includes(c.system_key),
  )
  // Run as a single transaction so a multi-row overwrite is all-or-nothing.
  return withTransaction(async (q) => {
    let inserted = 0
    let skipped = 0
    let updated = 0
    for (const c of configs) {
      const values = [
        c.system_key,
        c.label,
        c.description ?? null,
        c.system_prompt ?? null,
        c.model ?? null,
        c.temperature ?? null,
        c.max_tokens ?? null,
        JSON.stringify(c.extra_config ?? {}),
      ]
      const existing = await q<{ system_key: string }>(
        `SELECT system_key FROM ai_system_configs WHERE system_key = $1 LIMIT 1`,
        [c.system_key],
      )
      if (existing.length > 0) {
        if (!overwrite) {
          skipped++
          continue
        }
        // Opt-in overwrite: replace the full row with the migration's saved values.
        const upd = await q<{ system_key: string }>(
          `UPDATE ai_system_configs
             SET label = $2, description = $3, system_prompt = $4, model = $5,
                 temperature = $6, max_tokens = $7, extra_config = $8::jsonb
           WHERE system_key = $1
           RETURNING system_key`,
          values,
        )
        if (upd.length > 0) updated++
        else skipped++
        continue
      }
      const ins = await q<{ system_key: string }>(
        `INSERT INTO ai_system_configs (system_key, label, description, system_prompt, model, temperature, max_tokens, extra_config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT (system_key) DO NOTHING
         RETURNING system_key`,
        values,
      )
      if (ins.length > 0) inserted++
      else skipped++
    }
    const parts = [`${inserted} inserted`]
    if (overwrite) parts.push(`${updated} overwritten`)
    parts.push(`${skipped} left untouched`)
    return { inserted, skipped, updated, detail: parts.join(", ") }
  })
}

/**
 * WordPress-style slug generator — a FROZEN copy of `generateSlug` from
 * `lib/db/queries.ts` at the time this migration was written. It is intentionally
 * duplicated (not imported) so the migration's behaviour stays stable even if the
 * live app's slug rules change later.
 *
 * Never emits a slug that looks like a legacy trip id (pure digits or `tcms_NN`):
 * `proxy.ts` 308-redirects those segments as old id/palisis_id URLs, so such a
 * slug would be hijacked. Those are prefixed with `trip-` instead.
 */
function migTripSlugify(input: string): string {
  const slug = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
  if (slug === "" || /^(?:tcms_?\d+|\d+)$/.test(slug)) {
    return slug ? `trip-${slug}` : ""
  }
  return slug
}

/** A slug value that must be replaced: empty, or a legacy id-looking segment. */
function tripSlugNeedsBackfill(slug: string | null): boolean {
  const s = (slug ?? "").trim()
  return s === "" || /^(?:tcms_?\d+|\d+)$/.test(s)
}

/**
 * Backfill `trips.slug` for every trip whose slug is missing/empty or still looks
 * like a legacy id (`tcms_NN` / digits). The public `/trip/{slug}` URL falls back
 * to the raw id when the slug is absent, which is why production shows
 * `/trip/tcms_25` — those rows never had a slug generated.
 *
 * DATA-ONLY (UPDATEs existing rows; no DDL). Idempotent: a trip that already has a
 * real slug is skipped, so a second run leaves everything untouched. Slugs are made
 * unique against the live `trips` table (and against slugs assigned earlier in the
 * same run), mirroring `uniqueTripSlug` in queries.ts.
 */
async function applyTripSlugs(): Promise<MigrationResult> {
  const rows = await query<{ id: string; title: string | null; slug: string | null }>(
    `SELECT id, title, slug FROM trips ORDER BY id`,
  )
  let updated = 0
  let skipped = 0
  for (const r of rows) {
    if (!tripSlugNeedsBackfill(r.slug)) {
      skipped++
      continue
    }
    const base =
      migTripSlugify(String(r.title ?? "")) ||
      migTripSlugify(r.id) ||
      `trip-${r.id}`
    // Uniquify against the DB (excluding this row), appending -2, -3, … on clash.
    let suffix = 0
    let candidate = base
    while (true) {
      candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
      const clash = await queryOne<{ id: string }>(
        `SELECT id FROM trips WHERE slug = $1 AND id <> $2 LIMIT 1`,
        [candidate, r.id],
      )
      if (!clash) break
      suffix++
    }
    await query(`UPDATE trips SET slug = $1 WHERE id = $2`, [candidate, r.id])
    updated++
  }
  return {
    inserted: 0,
    skipped,
    updated,
    detail: `${updated} trip slug${updated === 1 ? "" : "s"} backfilled, ${skipped} already had a slug`,
  }
}

/**
 * Seed the "E-Bike Conditions" PDF into the media library (media_files) so it
 * appears in /admin/files on the live site, matching dev. The PDF binary itself
 * ships with the code (public/uploads/…); this migration only inserts the DB row
 * that records it in the library. DATA-ONLY (no DDL).
 *
 * Idempotent: deduplicated by content_hash via the partial unique index, so a
 * second run (or a file already uploaded in this DB) is left untouched.
 * uploaded_by is resolved through a subquery so a missing admin id degrades to
 * NULL rather than violating the foreign key.
 */
async function applyEbikeConditionsMedia(): Promise<MigrationResult> {
  const rows = ebikeConditionsMedia as MediaFileSeed[]
  let inserted = 0
  let skipped = 0
  for (const m of rows) {
    const ins = await queryOne<{ id: string }>(
      `INSERT INTO media_files (filename, title, url, mime_type, size_bytes, storage, content_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM admin_users WHERE id = $8))
       ON CONFLICT (content_hash) WHERE content_hash IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        m.filename,
        m.title,
        m.url,
        m.mime_type,
        m.size_bytes,
        m.storage,
        m.content_hash,
        m.uploaded_by,
      ],
    )
    if (ins) inserted++
    else skipped++
  }
  return {
    inserted,
    skipped,
    detail: `${inserted} media file${inserted === 1 ? "" : "s"} inserted, ${skipped} already present`,
  }
}

/**
 * Seed the FULL media library (media_files) so /admin/files on the live site
 * matches dev. The binaries themselves ship with the code (public/uploads/…);
 * this migration only inserts the DB rows that record them in the library.
 * DATA-only (no DDL).
 *
 * Idempotent: deduplicated by content_hash via the partial unique index, so a
 * file already present (incl. the E-Bike PDF from migration 005) is left
 * untouched. uploaded_by is resolved through a subquery so a missing admin id
 * degrades to NULL rather than violating the foreign key.
 */
async function applyMediaLibraryFiles(): Promise<MigrationResult> {
  const rows = mediaLibraryFiles as MediaFileSeed[]
  let inserted = 0
  let skipped = 0
  for (const m of rows) {
    const ins = await queryOne<{ id: string }>(
      `INSERT INTO media_files (filename, title, url, mime_type, size_bytes, storage, content_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM admin_users WHERE id = $8))
       ON CONFLICT (content_hash) WHERE content_hash IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        m.filename,
        m.title,
        m.url,
        m.mime_type,
        m.size_bytes,
        m.storage,
        m.content_hash,
        m.uploaded_by,
      ],
    )
    if (ins) inserted++
    else skipped++
  }
  return {
    inserted,
    skipped,
    detail: `${inserted} media file${inserted === 1 ? "" : "s"} inserted, ${skipped} already present`,
  }
}

/**
 * Apply the custom trip cover image + gallery photos uploaded in dev to the live
 * trips. Live trips otherwise still show the original Palisis/TourCMS CDN photos.
 * The image binaries ship with the code (public/uploads/…); this only UPDATEs the
 * trips.image and trips.gallery columns. DATA-only (no DDL).
 *
 * ⚠️ Palisis is the upstream source of truth for trips. A future Palisis sync of a
 * given trip MAY overwrite these image fields back to the CDN photos. Re-run this
 * migration after such a sync to re-apply the custom photos.
 *
 * Idempotent: a trip whose image + gallery already match the snapshot is skipped;
 * a trip id not present in the live DB is skipped (no insert).
 */
async function applyTripImages(): Promise<MigrationResult> {
  const seeds = tripImages as TripImageSeed[]
  let updated = 0
  let skipped = 0
  for (const t of seeds) {
    const res = await query<{ id: string }>(
      `UPDATE trips
         SET image = $2, gallery = $3::text[]
       WHERE id = $1
         AND (image IS DISTINCT FROM $2 OR gallery IS DISTINCT FROM $3::text[])
       RETURNING id`,
      [t.id, t.image, t.gallery],
    )
    if (res.length > 0) updated++
    else skipped++
  }
  return {
    inserted: 0,
    skipped,
    updated,
    detail: `${updated} trip image${updated === 1 ? "" : "s"} applied, ${skipped} already current or not present`,
  }
}

/**
 * Repair the homepage hero image on the live site. The live hero pointed at a
 * file uploaded directly on the published server (public/uploads/…) which is NOT
 * in the code repo and is wiped on every redeploy — hence the broken hero. This
 * sets the hero to a committed, always-present asset (public/images/…). DATA-only
 * (UPSERTs page_content rows; no DDL).
 *
 * Sets the modern `home:hero:images` key (a JSON array the hero component reads
 * first) and repairs the legacy single-image key only when it still points at a
 * (now-broken) /uploads path. Idempotent: re-running leaves an already-set
 * `home:hero:images` untouched, so admin edits made via the inline editor survive.
 */
async function applyHomeHeroImage(): Promise<MigrationResult> {
  const HERO_ASSET = "/images/hero-luxembourg.jpg"
  // Modern key: set only when absent so later admin edits aren't clobbered.
  const imagesIns = await query<{ element_id: string }>(
    `INSERT INTO page_content (page_slug, element_id, content)
     VALUES ('__inline__', 'home:hero:images', $1)
     ON CONFLICT (page_slug, element_id) DO NOTHING
     RETURNING element_id`,
    [JSON.stringify([HERO_ASSET])],
  )
  // Legacy key: repair ONLY an existing row that still points at a (broken)
  // /uploads file. A plain UPDATE is a no-op when the row is absent or already
  // clean — we never create a redundant legacy row.
  const legacyUpd = await query<{ element_id: string }>(
    `UPDATE page_content
        SET content = $1, updated_at = NOW()
      WHERE page_slug = '__inline__'
        AND element_id = 'home:hero:background-image'
        AND content LIKE '/uploads/%'
      RETURNING element_id`,
    [HERO_ASSET],
  )
  const inserted = imagesIns.length
  const updated = legacyUpd.length
  const parts: string[] = []
  parts.push(inserted > 0 ? "hero images set" : "hero images already set (left untouched)")
  if (updated > 0) parts.push("repaired broken legacy hero pointer")
  return {
    inserted,
    skipped: inserted > 0 ? 0 : 1,
    updated,
    detail: parts.join(", "),
  }
}

/**
 * Relocate any existing planner system-prompt OVERRIDE from its legacy location
 * (chat.extra_config.planner.systemPrompt) onto the planner row's own
 * `system_prompt` column — the consolidated location used by every other AI
 * System. The onboarding form (chat.extra_config.planner.form) is left in place.
 *
 * DATA-ONLY (UPDATE/INSERT rows; no DDL). Idempotent: if the planner row already
 * has a non-empty system_prompt, or there is no legacy override to copy, the run
 * is a no-op. The legacy value is intentionally NOT deleted — the runtime read
 * still falls back to it, and leaving it keeps the migration non-destructive.
 */
async function applyPlannerPromptRelocation(): Promise<MigrationResult> {
  const chatRow = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'chat'`,
  )
  const extra =
    chatRow?.extra_config && typeof chatRow.extra_config === "object"
      ? (chatRow.extra_config as Record<string, unknown>)
      : {}
  const plannerExtra =
    extra.planner && typeof extra.planner === "object"
      ? (extra.planner as Record<string, unknown>)
      : {}
  const legacy =
    typeof plannerExtra.systemPrompt === "string" ? plannerExtra.systemPrompt : ""
  if (!legacy.trim()) {
    return { inserted: 0, skipped: 1, detail: "No legacy planner override to relocate" }
  }
  const plannerRow = await queryOne<{ system_prompt: string | null }>(
    `SELECT system_prompt FROM ai_system_configs WHERE system_key = 'planner'`,
  )
  if (
    plannerRow &&
    typeof plannerRow.system_prompt === "string" &&
    plannerRow.system_prompt.trim()
  ) {
    return { inserted: 0, skipped: 1, detail: "planner.system_prompt already set" }
  }
  // Upsert only the system_prompt column; the planner row's behavior settings
  // (extra_config) and model are left untouched by the ON CONFLICT clause.
  const res = await queryOne<{ system_key: string }>(
    `INSERT INTO ai_system_configs (system_key, label, system_prompt)
     VALUES ('planner', 'Trip Planner', $1)
     ON CONFLICT (system_key) DO UPDATE SET system_prompt = $1, updated_at = NOW()
     RETURNING system_key`,
    [legacy],
  )
  return {
    inserted: plannerRow ? 0 : 1,
    skipped: 0,
    updated: plannerRow && res ? 1 : 0,
    detail: "Relocated legacy planner override to planner.system_prompt",
  }
}

async function applyBlogImageModelRepair(): Promise<MigrationResult> {
  const row = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'blog'`,
  )
  if (!row) {
    return {
      inserted: 0,
      skipped: 1,
      detail: "blog ai_system_configs row not found — run migration 003 first to seed it",
    }
  }
  const extra =
    row.extra_config && typeof row.extra_config === "object"
      ? (row.extra_config as Record<string, unknown>)
      : {}
  const currentModel = typeof extra.imageModel === "string" ? extra.imageModel.trim() : ""
  if (currentModel === "gpt-image-1") {
    return { inserted: 0, skipped: 1, detail: "imageModel already set to gpt-image-1 — no change needed" }
  }
  const updated = await query<{ system_key: string }>(
    `UPDATE ai_system_configs
     SET extra_config = COALESCE(extra_config, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
     WHERE system_key = 'blog'
     RETURNING system_key`,
    [JSON.stringify({ imageModel: "gpt-image-1" })],
  )
  const count = updated.length
  return {
    inserted: count,
    skipped: count === 0 ? 1 : 0,
    detail:
      count > 0
        ? `Updated blog imageModel from '${currentModel || "unset"}' to 'gpt-image-1'`
        : "blog row not updated (unexpected)",
  }
}

async function applyBlogCoverImageConfig(): Promise<MigrationResult> {
  const row = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'blog'`,
  )
  if (!row) {
    return { inserted: 0, skipped: 1, detail: "blog ai_system_configs row not found" }
  }
  const extra =
    row.extra_config && typeof row.extra_config === "object"
      ? (row.extra_config as Record<string, unknown>)
      : {}
  const hasImageModel = typeof extra.imageModel === "string" && extra.imageModel.trim() !== ""
  const hasImagePrompt = typeof extra.imagePrompt === "string" && extra.imagePrompt.trim() !== ""
  if (hasImageModel && hasImagePrompt) {
    return { inserted: 0, skipped: 1, detail: "blog extra_config.imageModel and imagePrompt already set" }
  }
  // Build patch for only the missing fields so we never clobber admin-edited values
  const patch: Record<string, string> = {}
  if (!hasImageModel) patch.imageModel = "gpt-image-1"
  if (!hasImagePrompt)
    patch.imagePrompt =
      "Professional travel photography, photorealistic, vibrant natural colors, soft natural lighting, sharp focus, high detail, no text, no watermark, no logos."
  // COALESCE guards against a NULL extra_config column (jsonb || jsonb returns NULL when left side is NULL)
  const updated = await query<{ system_key: string }>(
    `UPDATE ai_system_configs
     SET extra_config = COALESCE(extra_config, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
     WHERE system_key = 'blog'
     RETURNING system_key`,
    [JSON.stringify(patch)],
  )
  const count = updated.length
  return {
    inserted: count,
    skipped: count === 0 ? 1 : 0,
    detail:
      count > 0
        ? `Set blog extra_config fields: ${Object.keys(patch).join(", ")}`
        : "blog row not updated (unexpected)",
  }
}

export type AiConfigFieldKey =
  | "label"
  | "description"
  | "system_prompt"
  | "model"
  | "temperature"
  | "max_tokens"
  | "extra_config"

export type AiConfigFieldDiff = {
  field: AiConfigFieldKey
  /** Migration's saved value, normalised to a display string. */
  migration: string
  /** Current DB value, normalised to a display string (null when missing). */
  current: string | null
  differs: boolean
}

export type AiConfigComparison = {
  system_key: string
  label: string
  /** "missing" = no DB row; "identical" = all fields match; "different" = at least one field differs. */
  status: "missing" | "identical" | "different"
  fields: AiConfigFieldDiff[]
}

type AiConfigDbRow = {
  system_key: string
  label: string | null
  description: string | null
  system_prompt: string | null
  model: string | null
  temperature: number | string | null
  max_tokens: number | null
  extra_config: unknown
}

const AI_CONFIG_FIELDS: AiConfigFieldKey[] = [
  "label",
  "description",
  "system_prompt",
  "model",
  "temperature",
  "max_tokens",
  "extra_config",
]

/** Normalise any field value to a stable display/comparison string. */
function normaliseFieldValue(field: AiConfigFieldKey, value: unknown): string {
  if (value === null || value === undefined) return ""
  if (field === "extra_config") {
    try {
      const obj = typeof value === "string" ? JSON.parse(value) : value
      return JSON.stringify(obj ?? {}, null, 2)
    } catch {
      return String(value)
    }
  }
  if (field === "temperature") {
    const n = typeof value === "string" ? Number(value) : value
    return typeof n === "number" && Number.isFinite(n) ? String(n) : String(value)
  }
  return String(value)
}

/**
 * Compare every AI System config in migration 003's snapshot against the current
 * DB rows. Powers the admin "compare prompts" view so a superadmin can see exactly
 * what would change before overwriting (or copy values across manually).
 */
export async function getAiSystemConfigComparison(): Promise<AiConfigComparison[]> {
  const configs = aiSystemConfigs as AiSystemConfig[]
  const rows = await query<AiConfigDbRow>(
    `SELECT system_key, label, description, system_prompt, model, temperature, max_tokens, extra_config
       FROM ai_system_configs`,
  )
  const byKey = new Map(rows.map((r) => [r.system_key, r]))
  return configs.map((c) => {
    const dbRow = byKey.get(c.system_key)
    const fields: AiConfigFieldDiff[] = AI_CONFIG_FIELDS.map((field) => {
      const migration = normaliseFieldValue(
        field,
        (c as unknown as Record<string, unknown>)[field],
      )
      const current = dbRow
        ? normaliseFieldValue(field, (dbRow as unknown as Record<string, unknown>)[field])
        : null
      return { field, migration, current, differs: current !== null && current !== migration }
    })
    let status: AiConfigComparison["status"]
    if (!dbRow) status = "missing"
    else status = fields.some((f) => f.differs) ? "different" : "identical"
    return { system_key: c.system_key, label: c.label, status, fields }
  })
}

/**
 * Overwrite specific AI System config rows from migration 003's snapshot (per-row
 * "apply to live"). Inserts the row when missing, replaces it in full when present.
 */
export async function applyAiSystemConfigKeys(keys: string[]): Promise<MigrationResult> {
  const valid = (aiSystemConfigs as AiSystemConfig[]).map((c) => c.system_key)
  const onlyKeys = keys.filter((k) => valid.includes(k))
  if (onlyKeys.length === 0) {
    return { inserted: 0, skipped: 0, updated: 0, detail: "No matching AI System keys" }
  }
  return applyAiSystemConfigs({ overwrite: true, onlyKeys })
}

/**
 * Migration 012 — Move the "hidePublicPlanner" visibility flag from
 * planner.extra_config to itinerary.extra_config.
 *
 * The "Manage Trip Planner" admin page (system_key='itinerary') is now the
 * canonical home for the planner visibility toggle. This migration copies the
 * existing flag value (true/false) from the old location (planner.extra_config)
 * into itinerary.extra_config so the toggle works immediately after deploying
 * the code update — without requiring a manual setting change on the live site.
 *
 * The visibility API (/api/planner/visibility) reads BOTH sources and ORs them
 * during the transition period, so the gate keeps working before and after this
 * migration runs.
 *
 * Idempotent: a no-op when itinerary.extra_config.hidePublicPlanner is already
 * explicitly set (true or false).
 */
async function applyPlannerVisibilityToItinerary(): Promise<MigrationResult> {
  // Check if already migrated — itinerary row has hidePublicPlanner set.
  const itineraryRow = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'itinerary'`,
  )
  const itineraryExtra =
    itineraryRow?.extra_config && typeof itineraryRow.extra_config === 'object'
      ? (itineraryRow.extra_config as Record<string, unknown>)
      : {}

  if (typeof itineraryExtra.hidePublicPlanner === 'boolean') {
    return {
      inserted: 0,
      skipped: 1,
      detail: `itinerary.extra_config.hidePublicPlanner already set (${itineraryExtra.hidePublicPlanner}) — no migration needed`,
    }
  }

  // Read current value from planner.extra_config (source of truth before this migration).
  const plannerRow = await queryOne<{ extra_config: unknown }>(
    `SELECT extra_config FROM ai_system_configs WHERE system_key = 'planner'`,
  )
  const plannerExtra =
    plannerRow?.extra_config && typeof plannerRow.extra_config === 'object'
      ? (plannerRow.extra_config as Record<string, unknown>)
      : {}
  const hidePublicPlanner = plannerExtra.hidePublicPlanner === true

  // Merge hidePublicPlanner into itinerary.extra_config (non-destructive JSONB merge).
  const updated = await query<{ system_key: string }>(
    `UPDATE ai_system_configs
       SET extra_config = COALESCE(extra_config, '{}'::jsonb) || $1::jsonb,
           updated_at   = NOW()
     WHERE system_key = 'itinerary'
     RETURNING system_key`,
    [JSON.stringify({ hidePublicPlanner })],
  )

  if (updated.length === 0) {
    return {
      inserted: 0,
      skipped: 1,
      detail: 'itinerary row not found — skipped (run migration 003 first)',
    }
  }
  return {
    inserted: 1,
    skipped: 0,
    detail: `Copied hidePublicPlanner=${hidePublicPlanner} from planner.extra_config → itinerary.extra_config`,
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
      "Seeds the AI System configs shown under /admin/ai-systems (blog, chat + planner chat form, help, itinerary + tips, outdoor_today, planner + behavior settings). Excludes trip_itinerary (migration 002). Idempotent by default: existing rows are left untouched. Supports opt-in overwrite (compare + overwrite per prompt, or overwrite all) to push updated dev prompts/settings.",
    overwritable: true,
    apply: applyAiSystemConfigs,
  },
  {
    id: "004-trip-slugs",
    name: "Trip URL slugs backfill",
    description:
      "Backfills trips.slug for trips with a missing/empty or legacy id-style slug (tcms_NN / digits), so public URLs become /trip/{slug} instead of /trip/tcms_25. DATA-only (UPDATEs rows; no DDL). Idempotent: trips that already have a real slug are skipped. Slugs are made unique against the trips table, mirroring the app's own slug rules.",
    apply: applyTripSlugs,
  },
  {
    id: "005-ebike-conditions-media",
    name: "E-Bike Conditions PDF (media library)",
    description:
      "Records the 'E-Bike Conditions' PDF (linked in the site footer) in the media_files library so it appears under /admin/files on the live site. The PDF binary ships with the code (public/uploads/); this only inserts the DB row. DATA-only (no DDL). Idempotent: deduplicated by content_hash, so a second run is left untouched.",
    apply: applyEbikeConditionsMedia,
  },
  {
    id: "006-planner-prompt-relocation",
    name: "Planner prompt override relocation",
    description:
      "Relocates any existing planner system-prompt override from the legacy chat.extra_config.planner.systemPrompt location onto the planner AI System row's own system_prompt column, consolidating it with every other AI System. The onboarding form stays in chat.extra_config. DATA-only (no DDL). Idempotent: a no-op when planner.system_prompt is already set or there is no legacy override; the legacy value is left in place (non-destructive).",
    apply: applyPlannerPromptRelocation,
  },
  {
    id: "007-blog-cover-image-config",
    name: "Blog cover image AI config",
    description:
      "Adds imageModel ('gpt-image-1') and imagePrompt (base style guide) to the blog AI System's extra_config. These fields drive cover image generation in the Blog editor. DATA-only (no DDL). Idempotent: skipped when imageModel is already set.",
    apply: applyBlogCoverImageConfig,
  },
  {
    id: "008-media-library-files",
    name: "Media library files",
    description:
      "Records every uploaded file from dev in the media_files library so the full set appears under /admin/files on the live site (live otherwise shows only a handful). The file binaries ship with the code (public/uploads/); this only inserts the DB rows. DATA-only (no DDL). Idempotent: deduplicated by content_hash, so files already present (incl. the E-Bike PDF from migration 005) are left untouched.",
    apply: applyMediaLibraryFiles,
  },
  {
    id: "009-trip-images",
    name: "Custom trip photos",
    description:
      "Applies the custom trip cover image + gallery photos uploaded in dev to the live trips (live otherwise still shows the original Palisis/TourCMS CDN photos). The image binaries ship with the code (public/uploads/); this only UPDATEs trips.image and trips.gallery. DATA-only (no DDL). ⚠️ A future Palisis sync of a trip may overwrite these back to the CDN photos — re-run this migration after such a sync. Idempotent: trips already matching the snapshot, or not present in the live DB, are skipped.",
    apply: applyTripImages,
  },
  {
    id: "010-home-hero-image",
    name: "Homepage hero image fix",
    description:
      "Repairs the broken homepage hero on the live site. The live hero pointed at a file uploaded on the published server, which is wiped on redeploy. This points the hero at a committed, always-present asset (public/images/hero-luxembourg.jpg). DATA-only (UPSERTs page_content; no DDL). Idempotent: an already-set hero is left untouched, so inline-editor changes survive; the legacy pointer is repaired only when it still references a /uploads file. Change the hero anytime via the inline editor.",
    apply: applyHomeHeroImage,
  },
  {
    id: "011-blog-image-model-repair",
    name: "Blog cover image model repair (gpt-image-1)",
    description:
      "Force-sets the blog AI System's imageModel to 'gpt-image-1', overwriting any previous value (e.g. dall-e-3 / dall-e-2) that would fail on this account. Migration 007 only fills in a missing imageModel; this migration repairs an incorrect one too. Run this on the live site when blog cover image generation fails with an OpenAI model-not-found error. DATA-only (no DDL). Idempotent: no-op when imageModel is already 'gpt-image-1'.",
    apply: applyBlogImageModelRepair,
  },
  {
    id: "012-planner-visibility-to-itinerary",
    name: "Move planner visibility flag to itinerary config",
    description:
      "Moves the 'hidePublicPlanner' visibility toggle from planner.extra_config to itinerary.extra_config, where it is now managed by the 'Manage Trip Planner' admin page (/admin/ai-systems/itinerary). The visibility API reads both sources during the transition so the gate works before and after this migration. DATA-only (no DDL). Idempotent: a no-op when itinerary.extra_config.hidePublicPlanner is already set.",
    apply: applyPlannerVisibilityToItinerary,
  },
]

export type MigrationStatus = {
  id: string
  name: string
  description: string
  applied: boolean
  appliedAt: string | null
  /** Whether this migration supports the opt-in overwrite of existing rows. */
  overwritable: boolean
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
      overwritable: m.overwritable === true,
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
      updated?: number
      overwrote: boolean
      detail: string
    }
  | { id: string; ok: false; error: string }

/**
 * Run the given migrations in order (deduped). Any id also present in
 * `overwriteIds` is applied with overwrite=true — but only when that migration
 * is `overwritable`; for non-overwritable migrations the flag is ignored.
 */
export async function runMigrations(
  ids: string[],
  overwriteIds: string[] = [],
): Promise<RunResult[]> {
  const results: RunResult[] = []
  const overwriteSet = new Set(overwriteIds)
  // Dedupe while preserving order so a doubled id can't run twice in one call.
  for (const id of Array.from(new Set(ids))) {
    const m = DATA_MIGRATIONS.find((x) => x.id === id)
    if (!m) {
      results.push({ id, ok: false, error: "Unknown migration id" })
      continue
    }
    const overwrite = overwriteSet.has(id) && m.overwritable === true
    try {
      const res = await m.apply({ overwrite })
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
      results.push({ id, ok: true, recorded, overwrote: overwrite, ...res })
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message })
    }
  }
  return results
}
