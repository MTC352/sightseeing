import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { DepartingSoonPageClient } from "./departing-soon-client"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Departing Soon | sightseeing.lu",
  description:
    "Experiences departing today across Luxembourg — book your spot on the next available departure before it fills up.",
}

export default function DepartingSoonPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DepartingSoonPageClient />
      <SiteFooter />
    </div>
  )
}
