import type { MetadataRoute } from "next"
import { categories } from "@/lib/data"
import { dbListTrips, dbListPublicPosts } from "@/lib/db/queries"
import { addLocale } from "@/lib/i18n/routing"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

function slugify(name: string) {
  return name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")
}

const langAlternates = (path: string) => ({
  languages: {
    en: `${BASE}${path}`,
    de: `${BASE}${addLocale(path, "de")}`,
    fr: `${BASE}${addLocale(path, "fr")}`,
  },
})

// Must be dynamic — sitemap reflects only currently-published trips and posts.
// Archiving in admin removes the row from the next crawler hit.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, alternates: langAlternates("/"), lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/explore`, alternates: langAlternates("/explore"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/planner`, alternates: langAlternates("/planner"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/departures`, alternates: langAlternates("/departures"), lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${BASE}/blog`, alternates: langAlternates("/blog"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/about`, alternates: langAlternates("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/careers`, alternates: langAlternates("/careers"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/help`, alternates: langAlternates("/help"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/search`, alternates: langAlternates("/search"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/emergency`, alternates: langAlternates("/emergency"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ]

  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => {
    const path = `/experiences/${slugify(cat.name)}`
    return {
      url: `${BASE}${path}`,
      alternates: langAlternates(path),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    }
  })

  // DB-backed: archived/draft trips excluded by publicOnly. Fail-closed on DB
  // error so non-public trips never leak into the crawler sitemap.
  const tripRows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as Array<{
    id: string
    slug?: string | null
    updated_at?: string | Date | null
  }>
  const tripPages: MetadataRoute.Sitemap = tripRows.map((trip) => {
    const path = `/trip/${String(trip.slug || trip.id)}`
    return {
      url: `${BASE}${path}`,
      alternates: langAlternates(path),
      lastModified: trip.updated_at ? new Date(trip.updated_at).toISOString() : now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }
  })

  // Blog posts — only those whose scheduled publish time has passed.
  const postRows = (await dbListPublicPosts().catch(() => [])) as Array<{
    slug: string
    status: string
    publishedAt?: string | Date | null
    updated_at?: string | Date | null
  }>
  const blogPages: MetadataRoute.Sitemap = postRows
    .map((p) => {
      const path = `/blog/${p.slug}`
      return {
        url: `${BASE}${path}`,
        alternates: langAlternates(path),
        lastModified:
          (p.updated_at && new Date(p.updated_at).toISOString()) ||
          (p.publishedAt && new Date(p.publishedAt).toISOString()) ||
          now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }
    })

  return [...staticPages, ...categoryPages, ...tripPages, ...blogPages]
}
