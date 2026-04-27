import { NextResponse } from "next/server"
import { dbGetSettings, dbCreateTrip } from "@/lib/db/queries"

// Mock Palisis catalog — replace with real API call when credentials are available
const MOCK_PALISIS_CATALOG = [
  {
    palisisId: "PAL-001",
    title: "Casemates du Bock – Guided Tour",
    description: "Explore the famous fortifications beneath Luxembourg City with an expert guide.",
    price: 14,
    duration: "1.5 hours",
    category: "Culture & History",
    tags: ["culture", "outdoor", "popular"],
    city: "Luxembourg City",
    provider: "Palisis",
    highlights: ["UNESCO World Heritage site", "400 years of history", "Panoramic views"],
    image: "/images/trips/city-train.jpg",
    rating: 4.8,
    reviewCount: 312,
  },
  {
    palisisId: "PAL-002",
    title: "Moselle Valley Wine Tasting Cruise",
    description: "Sail along the Moselle river while sampling Luxembourg's finest wines.",
    price: 49,
    duration: "3 hours",
    category: "Food & Drink",
    tags: ["food", "romantic", "popular"],
    city: "Remich",
    provider: "Palisis",
    highlights: ["Premium local wines", "River cruise", "Cheese pairings"],
    image: "/images/trips/dinner-hopping-gourmet.jpg",
    rating: 4.7,
    reviewCount: 198,
  },
]

export async function POST() {
  const settings = await dbGetSettings()

  // When real Palisis credentials are set, swap mock data for live API call:
  // const res = await fetch(`${settings.apiKeys.palisis}/catalog`, {
  //   headers: { "X-Api-Key": settings.apiKeys.palisis }
  // })
  // const catalog = await res.json()

  if (!settings.apiKeys.palisis) {
    console.warn("[palisis-import] No API key set — using mock catalog")
  }

  let imported = 0
  let skipped = 0

  for (const item of MOCK_PALISIS_CATALOG) {
    try {
      await dbCreateTrip({
        title: item.title,
        description: item.description,
        price: item.price,
        duration: item.duration,
        category: item.category,
        tags: item.tags,
        city: item.city,
        provider: item.provider,
        image: item.image,
        highlights: item.highlights,
        badge: null,
        rating: item.rating,
        reviewCount: item.reviewCount,
        featured: false,
        featuredDeparture: false,
        status: "draft",
        permalink: null,
        originalPrice: null,
      })
      imported++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    total: MOCK_PALISIS_CATALOG.length,
    note: settings.apiKeys.palisis
      ? "Imported from Palisis API"
      : "Mock data used — set Palisis API key to import live catalog",
  })
}
