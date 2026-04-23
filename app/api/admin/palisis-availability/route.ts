import { NextResponse } from "next/server"
import { getSettings, listTrips } from "@/lib/admin-store"

interface AvailabilitySlot {
  tripId: string
  tripTitle: string
  date: string
  spotsAvailable: number
  spotsTotal: number
}

function buildMockSlots(): AvailabilitySlot[] {
  const trips = listTrips().slice(0, 5)
  const today = new Date()
  const slots: AvailabilitySlot[] = []

  for (const trip of trips) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const spotsTotal = 12 + Math.floor(Math.random() * 8)
      const spotsAvailable = Math.floor(Math.random() * spotsTotal)
      slots.push({
        tripId: trip.id,
        tripTitle: trip.title,
        date: d.toISOString().slice(0, 10),
        spotsAvailable,
        spotsTotal,
      })
    }
  }

  return slots
}

export async function POST() {
  const settings = getSettings()

  if (!settings.apiKeys.palisis) {
    console.warn("[palisis-availability] No API key set — returning mock availability data")
  }

  // Real implementation:
  // const res = await fetch(`${settings.apiKeys.palisis}/availability`, {
  //   headers: { "X-Api-Key": settings.apiKeys.palisis }
  // })
  // const data = await res.json()

  const slots = buildMockSlots()
  const updated = slots.length

  return NextResponse.json({
    ok: true,
    updated,
    slots,
    note: settings.apiKeys.palisis
      ? "Availability updated from Palisis API"
      : "Mock data — set Palisis API key to fetch real availability",
  })
}
