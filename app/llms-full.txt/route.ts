import { trips, categories } from "@/lib/data"

export const dynamic = "force-static"

export function GET() {
  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

  const lines: string[] = [
    "# sightseeing.lu - Complete Experience Catalog",
    "",
    `> Generated ${new Date().toISOString().split("T")[0]}. ${trips.length} experiences across ${categories.length} categories in Luxembourg.`,
    "",
    "## All Experiences",
    "",
  ]

  const grouped = new Map<string, typeof trips>()
  for (const trip of trips) {
    const cat = trip.category
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(trip)
  }

  for (const [category, catTrips] of grouped) {
    lines.push(`### ${category}`)
    lines.push("")
    for (const t of catTrips) {
      lines.push(`#### ${t.title}`)
      lines.push("")
      lines.push(`- **ID**: ${t.id}`)
      lines.push(`- **URL**: ${BASE}/trip/${t.id}`)
      lines.push(`- **Price**: ${t.price === 0 ? "Free" : `${t.price.toFixed(2)} EUR per person`}`)
      if (t.originalPrice) lines.push(`- **Original Price**: ${t.originalPrice.toFixed(2)} EUR`)
      lines.push(`- **Duration**: ${t.duration}`)
      lines.push(`- **Rating**: ${t.rating}/5 (${t.reviewCount} reviews)`)
      lines.push(`- **Location**: ${t.city ?? "Luxembourg"}`)
      lines.push(`- **Provider**: ${t.provider ?? "sightseeing.lu"}`)
      if (t.badge) lines.push(`- **Badge**: ${t.badge}`)
      if (t.description) {
        lines.push(`- **Description**: ${t.description}`)
      }
      if (t.highlights && t.highlights.length > 0) {
        lines.push(`- **Highlights**: ${t.highlights.join("; ")}`)
      }
      lines.push(`- **Tags**: ${t.tags.join(", ")}`)
      lines.push("")
    }
  }

  lines.push("## Category Summary")
  lines.push("")
  for (const cat of categories) {
    const catTrips = grouped.get(cat.name) ?? []
    const prices = catTrips.map((t) => t.price).filter((p) => p > 0)
    const minP = prices.length > 0 ? Math.min(...prices) : 0
    const maxP = prices.length > 0 ? Math.max(...prices) : 0
    lines.push(`- **${cat.name}**: ${catTrips.length} experiences, ${minP.toFixed(2)}-${maxP.toFixed(2)} EUR`)
  }
  lines.push("")

  lines.push("## Locations Served")
  lines.push("")
  const cities = [...new Set(trips.map((t) => t.city).filter(Boolean))]
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
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  })
}
