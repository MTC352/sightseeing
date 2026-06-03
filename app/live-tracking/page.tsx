import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { Radio } from "lucide-react"
import { LiveTrackingMaps } from "@/components/live-tracking-maps"

export const metadata: Metadata = {
  title: "Live Tracking | sightseeing.lu",
  description:
    "Track our Luxembourg sightseeing bus and train tours in real time. Follow the live position of each tour on the map as it travels its route.",
}

export default function LiveTrackingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-primary">Live Tracking</p>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">
            Track our tours in real time
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground lg:text-base">
            Follow the live position of our sightseeing bus and train tours as they travel their
            routes around Luxembourg on the interactive maps below.
          </p>
        </div>
      </section>

      {/* Maps */}
      <main className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <LiveTrackingMaps />
      </main>

      <SiteFooter />
    </div>
  )
}
