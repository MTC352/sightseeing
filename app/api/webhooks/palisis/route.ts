import { NextResponse } from "next/server"
import { dbListTrips, dbUpdateTrip } from "@/lib/db/queries"

export const dynamic = "force-dynamic"

interface PalisisWebhookPayload {
  event: string
  tripId?: string
  externalId?: string
  data?: Record<string, unknown>
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-palisis-secret")
    const configuredSecret = process.env.PALISIS_WEBHOOK_SECRET
    if (configuredSecret && secret !== configuredSecret) {
      console.warn("[webhooks/palisis] Unauthorized webhook attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload: PalisisWebhookPayload = await req.json()
    console.log("[webhooks/palisis] Received:", payload.event, payload.tripId ?? payload.externalId)

    switch (payload.event) {
      case "availability.updated": {
        if (!payload.tripId && !payload.externalId) break
        const trips = await dbListTrips() as { id: string; palisis_id?: string }[]
        const trip = trips.find(
          (t) => t.id === payload.tripId || t.palisis_id === payload.externalId
        )
        if (trip && payload.data) {
          await dbUpdateTrip(trip.id, payload.data)
          console.log("[webhooks/palisis] Updated trip", trip.id)
        }
        break
      }
      case "booking.confirmed":
      case "booking.cancelled":
        console.log("[webhooks/palisis] Booking event received:", payload.event, payload.data)
        break
      default:
        console.log("[webhooks/palisis] Unhandled event:", payload.event)
    }

    return NextResponse.json({ received: true, event: payload.event })
  } catch (err) {
    console.error("[webhooks/palisis] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
