import { dbListTrips } from "@/lib/db/queries"
import { categories } from "@/lib/data"

// Must be dynamic — counts/popular-list reflect only currently-published
// trips so archived/draft trips never appear in the public AI knowledge base.
export const dynamic = "force-dynamic"

type TripRow = {
  id: string
  title: string
  title_override?: string | null
  price: number
  duration: string | null
  rating: number
  reviewCount: number
  category: string
  city?: string | null
}

export async function GET() {
  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

  // Fail-closed on DB error — emit a minimal summary with no trip-specific
  // claims rather than reading from a static seed.
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as TripRow[]

  const byCategory: Record<string, TripRow[]> = {}
  for (const t of rows) {
    const cat = String(t.category ?? "Other")
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(t)
  }

  // Top 6 by reviewCount among the published set.
  const popular = rows
    .slice()
    .sort((a, b) => Number(b.reviewCount ?? 0) - Number(a.reviewCount ?? 0))
    .slice(0, 6)

  const cities = Array.from(new Set(rows.map((t) => t.city ?? "Luxembourg City"))).slice(0, 20)

  const positivePrices = rows.map((t) => Number(t.price ?? 0)).filter((p) => p > 0)
  const minPrice = positivePrices.length > 0 ? Math.min(...positivePrices) : null
  const maxPrice = positivePrices.length > 0 ? Math.max(...positivePrices) : null

  const lines: string[] = [
    "# sightseeing.lu",
    "",
    "> sightseeing.lu is Luxembourg's leading platform for handpicked tours, activities, and experiences. We connect travelers with local guides and unique experiences across Luxembourg. All experiences are bookable online with instant confirmation.",
    "",
    "## Key Pages",
    "",
    `- [Homepage](${BASE}): Featured experiences, categories, and customer reviews`,
    `- [Explore All Experiences](${BASE}/explore): Full catalog with filters by category, price, duration, and location`,
    `- [AI Trip Planner](${BASE}/planner): AI-powered trip planning assistant for personalized Luxembourg itineraries`,
    `- [About Us](${BASE}/about): Company information, team, and mission`,
    "",
    "## Categories",
    "",
  ]

  for (const cat of categories) {
    const count = (byCategory[cat.name] ?? []).length
    if (count > 0) lines.push(`- **${cat.name}** (${count} experiences)`)
  }

  if (popular.length > 0) {
    lines.push("", "## Popular Experiences", "")
    for (const t of popular) {
      const title = t.title_override ?? t.title
      const parts = [
        t.duration ?? "",
        Number(t.price) > 0 ? `${Number(t.price).toFixed(2)} EUR` : "",
        Number(t.rating) > 0 ? `${Number(t.rating)} stars (${Number(t.reviewCount)} reviews)` : "",
      ].filter(Boolean).join(", ")
      lines.push(`- ${title}${parts ? `: ${parts}` : ""}`)
    }
  }

  if (cities.length > 0) {
    lines.push("", "## Locations", "", cities.join(", "))
  }

  if (minPrice != null && maxPrice != null) {
    lines.push(
      "",
      "## Pricing",
      "",
      `Prices range from ${minPrice.toFixed(0)} EUR to ${maxPrice.toFixed(0)} EUR per person.`,
    )
  }

  lines.push(
    "",
    "## Booking",
    "",
    "All experiences are bookable online with instant confirmation. Free cancellation is available 24+ hours before most experiences.",
    "",
    "## Contact",
    "",
    "- Email: info@sightseeing.lu",
    "- Location: Luxembourg City, Luxembourg",
    "",
    "## Structured API",
    "",
    `A public JSON API is available at \`${BASE}/api/trips\` with CORS support. Accepts query params: \`category\`, \`city\`, \`minPrice\`, \`maxPrice\`, \`limit\`, \`sort\` (price|rating|reviews).`,
    "",
    "## Full Catalog",
    "",
    `For the complete list of all currently-published experiences with full details, see [${BASE}/llms-full.txt](${BASE}/llms-full.txt).`,
    "",
  )

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
