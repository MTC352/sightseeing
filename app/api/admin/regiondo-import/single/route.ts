import { NextResponse } from "next/server"
import { syncSingleTripFromRegiondo } from "@/lib/regiondo-sync"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"

export const dynamic = "force-dynamic"

// POST /api/admin/regiondo-import/single
// body: { regiondoId: string }
//
// ⚠️  ONE-WAY: Re-fetches a single Regiondo (DMO) product and overrides our DB
// row. STATIC data only; never pushes data back to Regiondo. Each run is logged
// to regiondo_sync_log (action='single_sync') with full details.
export async function POST(req: Request) {
  let session
  try {
    session = await requireAdminSession()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { regiondoId?: string }
  const regiondoId = String(body.regiondoId ?? "").trim()
  if (!regiondoId) {
    return NextResponse.json({ ok: false, error: "regiondoId required" }, { status: 400 })
  }

  const result = await syncSingleTripFromRegiondo(regiondoId, "manual")

  if (result.ok) {
    void logActivity({
      actor: session,
      action: "regiondo.import_single",
      entityType: "regiondo",
      entityId: regiondoId,
      summary: `Re-imported DMO/Regiondo product ${regiondoId} ("${result.title ?? regiondoId}")`,
      context: {
        regiondoId,
        action: result.action,
        variations: result.variations,
        options: result.options,
      },
    })
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
