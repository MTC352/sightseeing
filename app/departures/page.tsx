import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { DeparturesClient } from "./departures-client"
import { dbListTrips } from "@/lib/db/queries"
import { trips as staticTrips } from "@/lib/data"
import type { Trip } from "@/lib/data"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Departure Locations | sightseeing.lu",
  description: "Find experiences by departure location across Luxembourg. Filter by product to find your exact departure point.",
}

export default async function DeparturesPage() {
  const rows = await dbListTrips().catch(() => [])

  const dbTrips: Trip[] = rows
    .filter((r) => (r.status as string) === "published")
    .map((r) => ({
      id: String(r.id),
      title: String((r.title_override ?? r.title) ?? ""),
      image: String(r.image ?? "/images/placeholder.jpg"),
      price: Number(r.price ?? 0),
      originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
      rating: Number(r.rating ?? 0),
      reviewCount: Number(r.reviewCount ?? 0),
      duration: String(r.duration ?? ""),
      category: String(r.category ?? ""),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      badge: r.badge != null ? String(r.badge) : undefined,
      city: r.city != null ? String(r.city) : undefined,
      description: r.description != null ? String(r.description) : undefined,
      permalink: r.permalink != null ? String(r.permalink) : undefined,
      provider: r.provider != null ? String(r.provider) : undefined,
      highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
      googleBusinessUrl: r.googleBusinessUrl != null ? String(r.googleBusinessUrl) : undefined,
    }))

  const tripList = dbTrips.length > 0 ? dbTrips : staticTrips

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DeparturesClient initialTrips={tripList} />
      <SiteFooter />
    </div>
  )
}
