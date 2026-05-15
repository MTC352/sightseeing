import { dbGetTrip } from "@/lib/db/queries"
import { notFound } from "next/navigation"
import { TripEditForm } from "./trip-edit-form"
import { TripSyncButton } from "../trip-sync-button"

export default async function TripEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = id === "new" ? null : await dbGetTrip(id)
  if (id !== "new" && !trip) notFound()

  const tripData = trip as { id: string; palisis_id?: string | null } | null
  const palisisId = tripData?.palisis_id ?? null

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
        </div>
        {palisisId && <TripSyncButton palisisId={palisisId} variant="full" />}
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TripEditForm trip={trip as any} />
    </div>
  )
}
