/**
 * lib/regiondo-sync.ts
 *
 * Single-trip Regiondo (DMO) re-sync — mirrors lib/palisis-sync.ts.
 *
 * ⚠️ ONE-WAY: Regiondo API → our DB only. Re-fetches a SINGLE product (detail +
 * variations + options) and overrides our local DB row. Never pushes data back
 * to Regiondo. STATIC data only — live availability (dates/timeslots/qty_left)
 * is never persisted.
 *
 * Every run is recorded in regiondo_sync_log (action='single_sync') with full
 * details, exactly like the bulk importer and the Palisis single sync.
 */

import { getRegiondoClient } from "@/lib/regiondo"
import type { RegiondoProductSummary, RegiondoVariationDetail } from "@/lib/regiondo"
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
import { logError } from "@/lib/error-log"

export interface RegiondoSingleSyncResult {
  ok: boolean
  action: "created" | "updated" | "error"
  regiondoId: string
  title?: string
  variations?: number
  options?: number
  apiErrors?: number
  error?: string
  duration_ms: number
}

/**
 * Re-fetch one Regiondo product and override our local DB row.
 *
 * @param regiondoId — the Regiondo product_id
 * @param triggerType — "manual" | "webhook" — recorded in regiondo_sync_log
 */
export async function syncSingleTripFromRegiondo(
  regiondoId: string,
  triggerType: "manual" | "webhook" = "manual",
): Promise<RegiondoSingleSyncResult> {
  const startedAt = Date.now()
  const id = String(regiondoId ?? "").trim()
  const logs: string[] = []
  const ts = () => new Date().toISOString().slice(11, 23)

  if (!id) {
    return { ok: false, action: "error", regiondoId: id, error: "Missing regiondoId", duration_ms: 0 }
  }

  // ── Load client ──────────────────────────────────────────────────────────
  const regiondo = await getRegiondoClient()
  if (!regiondo) {
    const error =
      "Regiondo not configured — add the Public Key and Secret Key in Admin → Integrations (DMO / Regiondo)"
    await dbInsertRegiondoSyncLog({
      trigger_type: triggerType,
      action: "single_sync",
      regiondo_id: id,
      note: `FAILED: ${error}`,
      changes: { ok: false, error, regiondoId: id, duration_ms: Date.now() - startedAt },
    })
    return { ok: false, action: "error", regiondoId: id, error, duration_ms: Date.now() - startedAt }
  }

  let apiErrors = 0

  try {
    // ── Fetch full detail ────────────────────────────────────────────────────
    logs.push(`[${ts()}] Fetching Regiondo product ${id} (/products/${id}) …`)
    const detailRes = await regiondo.getProduct(id)
    if (!detailRes.ok) {
      const error = `Regiondo getProduct failed: ${detailRes.error}`
      logs.push(`[${ts()}] ERROR: ${error}`)
      await dbInsertRegiondoSyncLog({
        trigger_type: triggerType,
        action: "single_sync",
        regiondo_id: id,
        note: `FAILED: ${error}`,
        changes: { ok: false, error, regiondoId: id, duration_ms: Date.now() - startedAt, log: logs },
      })
      return { ok: false, action: "error", regiondoId: id, error, duration_ms: Date.now() - startedAt }
    }
    const detail = detailRes.data

    // The detail endpoint carries every field the mapper needs; synthesize a
    // minimal summary so the shared mapper signature is satisfied.
    const summary = { product_id: id } as RegiondoProductSummary
    const mapped = mapProductToTrip(summary, detail)

    // ── Variations (prefer the dedicated endpoint, fall back to embedded) ──────
    const varsRes = await regiondo.getVariations(id)
    let variationSource: RegiondoVariationDetail[] = varsRes.ok ? varsRes.data : []
    if ((!varsRes.ok || variationSource.length === 0) && detail?.variations?.length) {
      variationSource = detail.variations
    }
    if (!varsRes.ok) {
      apiErrors++
      logs.push(`[${ts()}] WARN: getVariations failed (${varsRes.error}) — using embedded data`)
    }

    const today = new Date().toISOString().slice(0, 10)
    const mappedVariations: MappedVariation[] = []
    const mappedOptions: MappedOption[] = []
    for (let i = 0; i < variationSource.length; i++) {
      const mv = mapVariation(variationSource[i], i)
      if (!mv) continue
      mappedVariations.push(mv)

      // Options (today's STATIC metadata; qty_left is dropped by the mapper).
      const optRes = await regiondo.getAvailOptions(mv.variationId, today)
      if (optRes.ok) {
        let idx = 0
        for (const [optKey, opt] of Object.entries(optRes.data)) {
          const mo = mapOption(mv.variationId, optKey, opt, idx++)
          if (mo) mappedOptions.push(mo)
        }
      } else {
        apiErrors++
        logs.push(`[${ts()}] WARN: getAvailOptions failed for variation ${mv.variationId} (${optRes.error})`)
      }
    }

    // ── Write trip + variations + options (DMO-scoped) ────────────────────────
    const existing = await dbListRegiondoTrips()
    const local = existing.find((t) => t.regiondo_id === id)

    let action: "created" | "updated"
    let tripId: string
    const title = mapped.title || `Product ${id}`

    if (!local) {
      const created = await dbCreateRegiondoTrip(mapped)
      tripId = created.id
      action = "created"
      logs.push(`[${ts()}] Created DMO trip ${id}: "${title}"`)
    } else {
      await dbUpdateRegiondoTrip(local.id, mapped, { preservePermalink: !!local.permalink })
      tripId = local.id
      action = "updated"
      logs.push(`[${ts()}] Updated DMO trip ${id}: "${title}"`)
    }

    await dbReplaceVariations(tripId, id, mappedVariations)
    await dbReplaceOptions(tripId, id, mappedOptions)

    const duration_ms = Date.now() - startedAt
    logs.push(
      `[${ts()}] Done — ${action} "${title}" (${mappedVariations.length} variations, ${mappedOptions.length} options${
        apiErrors > 0 ? `, ${apiErrors} API errors` : ""
      }) in ${(duration_ms / 1000).toFixed(2)}s`,
    )

    await dbInsertRegiondoSyncLog({
      trigger_type: triggerType,
      action: "single_sync",
      regiondo_id: id,
      note: `${action === "created" ? "Created" : "Updated"} "${title}" via ${triggerType} (${(
        duration_ms / 1000
      ).toFixed(2)}s)`,
      changes: {
        ok: true,
        regiondoId: id,
        tripId,
        title,
        action,
        variations: mappedVariations.length,
        options: mappedOptions.length,
        api_errors: apiErrors,
        duration_ms,
        log: logs,
      },
    })

    return {
      ok: true,
      action,
      regiondoId: id,
      title,
      variations: mappedVariations.length,
      options: mappedOptions.length,
      apiErrors: apiErrors > 0 ? apiErrors : undefined,
      duration_ms,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    logs.push(`[${ts()}] ERROR: ${error}`)
    void logError({ source: "regiondo", message: `Single sync failed for ${id}: ${error}`, context: { regiondoId: id } })
    await dbInsertRegiondoSyncLog({
      trigger_type: triggerType,
      action: "single_sync",
      regiondo_id: id,
      note: `FAILED: ${error}`,
      changes: { ok: false, error, regiondoId: id, api_errors: apiErrors, duration_ms: Date.now() - startedAt, log: logs },
    })
    return { ok: false, action: "error", regiondoId: id, error, duration_ms: Date.now() - startedAt }
  }
}
