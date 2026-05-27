/**
 * GET  → returns the resolved trip-field policy (defaults merged with stored overrides).
 * PUT  → replaces the stored policy in `integrations` (key='trip_field_policy').
 *
 * Read-only here means UI-only. Palisis sync is unaffected.
 */
import { NextResponse } from "next/server"
import { dbGetIntegration, dbUpsertIntegration } from "@/lib/db/queries"
import { resolvePolicy, TRIP_FIELDS, type TripFieldPolicy, type FieldMode } from "@/lib/trip-field-policy"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

const KEY = "trip_field_policy"
const LABEL = "Trip Field Policy"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    const row = await dbGetIntegration(KEY) as { value?: string } | null
    let stored: Partial<TripFieldPolicy> | null = null
    if (row?.value) {
      try { stored = JSON.parse(row.value) } catch { stored = null }
    }
    return NextResponse.json({ policy: resolvePolicy(stored), fields: TRIP_FIELDS })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings/trip-fields] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminSession()
    const body = await req.json() as { policy?: Record<string, FieldMode> }
    const incoming = body.policy ?? {}
    // Keep only known field keys and valid modes.
    const allowed = new Set(TRIP_FIELDS.map(f => f.key))
    const clean: TripFieldPolicy = {}
    for (const [k, v] of Object.entries(incoming)) {
      if (allowed.has(k) && (v === "editable" || v === "readonly")) clean[k] = v
    }
    await dbUpsertIntegration(KEY, LABEL, JSON.stringify(clean))
    return NextResponse.json({ ok: true, policy: resolvePolicy(clean) })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings/trip-fields] PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
