import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchContent } from "./search-content"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "Search Experiences",
  description: "Search and filter tours, activities, and experiences in Luxembourg. Find your perfect sightseeing adventure.",
  alternates: {
    canonical: `${BASE}/search`,
  },
  openGraph: {
    title: "Search Experiences | sightseeing.lu",
    description: "Search and filter tours, activities, and experiences in Luxembourg.",
    url: `${BASE}/search`,
  },
}

export default function SearchPage() {
  return <Suspense fallback={null}><SearchContent /></Suspense>
}
