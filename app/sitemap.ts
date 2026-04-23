import type { MetadataRoute } from "next"
import { trips, categories } from "@/lib/data"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

function slugify(name: string) {
  return name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")
}

export default function sitemap(): MetadataRoute.Sitemap {
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

  const tripPages: MetadataRoute.Sitemap = trips.map((trip) => ({
    url: `${BASE}/trip/${trip.id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }))

  return [...staticPages, ...categoryPages, ...tripPages]
}
