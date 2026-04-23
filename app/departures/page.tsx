import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { DeparturesClient } from "./departures-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Departure Locations | sightseeing.lu",
  description: "Find experiences by departure location across Luxembourg. Filter by product to find your exact departure point.",
}

export default function DeparturesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <DeparturesClient />
      <SiteFooter />
    </div>
  )
}
