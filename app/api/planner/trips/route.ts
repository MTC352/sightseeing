import { NextResponse } from "next/server"
import { dbListTrips } from "@/lib/db/queries"
import type { Trip } from "@/lib/data"

export const dynamic = "force-dynamic"

function mapDbRowToTrip(r: Record<string, unknown>): Trip {
  return {
    id: String(r.id),
    title: String((r.title_override ?? r.title) ?? ""),
    image: String(r.image ?? "/images/placeholder.jpg"),
    gallery: Array.isArray(r.gallery) ? (r.gallery as string[]).filter(Boolean) : [],
    price: Number(r.price ?? 0),
    originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
    rating: Number(r.rating ?? 0),
    reviewCount: Number(r.reviewCount ?? 0),
    duration: String(r.duration ?? ""),
    category: String(r.category ?? ""),
    // Merge the legacy `tags` column with the canonical `trip_tags`
    // array (assigned via /admin/trips/[id] → Trip Tag picker). The
    // planner's interest picker hands out canonical-tag slugs, so the
    // recommendation scorer needs access to BOTH sources or trips
    // tagged only via the canonical table never match an interest
    // (and the panel falls back to a fixed 8 top-rated trips). Dedup
    // preserves first-seen order.
    tags: (() => {
      const legacy = Array.isArray(r.tags) ? (r.tags as unknown[]).map(String).filter(Boolean) : []
      const canonical = Array.isArray((r as Record<string, unknown>).trip_tags)
        ? ((r as Record<string, unknown>).trip_tags as unknown[]).map(String).filter(Boolean)
        : Array.isArray((r as Record<string, unknown>).tripTags)
          ? ((r as Record<string, unknown>).tripTags as unknown[]).map(String).filter(Boolean)
          : []
      const seen = new Set<string>()
      return [...legacy, ...canonical].filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    })(),
    badge: r.badge != null ? String(r.badge) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    description: r.description != null ? String(r.description) : undefined,
    permalink: r.permalink != null ? String(r.permalink) : undefined,
    palisisProductId: r.palisisProductId != null ? String(r.palisisProductId) : undefined,
    provider: r.provider != null ? String(r.provider) : undefined,
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
    googleBusinessUrl: r.googleBusinessUrl != null ? String(r.googleBusinessUrl) : undefined,
  }
}

export async function GET() {
  try {
    const rows = await dbListTrips({ publicOnly: true })
    const trips = rows
      .filter((r) => (r as Record<string, unknown>).status === "published")
      .map((r) => mapDbRowToTrip(r as Record<string, unknown>))
    return NextResponse.json(
      { ok: true, trips },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, trips: [], error: err instanceof Error ? err.message : "unknown" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
