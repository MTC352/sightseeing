/**
 * GET  → returns the resolved trip-field policy (defaults merged with stored overrides).
 * PUT  → replaces the stored policy in `integrations` (key='trip_field_policy').
 *
 * Read-only here means UI-only. Palisis sync is unaffected.
 */
import { NextResponse } from "next/server"
import { dbGetIntegration, dbUpsertIntegration } from "@/lib/db/queries"
import {
  resolvePolicy,
  resolveTripFieldSettings,
  TRIP_FIELDS,
  type TripFieldPolicy,
  type TripFieldSettings,
  type FieldMode,
} from "@/lib/trip-field-policy"
import { requirePermission } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

const KEY = "trip_field_policy"
const LABEL = "Trip Field Policy"
const SETTINGS_KEY = "trip_field_settings"
const SETTINGS_LABEL = "Trip Field Settings"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

async function loadSettings(): Promise<TripFieldSettings> {
  const row = await dbGetIntegration(SETTINGS_KEY) as { value?: string } | null
  let stored: Partial<TripFieldSettings> | null = null
  if (row?.value) {
    try { stored = JSON.parse(row.value) } catch { stored = null }
  }
  return resolveTripFieldSettings(stored)
}

export async function GET() {
  try {
    await requirePermission("integrations")
    const row = await dbGetIntegration(KEY) as { value?: string } | null
    let stored: Partial<TripFieldPolicy> | null = null
    if (row?.value) {
      try { stored = JSON.parse(row.value) } catch { stored = null }
    }
    const settings = await loadSettings()
    return NextResponse.json({ policy: resolvePolicy(stored), fields: TRIP_FIELDS, settings })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings/trip-fields] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    await requirePermission("integrations")
    const body = await req.json() as {
      policy?: Record<string, FieldMode>
      settings?: Partial<TripFieldSettings>
    }

    // Persist per-field policy only when provided (lets the settings toggle save
    // independently without round-tripping the whole policy).
    if (body.policy) {
      const allowed = new Set(TRIP_FIELDS.map(f => f.key))
      const clean: TripFieldPolicy = {}
      for (const [k, v] of Object.entries(body.policy)) {
        if (allowed.has(k) && (v === "editable" || v === "readonly")) clean[k] = v
      }
      await dbUpsertIntegration(KEY, LABEL, JSON.stringify(clean))
    }

    // Persist UI-behavior settings when provided.
    if (body.settings) {
      const cleanSettings = resolveTripFieldSettings(body.settings)
      await dbUpsertIntegration(SETTINGS_KEY, SETTINGS_LABEL, JSON.stringify(cleanSettings))
    }

    // Always return the current resolved state.
    const row = await dbGetIntegration(KEY) as { value?: string } | null
    let stored: Partial<TripFieldPolicy> | null = null
    if (row?.value) {
      try { stored = JSON.parse(row.value) } catch { stored = null }
    }
    const settings = await loadSettings()
    return NextResponse.json({ ok: true, policy: resolvePolicy(stored), settings })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings/trip-fields] PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
