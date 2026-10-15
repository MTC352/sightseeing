import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { safeJsonLd } from "@/lib/json-ld"
import { localizedMetadata } from "@/lib/i18n/metadata"
import { DmcContent } from "./dmc-content"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    path: "/dmc",
    title: "DMC & Tour Operator in Luxembourg",
    description:
      "Sightseeing.lu is your local DMC and tour operator for all of Luxembourg: private tours, group tours, tailor-made programmes and multi-day trips for travel agencies, companies and groups.",
  })
}

const travelAgencyLd = {
  "@context": "https://schema.org",
  "@type": "TravelAgency",
  name: "sightseeing.lu — DMC & Tour Operator",
  url: `${BASE}/dmc`,
  areaServed: { "@type": "Country", name: "Luxembourg" },
  description:
    "Destination management company and tour operator for Luxembourg: private tours, group tours, tailor-made and multi-day programmes.",
  knowsLanguage: ["en", "fr", "de"],
}

export default function DmcPage() {
  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd([travelAgencyLd]) }} />
      <Navbar />
      <DmcContent />
      <SiteFooter />
    </div>
  )
}
