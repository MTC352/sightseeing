import { NextResponse } from "next/server"
import { getRegiondoClient } from "@/lib/regiondo"
import type { RegiondoVariationDetail } from "@/lib/regiondo"
import { mapProductToTrip, mapVariation, mapOption } from "@/lib/regiondo-mapper"
import type { MappedVariation, MappedOption } from "@/lib/regiondo-mapper"
import {
  dbListRegiondoTrips,
  dbCreateRegiondoTrip,
  dbUpdateRegiondoTrip,
  dbReplaceVariations,
  dbReplaceOptions,
  dbInsertRegiondoSyncLog,
} from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { logError } from "@/lib/error-log"

export const dynamic = "force-dynamic"

// ── POST /api/admin/regiondo-import ───────────────────────────────────────────
//
// Bulk Regiondo (DMO) catalog importer. ONE-WAY: Regiondo API → our DB only.
//
// "Override existing" is scoped EXCLUSIVELY to source='regiondo' trips — the
// existence map below is built from dbListRegiondoTrips(), so Palisis trips can
// never be matched, updated, or deleted by this route (and vice-versa).
export async function POST(req: Request) {
  let session
  try {
    session = await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const body = (await req.json().catch(() => ({}))) as { override?: boolean }
  const overrideAll = body.override === true

  // ── 1. Load Regiondo client ─────────────────────────────────────────────────
  const regiondo = await getRegiondoClient()
  if (!regiondo) {
    const error =
      "Regiondo not configured — add the Public Key and Secret Key in Admin → Settings (DMO / Regiondo section)"
    await dbInsertRegiondoSyncLog({
      trigger_type: "manual",
      action: "import_run",
      note: `FAILED: ${error}`,
      changes: { ok: false, error, imported: 0, updated: 0, skipped: 0, total: 0, duration_ms: Date.now() - startedAt },
    })
    return NextResponse.json({ ok: false, imported: 0, updated: 0, skipped: 0, total: 0, error }, { status: 503 })
  }

  const logs: string[] = []

  // ── 2. Fetch the catalog ────────────────────────────────────────────────────
  logs.push(`[${ts()}] Fetching Regiondo product catalog (/products) …`)
  const list = await regiondo.listProducts({ limit: 250 })
  if (!list.ok) {
    const error = `Regiondo catalog fetch failed: ${list.error}`
    logs.push(`[${ts()}] ERROR: ${error}`)
    await dbInsertRegiondoSyncLog({
      trigger_type: "manual",
      action: "import_run",
      note: `FAILED: ${error}`,
      changes: { ok: false, error, imported: 0, updated: 0, skipped: 0, total: 0, duration_ms: Date.now() - startedAt, log: logs },
    })
    return NextResponse.json({ ok: false, error, imported: 0, updated: 0, skipped: 0, total: 0, log: logs }, { status: 502 })
  }

  const products = list.data
  logs.push(`[${ts()}] Catalog fetch complete — ${products.length} products to process.`)

  // ── 3. Load existing DMO trips keyed by regiondo_id (DMO-only scope) ─────────
  const existing = await dbListRegiondoTrips()
  const byRegiondoId = new Map(existing.filter((t) => t.regiondo_id).map((t) => [t.regiondo_id!, t]))
  logs.push(`[${ts()}] DB has ${existing.length} existing DMO trips.`)

  // ── 4. Process each product ──────────────────────────────────────────────────
  let imported = 0
  let updated = 0
  let skipped = 0
  let apiErrors = 0
  const today = new Date().toISOString().slice(0, 10)
  const results: Array<{ regiondoId: string; title: string; action: string; error?: string }> = []

  for (const summary of products) {
    const regiondoId = String(summary.product_id ?? "").trim()
    const leanTitle = String(summary.name ?? "")
    if (!regiondoId) {
      skipped++
      continue
    }

    const alreadyExists = byRegiondoId.has(regiondoId)
    if (alreadyExists && !overrideAll) {
      const local = byRegiondoId.get(regiondoId)!
      results.push({ regiondoId, title: local.title ?? leanTitle, action: "skipped_unchanged" })
      skipped++
      continue
    }

    try {
      // ── Fetch full detail (description, images, embedded variations) ──────────
      const detailRes = await regiondo.getProduct(regiondoId)
      const detail = detailRes.ok ? detailRes.data : null
      if (!detailRes.ok) {
        logs.push(`[${ts()}] WARN: getProduct failed for ${regiondoId} (${detailRes.error}) — using lean data`)
        apiErrors++
      }

      const mapped = mapProductToTrip(summary, detail)

      // ── Variations: prefer the dedicated endpoint, fall back to embedded ──────
      const varsRes = await regiondo.getVariations(regiondoId)
      let variationSource: RegiondoVariationDetail[] = varsRes.ok ? varsRes.data : []
      if ((!varsRes.ok || variationSource.length === 0) && detail?.variations?.length) {
        variationSource = detail.variations
      }
      if (!varsRes.ok) apiErrors++

      const mappedVariations: MappedVariation[] = []
      const mappedOptions: MappedOption[] = []
      for (let i = 0; i < variationSource.length; i++) {
        const mv = mapVariation(variationSource[i], i)
        if (!mv) continue
        mappedVariations.push(mv)

        // ── Options (today's static metadata; qty_left is dropped by the mapper) ─
        const optRes = await regiondo.getAvailOptions(mv.variationId, today)
        if (optRes.ok) {
          let idx = 0
          for (const [optKey, opt] of Object.entries(optRes.data)) {
            const mo = mapOption(mv.variationId, optKey, opt, idx++)
            if (mo) mappedOptions.push(mo)
          }
        } else {
          apiErrors++
        }
      }

      // ── Write trip + variations + options ─────────────────────────────────────
      let tripId: string
      if (!alreadyExists) {
        const created = await dbCreateRegiondoTrip(mapped)
        tripId = created.id
        results.push({ regiondoId, title: mapped.title, action: "created" })
        logs.push(`[${ts()}] Created DMO trip ${regiondoId}: "${mapped.title}" (${mappedVariations.length} variations, ${mappedOptions.length} options)`)
        imported++
      } else {
        const local = byRegiondoId.get(regiondoId)!
        await dbUpdateRegiondoTrip(local.id, mapped, { preservePermalink: !!local.permalink })
        tripId = local.id
        results.push({ regiondoId, title: mapped.title, action: "updated" })
        logs.push(`[${ts()}] Updated DMO trip ${regiondoId}: "${mapped.title}" (${mappedVariations.length} variations, ${mappedOptions.length} options)`)
        updated++
      }

      await dbReplaceVariations(tripId, regiondoId, mappedVariations)
      await dbReplaceOptions(tripId, regiondoId, mappedOptions)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`[${ts()}] ERROR processing product ${regiondoId}: ${msg}`)
      results.push({ regiondoId, title: leanTitle || regiondoId, action: "error", error: msg })
      void logError({ source: "regiondo", message: `Import failed for product ${regiondoId}: ${msg}`, context: { regiondoId } })
      skipped++
    }
  }

  const durationMs = Date.now() - startedAt
  const summaryNote = [
    `${products.length} products in catalog.`,
    imported > 0 ? `${imported} new DMO trips imported.` : null,
    updated > 0 ? `${updated} trips updated (override).` : null,
    skipped > 0 ? `${skipped} skipped (unchanged or error).` : null,
    apiErrors > 0 ? `${apiErrors} Regiondo API errors (partial data).` : null,
    `Completed in ${(durationMs / 1000).toFixed(1)}s.`,
  ]
    .filter(Boolean)
    .join(" ")

  logs.push(`[${ts()}] Done. ${summaryNote}`)

  // ── 5. Write import-run log + activity log ───────────────────────────────────
  await dbInsertRegiondoSyncLog({
    trigger_type: "manual",
    action: "import_run",
    note: summaryNote,
    changes: {
      ok: true,
      total: products.length,
      imported,
      updated,
      skipped,
      api_errors: apiErrors,
      override_mode: overrideAll,
      duration_ms: durationMs,
      products: results,
      log: logs,
    },
  })

  void logActivity({
    actor: session,
    action: "regiondo.import",
    entityType: "regiondo",
    summary: `Ran DMO/Regiondo catalog import: ${imported} imported, ${updated} updated, ${skipped} skipped of ${products.length} products`,
    context: { total: products.length, imported, updated, skipped, api_errors: apiErrors, override_mode: overrideAll },
  })

  return NextResponse.json({
    ok: true,
    imported,
    updated,
    skipped,
    total: products.length,
    apiErrors: apiErrors > 0 ? apiErrors : undefined,
    note: summaryNote,
    log: logs,
  })
}

function ts() {
  return new Date().toISOString().slice(11, 23)
}
