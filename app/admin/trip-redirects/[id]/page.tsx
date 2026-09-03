export const dynamic = "force-dynamic"

import { dbGetTripRedirect, dbListTripsForAdmin } from "@/lib/db/queries"
import { notFound, redirect } from "next/navigation"
import { TripRedirectEditForm } from "./trip-redirect-edit-form"
import { requirePermission } from "@/lib/auth-server"

type TripOption = { id: string; title: string; slug: string; status: string }

export default async function TripRedirectEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ source?: string }>
}) {
  try {
    await requirePermission("trips")
  } catch {
    redirect("/admin/login")
  }

  const { id } = await params
  const { source } = await searchParams
  const rec = id === "new" ? null : await dbGetTripRedirect(id)
  if (id !== "new" && !rec) notFound()

  const trips = (await dbListTripsForAdmin()) as TripOption[]
  // Published trips are valid targets first, then drafts (labeled) as a fallback.
  const options = [...trips].sort((a, b) => {
    const rank = (s: string) => (s === "published" ? 0 : 1)
    return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title)
  })

  // A 404-feed "Create redirect" link passes ?source=/trip/<slug>; prefill the slug.
  const initialSlug = source ? source.replace(/^\/trip\//, "").replace(/^\/+/, "") : ""

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Trip Redirects</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{rec ? "Edit Redirect" : "New Redirect"}</h1>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TripRedirectEditForm redirect={rec as any} trips={options} initialSlug={initialSlug} />
    </div>
  )
}
