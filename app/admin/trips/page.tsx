import Link from "next/link"
import { dbListTrips } from "@/lib/db/queries"
import { Plus, Pencil, ExternalLink } from "lucide-react"
import { TripDeleteButton } from "./trip-delete-button"
import { TripToggleButton } from "./trip-toggle-button"
import { TripStatusButton } from "./trip-status-button"
import { TripArchiveButton } from "./trip-archive-button"

export const dynamic = "force-dynamic"

export default async function AdminTripsPage() {
  const trips = await dbListTrips() as {
    id: string; palisis_id: string | null; title: string; city: string; category: string; price: number;
    originalPrice: number | null; image: string; featured: boolean;
    featuredDeparture: boolean; status: string;
  }[]

  const palisisCount = trips.filter(t => t.id.startsWith("tcms_")).length
  const manualCount  = trips.length - palisisCount

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Content</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Trips</h1>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{trips.length} total</p>
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-blue-500/12 text-blue-600 ring-1 ring-inset ring-blue-500/20">
              {palisisCount} Palisis
            </span>
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-slate-500/10 text-slate-500 ring-1 ring-inset ring-slate-500/20">
              {manualCount} Manual
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/trips/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Trip
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Trip</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Category</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Price</th>
                <th className="hidden px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Featured</th>
                <th className="hidden px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Departures</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trips.map((trip) => (
                <tr key={trip.id} className="group transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={trip.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground max-w-[220px]">{trip.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground">{trip.city}</p>
                          {trip.id.startsWith("tcms_") ? (
                            <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-blue-500/12 text-blue-600 ring-1 ring-inset ring-blue-500/20">
                              Palisis
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-slate-400/10 text-slate-500 ring-1 ring-inset ring-slate-400/20">
                              Manual
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{trip.category}</td>
                  <td className="hidden px-4 py-3 text-foreground sm:table-cell">
                    {trip.originalPrice && (
                      <span className="mr-1.5 text-xs text-muted-foreground/60 line-through">€{trip.originalPrice}</span>
                    )}
                    €{trip.price}
                  </td>
                  <td className="hidden px-4 py-3 text-center md:table-cell">
                    <TripToggleButton tripId={trip.id} field="featured" value={trip.featured} />
                  </td>
                  <td className="hidden px-4 py-3 text-center md:table-cell">
                    <TripToggleButton tripId={trip.id} field="featuredDeparture" value={trip.featuredDeparture} />
                  </td>
                  <td className="px-4 py-3">
                    <TripStatusButton tripId={trip.id} status={trip.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/trip/${trip.id}`}
                        target="_blank"
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                        title="View on site"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href={`/admin/trips/${trip.id}`}
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <TripArchiveButton tripId={trip.id} isArchived={false} />
                      <TripDeleteButton tripId={trip.id} tripTitle={trip.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
