import type { Metadata } from "next"
import { dbListTrips } from "@/lib/db/queries"
import type { Trip } from "@/lib/data"
import { WidgetsShowcase } from "./widgets-showcase"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "ChatGPT Widgets",
  description: "Custom UI components for sightseeing.lu experiences inside ChatGPT conversations. Preview the Sightseeing List, Carousel, Map, and Album widgets.",
  alternates: { canonical: `${BASE}/widgets` },
}

// Dynamic — widget showcase uses live published trips so archived/draft items
// never appear in the demo cards.
export const dynamic = "force-dynamic"

export default async function WidgetsPage() {
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as Array<Record<string, unknown>>
  const trips: Trip[] = rows.map((r) => ({
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
  } as Trip))

  const sample = trips.slice(0, 8)
  const featureTrip = trips[0]

  if (!featureTrip) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">ChatGPT Widgets</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No published experiences are available right now.
        </p>
      </div>
    )
  }

  return <WidgetsShowcase trips={sample} featureTrip={featureTrip} />
}
