import Link from "next/link"
import { dbListArchivedTrips } from "@/lib/db/queries"
import { ArrowLeft, Pencil } from "lucide-react"
import { TripArchiveButton } from "../trip-archive-button"
import { TripDeleteButton } from "../trip-delete-button"
import { requirePermission } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ArchivedTripsPage() {
  try {
    await requirePermission("trips")
  } catch {
    redirect("/admin/login")
  }

  const trips = await dbListArchivedTrips() as {
    id: string; palisis_id: string | null; title: string; city: string; category: string;
    price: number; image: string; status: string;
  }[]

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/trips"
            className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Trips
          </Link>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Trips</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Archived</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {trips.length} archived trip{trips.length !== 1 ? "s" : ""} — not shown on the public site
          </p>
        </div>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground">No archived trips</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Archive trips from the main Trips list to hide them without deleting.</p>
          <Link href="/admin/trips" className="mt-4 text-xs text-primary hover:underline">
            Go to Trips
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Trip</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Category</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trips.map((trip) => (
                  <tr key={trip.id} className="group transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted opacity-60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={trip.image} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-muted-foreground max-w-[220px]">{trip.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground/60">{trip.city}</p>
                            {trip.id.startsWith("tcms_") ? (
                              <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-blue-500/10 text-blue-500 ring-1 ring-inset ring-blue-500/20">
                                Palisis
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold bg-slate-400/10 text-slate-400 ring-1 ring-inset ring-slate-400/20">
                                Manual
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground/60 lg:table-cell">{trip.category}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground/60 sm:table-cell">€{trip.price}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <TripArchiveButton tripId={trip.id} isArchived={true} />
                        <Link
                          href={`/admin/trips/${trip.id}`}
                          className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <TripDeleteButton tripId={trip.id} tripTitle={trip.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
