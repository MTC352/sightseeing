import type { MetadataRoute } from "next"
import { categories } from "@/lib/data"
import { dbListTrips } from "@/lib/db/queries"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

function slugify(name: string) {
  return name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")
}

// Must be dynamic — sitemap reflects only currently-published trips. Archiving
// a trip in the admin removes it from the next crawler hit.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/planner`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/widgets`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ]

  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${BASE}/experiences/${slugify(cat.name)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.85,
  }))

  // DB-backed: archived/draft trips are excluded by publicOnly. Fail-closed
  // on DB error so we never list non-public trips in the crawler sitemap.
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as Array<{ id: string }>
  const tripPages: MetadataRoute.Sitemap = rows.map((trip) => ({
    url: `${BASE}/trip/${String(trip.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [...staticPages, ...categoryPages, ...tripPages]
}
