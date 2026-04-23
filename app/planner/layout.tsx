import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "AI Trip Planner",
  description: "Let our AI plan your perfect Luxembourg day. Get personalised recommendations for tours, activities, and experiences based on your preferences and the weather.",
  alternates: {
    canonical: `${BASE}/planner`,
  },
  openGraph: {
    title: "AI Trip Planner | sightseeing.lu",
    description: "Let our AI plan your perfect Luxembourg day with personalised recommendations.",
    url: `${BASE}/planner`,
  },
}

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return children
}
