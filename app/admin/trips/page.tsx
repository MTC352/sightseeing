import Link from "next/link"
import { dbListTripsForAdmin } from "@/lib/db/queries"
import { computeStaleness } from "@/lib/seo/score"
import { TripRowClient } from "./trip-row-client"
import { requirePermission } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AdminTripsPage() {
  try {
    await requirePermission("trips")
  } catch {
    redirect("/admin/login")
  }

  const trips = await dbListTripsForAdmin() as ({
    id: string; palisis_id: string | null; title: string; city: string; category: string; price: number;
    originalPrice: number | null; image: string; featured: boolean;
    status: string; syncSource?: string | null;
    seoScore?: number | null; seoOptimizedAt?: string | null;
  } & Record<string, unknown>)[]

  // A trip is "Palisis" if it came in via the TourCMS importer — either
  // the row was tagged with `sync_source = 'palisis'`, or it has a
  // populated `palisis_id` (older imports predated the marker column),
  // or its id uses the modern `tcms_` prefix. Anything else is truly
  // ad-hoc and counts as "Manual". We block manual creation server-side
  // in app/api/admin/trips POST, so the manual count should be 0.
  const isPalisis = (t: { id: string; palisis_id?: string | null; syncSource?: string | null }) =>
    t.syncSource === "palisis" || !!t.palisis_id || t.id.startsWith("tcms_")
  const palisisCount = trips.filter(isPalisis).length
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
            href="/admin/palisis"
            className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-500/20"
          >
            Import from Palisis
          </Link>
        </div>
      </div>

      {/* Source-of-truth notice */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-xs text-blue-700">
        <span className="font-semibold">Palisis is the source of truth.</span>
        <span className="text-blue-700/80">
          New trips are added via Palisis import. Use the sync icon on each row to re-fetch data from Palisis (one-way override).
        </span>
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
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trips.map((trip) => {
                // Staleness needs the heavy SEO source fields, but they stay
                // server-side — only these display fields go to the client row.
                const st = computeStaleness(trip)
                const row = {
                  id: trip.id,
                  palisis_id: trip.palisis_id,
                  title: trip.title,
                  city: trip.city,
                  category: trip.category,
                  price: trip.price,
                  originalPrice: trip.originalPrice,
                  image: trip.image,
                  featured: trip.featured,
                  status: trip.status,
                  slug: (trip.slug as string | null | undefined) ?? null,
                  seoScore: trip.seoScore ?? null,
                }
                return (
                  <TripRowClient
                    key={trip.id}
                    trip={row}
                    isPalisis={isPalisis(trip)}
                    seoOptimized={st.optimized}
                    seoStale={st.stale}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
