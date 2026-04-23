import type { Metadata } from "next"
import { trips } from "@/lib/data"
import ExploreClient from "./explore-client"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

const itemListLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "All Experiences in Luxembourg",
  numberOfItems: trips.length,
  itemListElement: trips.map((trip, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: `${BASE}/trip/${trip.id}`,
    name: trip.title,
    image: trip.image.startsWith("/") ? `${BASE}${trip.image}` : trip.image,
  })),
}

export const metadata: Metadata = {
  title: "Explore All Experiences in Luxembourg",
  description: "Browse 45+ tours, activities, and experiences across Luxembourg. Filter by category, city, duration, and price. Wine tastings, castle tours, e-bike adventures, dinner hopping and more.",
  keywords: ["Luxembourg experiences", "Luxembourg activities", "things to do Luxembourg", "explore Luxembourg", "Luxembourg tours catalog"],
  alternates: {
    canonical: `${BASE}/explore`,
  },
  openGraph: {
    title: "Explore All Experiences in Luxembourg",
    description: "Browse 45+ tours, activities, and experiences across Luxembourg.",
    url: `${BASE}/explore`,
  },
}

export default function ExplorePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <ExploreClient />
    </>
  )
}
