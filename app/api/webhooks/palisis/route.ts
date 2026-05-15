// ─────────────────────────────────────────────────────────────────────────────
// Palisis / TourCMS Webhook Receiver
//
// ⚠️  ONE-WAY: This endpoint ONLY receives notifications FROM Palisis.
// We never call back into Palisis from this handler. Every product update
// triggers a fresh re-fetch via showTour and overrides our local DB.
//
// Configure in TourCMS to POST trip-update events to:
//   {YOUR_DOMAIN}/api/webhooks/palisis
//
// Optional auth: set env var PALISIS_WEBHOOK_SECRET — Palisis must send the
// same value in the `x-palisis-secret` header.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import { dbGetSettings, dbInsertPalisisSyncLog } from "@/lib/db/queries"
import { syncSingleTripFromPalisis } from "@/lib/palisis-sync"

export const dynamic = "force-dynamic"

interface PalisisWebhookPayload {
  event?: string
  // Palisis sends one of these — we accept all common shapes
  tour_id?: string | number
  tourId?:  string | number
  externalId?: string | number
  trip_id?: string | number
  channel_id?: number
  channelId?: number
  data?: Record<string, unknown>
}

function extractPalisisId(p: PalisisWebhookPayload): string {
  const raw = p.tour_id ?? p.tourId ?? p.externalId ?? p.trip_id
    ?? (p.data?.tour_id as string | number | undefined)
    ?? (p.data?.tourId as string | number | undefined)
  return raw == null ? "" : String(raw).trim()
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-palisis-secret")
    const configuredSecret = process.env.PALISIS_WEBHOOK_SECRET
    if (configuredSecret && secret !== configuredSecret) {
      console.warn("[webhooks/palisis] Unauthorized webhook attempt")
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const payload = await req.json().catch(() => ({})) as PalisisWebhookPayload
    const event   = payload.event ?? "tour.updated"
    const palisisId = extractPalisisId(payload)
    const channelId = Number(payload.channel_id ?? payload.channelId) || undefined

    console.log("[webhooks/palisis] Received:", event, palisisId)

    // ── Booking events: log only, no DB sync needed here ────────────────────
    if (event === "booking.confirmed" || event === "booking.cancelled") {
      console.log("[webhooks/palisis] Booking event:", event, payload.data)
      return NextResponse.json({ ok: true, received: true, event, action: "logged" })
    }

    // ── Tour update events: sync if auto-sync enabled ──────────────────────
    if (!palisisId) {
      return NextResponse.json({ ok: false, error: "Missing tour identifier" }, { status: 400 })
    }

    // Read auto-sync flag from settings (integrations.palisis_auto_sync)
    const settings = await dbGetSettings()
    const apiKeys  = (settings?.apiKeys ?? {}) as Record<string, string>
    const autoSync = apiKeys.palisis_auto_sync === "true"

    if (!autoSync) {
      await dbInsertPalisisSyncLog({
        trigger_type: "webhook",
        action: "single_sync",
        palisis_id: palisisId,
        note: `Skipped: Auto-Sync disabled (event: ${event})`,
        changes: {
          ok: true,
          skipped: true,
          reason: "auto_sync_disabled",
          palisisId,
          event,
        },
      })
      console.log("[webhooks/palisis] Skipped — auto-sync disabled for", palisisId)
      return NextResponse.json({ ok: true, received: true, event, action: "skipped_auto_sync_disabled" })
    }

    // Auto-sync is ON — fetch the trip and override
    const result = await syncSingleTripFromPalisis(palisisId, "webhook", channelId)

    return NextResponse.json({
      ok: result.ok,
      received: true,
      event,
      action: result.action,
      palisisId: result.palisisId,
      tripId: result.tripId,
      title: result.title,
      error: result.error,
    }, { status: result.ok ? 200 : 502 })

  } catch (err) {
    console.error("[webhooks/palisis] Error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}

// Allow simple GET for health-check / URL verification
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "palisis-webhook",
    note: "POST trip-update events here. Optional auth via x-palisis-secret header.",
  })
}
