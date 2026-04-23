import { getTrip, listTrips } from "@/lib/admin-store"
import { notFound } from "next/navigation"
import { TripEditForm } from "./trip-edit-form"

export default async function TripEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = id === "new" ? null : getTrip(id)
  if (id !== "new" && !trip) notFound()

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Trips</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{trip ? "Edit Trip" : "New Trip"}</h1>
        {trip && <p className="mt-0.5 text-sm text-muted-foreground">ID: {trip.id}</p>}
      </div>
      <TripEditForm trip={trip} />
    </div>
  )
}
