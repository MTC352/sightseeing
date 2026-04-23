import type { Metadata } from "next"
import { trips } from "@/lib/data"
import { WidgetsShowcase } from "./widgets-showcase"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "ChatGPT Widgets",
  description: "Custom UI components for sightseeing.lu experiences inside ChatGPT conversations. Preview the Sightseeing List, Carousel, Map, and Album widgets.",
  alternates: { canonical: `${BASE}/widgets` },
}

export default function WidgetsPage() {
  const sample = trips.slice(0, 8)
  const featureTrip = trips[0]

  return <WidgetsShowcase trips={sample} featureTrip={featureTrip} />
}
