import { NextResponse } from "next/server"
import { getTourCMSClient } from "@/lib/tourcms"
import type { TourDetail, TourSummary } from "@/lib/tourcms"
import { dbGetSettings, dbCreateTrip, dbUpdateTrip, dbListTrips, dbInsertPalisisSyncLog } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

// ── Field mapping: TourCMS tour response → our trips DB schema ────────────────
function mapTourDetail(t: TourDetail | TourSummary) {
  const full = t as TourDetail

  const tourId = String(t.tour_id ?? "")
  const title  = String(t.tour_name_long ?? t.tour_name ?? "")

  const desc = String(
    full.shortdesc ?? full.summary ?? (t as TourSummary).description ?? (t as TourSummary).tagline ?? ""
  )

  const price = parseFloat(String(t.from_price ?? "0")) || 0

  const images = full.images?.image
  const image  = String(
    (Array.isArray(images) ? images[0]?.url ?? images[0]?.url_thumbnail : undefined)
    ?? (t as TourSummary).image_url
    ?? full.thumbnail_image
    ?? ""
  )

  const duration = String(full.duration_desc ?? t.duration ?? (t as TourSummary).duration_description ?? "")
  const location = String(t.location ?? (t as TourSummary).location_summary ?? "Luxembourg")
  const supplier = String((t as TourSummary).supplier_name ?? "Sightseeing.lu")

  const palisisBookUrl = String(full.book_url ?? t.tour_url ?? "")

  return {
    palisisId:         tourId,
    title,
    description:       desc,
    price,
    duration,
    category:          "Tours",
    tags:              [] as string[],
    city:              location,
    provider:          supplier,
    image,
    highlights:        [] as string[],
    badge:             null,
    rating:            0,
    reviewCount:       0,
    featured:          false,
    featuredDeparture: false,
    status:            "published" as const,
    permalink:         palisisBookUrl || null,
    originalPrice:     null,
  }
}

// ── POST /api/admin/palisis-import ────────────────────────────────────────────
export async function POST(req: Request) {
  const startedAt = Date.now()
  const body = await req.json().catch(() => ({})) as { override?: boolean }
  const overrideAll = body.override === true

  // ── 1. Load TourCMS client ─────────────────────────────────────────────────
  const tourcms = await getTourCMSClient()

  if (!tourcms) {
    const settings = await dbGetSettings()
    const hasKey   = !!(settings?.apiKeys as Record<string, string>)?.palisis
    const error    = hasKey
      ? "TourCMS Channel ID missing — set it in Admin → Integrations (Palisis / TourCMS section)"
      : "TourCMS not configured — add API Key and Channel ID in Admin → Integrations"

    await dbInsertPalisisSyncLog({
      trigger_type: "manual",
      action: "import_run",
      note: `FAILED: ${error}`,
      changes: { ok: false, error, imported: 0, skipped: 0, total: 0, duration_ms: Date.now() - startedAt },
    })

    return NextResponse.json({ ok: false, imported: 0, skipped: 0, total: 0, error }, { status: 503 })
  }

  // ── 2. Fetch tour catalog — auto-detect Marketplace vs Tour Operator ────────
  //
  // Marketplace Partners:  GET /p/tours/list.xml  (channelId=0)
  //   — Returns all tours across ALL connected channels.
  //   — Includes has_sale=0 tours. Best for complete catalogs.
  //
  // Tour Operators:        GET /c/tours/search.xml  (channelId=their own)
  //   — /p/ returns FAIL_KEYNOTFOUND_PARTNERSONLY for non-partner keys.
  //   — /c/tours/search.xml is the correct fallback for direct operators.
  //
  const PER_PAGE = 200
  const tourList: TourSummary[] = []
  let importMode: "marketplace" | "operator" = "marketplace"
  const logs: string[] = []

  // Attempt 1: Marketplace Partner endpoint (/p/)
  logs.push(`[${ts()}] Attempting marketplace endpoint /p/tours/list.xml …`)
  const firstPageMP = await tourcms.listTours({ per_page: PER_PAGE, page: 1 })

  if (firstPageMP.ok) {
    // ── Marketplace Partner mode: /p/tours/list.xml ──────────────────────────
    importMode = "marketplace"
    logs.push(`[${ts()}] Marketplace endpoint OK — ${firstPageMP.total_tour_count} total tours reported.`)
    tourList.push(...firstPageMP.tours)

    let page = 2
    while (tourList.length < firstPageMP.total_tour_count && firstPageMP.tours.length >= PER_PAGE) {
      const r = await tourcms.listTours({ per_page: PER_PAGE, page })
      if (!r.ok) { logs.push(`[${ts()}] Pagination stopped at page ${page}: ${r.error}`); break }
      tourList.push(...r.tours)
      logs.push(`[${ts()}] Page ${page}: +${r.tours.length} tours (total so far: ${tourList.length})`)
      if (r.tours.length < PER_PAGE) break
      page++
      if (page > 50) break
    }

  } else {
    // ── Tour Operator mode fallback: /c/tours/list.xml ───────────────────────
    //
    // /p/tours/list.xml requires a Marketplace Partner account — Tour Operator
    // accounts receive HTTP 401. The correct operator endpoint is
    // /c/tours/list.xml which uses the operator's own channelId (not 0).
    // This returns all tours (both on-sale and draft) for the channel.
    //
    importMode = "operator"
    logs.push(`[${ts()}] Marketplace endpoint not available (${firstPageMP.error}) — switching to Tour Operator mode /c/tours/list.xml`)

    let page = 1
    while (true) {
      const r = await tourcms.listChannelTours({ per_page: PER_PAGE, page })
      if (!r.ok) {
        const error = `Tour catalog fetch failed (page ${page}): ${r.error}`
        logs.push(`[${ts()}] ERROR: ${error}`)

        await dbInsertPalisisSyncLog({
          trigger_type: "manual",
          action: "import_run",
          note: `FAILED: ${error}`,
          changes: {
            ok: false, error, imported: 0, skipped: 0, total: 0,
            import_mode: importMode,
            duration_ms: Date.now() - startedAt,
            log: logs,
          },
        })

        return NextResponse.json({ ok: false, error, imported: 0, skipped: 0, total: 0, log: logs }, { status: 502 })
      }
      tourList.push(...r.tours)
      logs.push(`[${ts()}] Page ${page}: ${r.tours.length} tours fetched (total so far: ${tourList.length} / ${r.total_tour_count})`)
      if (r.tours.length < PER_PAGE) break
      if (r.total_tour_count && tourList.length >= r.total_tour_count) break
      page++
      if (page > 50) break
    }
  }

  logs.push(`[${ts()}] Catalog fetch complete — ${tourList.length} tours to process (mode: ${importMode})`)

  // ── 3. Load existing DB trips keyed by palisis_id ─────────────────────────
  const existing = await dbListTrips() as Array<{
    id: string
    palisis_id?: string
    title?: string
    description?: string
    permalink?: string
  }>
  const byPalisis = new Map(
    existing.filter(t => t.palisis_id).map(t => [t.palisis_id!, t])
  )
  logs.push(`[${ts()}] DB has ${existing.length} existing trips, ${byPalisis.size} with palisis_id.`)

  // ── 4. Process each tour ──────────────────────────────────────────────────
  let imported  = 0
  let skipped   = 0
  let updated   = 0
  let apiErrors = 0
  const tourResults: Array<{ palisisId: string; title: string; action: string; error?: string }> = []

  for (const lean of tourList) {
    // ── Canonical ID always comes from the list response — never from showTour ──
    // The full detail response's tour_id may be typed differently or nested under
    // a different key depending on the XML parser. The list endpoint is the
    // authoritative source for tour IDs.
    const palisisId     = String(lean.tour_id ?? "").trim()
    const leanTitle     = String(lean.tour_name ?? lean.tour_name_long ?? "")
    const tourChannelId = Number(lean.channel_id) || undefined

    if (!palisisId) { skipped++; continue }

    try {
      if (!byPalisis.has(palisisId)) {
        // ── New tour: fetch full detail then create ──────────────────────────
        const detail = await tourcms.showTour(palisisId, { show_options: "1" }, tourChannelId)

        if (!detail.ok || !detail.tour) {
          // Fall back to lean (list) data — fewer fields but always available
          logs.push(`[${ts()}] WARN: showTour failed for ${palisisId} (${detail.error}) — using lean data`)
          const mapped = mapTourDetail(lean)
          await dbCreateTrip({ ...mapped, palisisId, title: leanTitle || mapped.title })
          tourResults.push({ palisisId, title: leanTitle || palisisId, action: "created_lean", error: detail.error })
          apiErrors++
        } else {
          // Use full detail, but ALWAYS use the lean tour_id as the DB key
          const mapped      = mapTourDetail(detail.tour)
          const displayTitle = String(detail.tour.tour_name_long ?? detail.tour.tour_name ?? leanTitle)
          await dbCreateTrip({ ...mapped, palisisId, title: displayTitle || leanTitle })
          tourResults.push({ palisisId, title: displayTitle || leanTitle, action: "created" })
          logs.push(`[${ts()}] Created trip ${palisisId}: "${displayTitle || leanTitle}"`)
        }
        imported++

      } else if (overrideAll) {
        // ── Override mode: re-fetch and update ──────────────────────────────
        const localTrip = byPalisis.get(palisisId)!
        const detail    = await tourcms.showTour(palisisId, { show_options: "1" }, tourChannelId)

        if (!detail.ok || !detail.tour) {
          logs.push(`[${ts()}] WARN: showTour failed for ${palisisId} (${detail.error}) — skipping update`)
          tourResults.push({ palisisId, title: localTrip.title ?? leanTitle, action: "skipped_api_error", error: detail.error })
          apiErrors++
          skipped++
          continue
        }

        const mapped       = mapTourDetail(detail.tour)
        const displayTitle = String(detail.tour.tour_name_long ?? detail.tour.tour_name ?? leanTitle)
        await dbUpdateTrip(localTrip.id, {
          title:       displayTitle || leanTitle || mapped.title,
          description: mapped.description,
          price:       mapped.price,
          duration:    mapped.duration,
          image:       mapped.image,
          city:        mapped.city,
          provider:    mapped.provider,
          ...(localTrip.permalink ? {} : { permalink: mapped.permalink }),
        })
        tourResults.push({ palisisId, title: displayTitle || leanTitle, action: "updated" })
        logs.push(`[${ts()}] Updated trip ${palisisId}: "${displayTitle || leanTitle}"`)
        updated++

      } else {
        // ── Existing, no override ────────────────────────────────────────────
        const localTrip = byPalisis.get(palisisId)!
        tourResults.push({
          palisisId,
          title: localTrip.title ?? leanTitle,
          action: "skipped_unchanged",
        })
        skipped++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`[${ts()}] ERROR processing tour ${palisisId}: ${msg}`)
      tourResults.push({ palisisId, title: leanTitle || palisisId, action: "error", error: msg })
      skipped++
    }
  }

  const durationMs = Date.now() - startedAt
  const summaryNote = [
    `Mode: ${importMode}.`,
    `${tourList.length} tours in catalog.`,
    imported > 0 ? `${imported} new trips imported.` : null,
    updated  > 0 ? `${updated} trips updated (override).` : null,
    skipped  > 0 ? `${skipped} skipped (unchanged or existing).` : null,
    apiErrors > 0 ? `${apiErrors} showTour API errors (used lean data).` : null,
    `Completed in ${(durationMs / 1000).toFixed(1)}s.`,
  ].filter(Boolean).join(" ")

  logs.push(`[${ts()}] Done. ${summaryNote}`)

  // ── 5. Write import run log to DB ─────────────────────────────────────────
  await dbInsertPalisisSyncLog({
    trigger_type: "manual",
    action: "import_run",
    note: summaryNote,
    changes: {
      ok: true,
      import_mode: importMode,
      total: tourList.length,
      imported,
      updated,
      skipped,
      api_errors: apiErrors,
      override_mode: overrideAll,
      duration_ms: durationMs,
      tours: tourResults,
      log: logs,
    },
  })

  return NextResponse.json({
    ok: true,
    import_mode: importMode,
    imported,
    updated,
    skipped,
    total: tourList.length,
    apiErrors: apiErrors > 0 ? apiErrors : undefined,
    note: summaryNote,
    log: logs,
  })
}

function ts() {
  return new Date().toISOString().slice(11, 23)
}
