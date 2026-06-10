export const dynamic = "force-dynamic"

import { dbGetTrip, dbGetIntegration } from "@/lib/db/queries"
import { notFound } from "next/navigation"
import { TripEditForm } from "./trip-edit-form"
import { TripSyncButton } from "../trip-sync-button"
import { resolvePolicy, type TripFieldPolicy } from "@/lib/trip-field-policy"

async function loadPolicy(): Promise<TripFieldPolicy> {
  try {
    const row = (await dbGetIntegration("trip_field_policy")) as { value?: string } | null
    let stored: Partial<TripFieldPolicy> | null = null
    if (row?.value) {
      try { stored = JSON.parse(row.value) } catch { stored = null }
    }
    return resolvePolicy(stored)
  } catch {
    return resolvePolicy(null)
  }
}

export default async function TripEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [trip, policy] = await Promise.all([
    id === "new" ? Promise.resolve(null) : dbGetTrip(id),
    loadPolicy(),
  ])
  if (id !== "new" && !trip) notFound()

  const tripData = trip as { id: string; palisis_id?: string | null; regiondoId?: string | null; source?: string | null } | null
  const palisisId = tripData?.palisis_id ?? null
  const regiondoId =
    tripData?.source === "regiondo" || tripData?.regiondoId ? tripData?.regiondoId ?? null : null

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Trips</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{trip ? "Edit Trip" : "New Trip"}</h1>
          {trip && <p className="mt-0.5 text-sm text-muted-foreground">ID: {tripData?.id}</p>}
          {palisisId && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Palisis ID: <span className="font-mono text-blue-600">{palisisId}</span>
            </p>
          )}
          {regiondoId && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              DMO ID: <span className="font-mono text-emerald-600">{regiondoId}</span>
            </p>
          )}
        </div>
        {palisisId && <TripSyncButton palisisId={palisisId} variant="full" />}
        {!palisisId && regiondoId && <TripSyncButton regiondoId={regiondoId} variant="full" />}
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TripEditForm trip={trip as any} policy={policy} />
    </div>
  )
}
