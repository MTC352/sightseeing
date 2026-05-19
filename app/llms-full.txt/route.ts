import { dbListTrips } from "@/lib/db/queries"
import { categories } from "@/lib/data"

// Must be dynamic — published-trip set changes whenever admin archives a trip.
export const dynamic = "force-dynamic"

type TripRow = {
  id: string
  title: string
  title_override?: string | null
  price: number
  originalPrice?: number | null
  duration: string | null
  rating: number
  reviewCount: number
  category: string
  city?: string | null
  provider?: string | null
  description?: string | null
  longDescription?: string | null
  shortDescription?: string | null
  tags?: string[] | null
  badge?: string | null
  highlights?: string[] | null
}

export async function GET() {
  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

  // DB-backed (publicOnly) — never include archived/draft trips in the
  // public LLM knowledge base feed.
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as TripRow[]

  const lines: string[] = [
    "# sightseeing.lu - Complete Experience Catalog",
    "",
    `> Generated ${new Date().toISOString().split("T")[0]}. ${rows.length} experiences across ${categories.length} categories in Luxembourg.`,
    "",
    "## All Experiences",
    "",
  ]

  const grouped = new Map<string, TripRow[]>()
  for (const trip of rows) {
    const cat = trip.category
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(trip)
  }

  for (const [category, catTrips] of grouped) {
    lines.push(`### ${category}`)
    lines.push("")
    for (const t of catTrips) {
      const title = t.title_override ?? t.title
      const price = Number(t.price ?? 0)
      const description = t.longDescription ?? t.shortDescription ?? t.description
      lines.push(`#### ${title}`)
      lines.push("")
      lines.push(`- **ID**: ${t.id}`)
      lines.push(`- **URL**: ${BASE}/trip/${t.id}`)
      lines.push(`- **Price**: ${price === 0 ? "Free" : `${price.toFixed(2)} EUR per person`}`)
      if (t.originalPrice) lines.push(`- **Original Price**: ${Number(t.originalPrice).toFixed(2)} EUR`)
      lines.push(`- **Duration**: ${t.duration ?? ""}`)
      lines.push(`- **Rating**: ${t.rating ?? 0}/5 (${t.reviewCount ?? 0} reviews)`)
      lines.push(`- **Location**: ${t.city ?? "Luxembourg"}`)
      lines.push(`- **Provider**: ${t.provider ?? "sightseeing.lu"}`)
      if (t.badge) lines.push(`- **Badge**: ${t.badge}`)
      if (description) {
        lines.push(`- **Description**: ${description}`)
      }
      if (Array.isArray(t.highlights) && t.highlights.length > 0) {
        lines.push(`- **Highlights**: ${t.highlights.join("; ")}`)
      }
      if (Array.isArray(t.tags) && t.tags.length > 0) {
        lines.push(`- **Tags**: ${t.tags.join(", ")}`)
      }
      lines.push("")
    }
  }

  lines.push("## Category Summary")
  lines.push("")
  for (const cat of categories) {
    const catTrips = grouped.get(cat.name) ?? []
    const prices = catTrips.map((t) => Number(t.price ?? 0)).filter((p) => p > 0)
    const minP = prices.length > 0 ? Math.min(...prices) : 0
    const maxP = prices.length > 0 ? Math.max(...prices) : 0
    lines.push(`- **${cat.name}**: ${catTrips.length} experiences, ${minP.toFixed(2)}-${maxP.toFixed(2)} EUR`)
  }
  lines.push("")

  lines.push("## Locations Served")
  lines.push("")
  const cities = [...new Set(rows.map((t) => t.city).filter(Boolean))]
  lines.push(cities.join(", "))
  lines.push("")

  lines.push("## Booking Information")
  lines.push("")
  lines.push("All experiences are bookable online at sightseeing.lu with instant confirmation via the Palisis booking system. Most experiences offer free cancellation up to 24 hours before the start time. Group bookings and private tours are available on request.")
  lines.push("")

  lines.push("## Contact")
  lines.push("")
  lines.push("- Website: https://sightseeing.lu")
  lines.push("- Email: info@sightseeing.lu")
  lines.push("- Phone: +352 123 456")
  lines.push("- Address: Luxembourg City, Luxembourg")

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
