import { query } from "@/lib/db"
import { sha256Hex } from "./hash"

// Lazy schema creation (same pattern as ensureRevisionsTable in queries.ts):
// created on first use so no separate migration step is needed.
let cacheTableReady: Promise<void> | null = null
function ensureCacheTable(): Promise<void> {
  if (!cacheTableReady) {
    cacheTableReady = query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        lang TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (lang, source_hash)
      );
    `)
      .then(() => undefined)
      .catch((err) => {
        cacheTableReady = null
        throw err
      })
  }
  return cacheTableReady
}

export async function getCachedTranslations(
  lang: string,
  texts: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (texts.length === 0) return out
  await ensureCacheTable()
  const hashes = texts.map((t) => sha256Hex(t))
  const rows = await query<{ source_text: string; translated_text: string }>(
    `SELECT source_text, translated_text FROM translation_cache
       WHERE lang = $1 AND source_hash = ANY($2::text[])`,
    [lang, hashes],
  )
  for (const r of rows) out.set(r.source_text, r.translated_text)
  return out
}

export async function putTranslations(
  lang: string,
  entries: Array<{ source: string; translated: string }>,
): Promise<void> {
  if (entries.length === 0) return
  await ensureCacheTable()
  // One multi-row upsert; ON CONFLICT DO NOTHING keeps the first translation.
  const values: string[] = []
  const params: unknown[] = []
  let i = 1
  for (const e of entries) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++})`)
    params.push(lang, sha256Hex(e.source), e.source, e.translated)
  }
  await query(
    `INSERT INTO translation_cache (lang, source_hash, source_text, translated_text)
       VALUES ${values.join(", ")}
       ON CONFLICT (lang, source_hash) DO NOTHING`,
    params,
  )
}
