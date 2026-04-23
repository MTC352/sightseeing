import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { HelpClient } from "./help-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Help Center & Knowledge Base | sightseeing.lu",
  description: "Find answers to common questions about booking, payments, cancellations, the sightseeing.lu app, City Tours, and more. Browse articles or search our knowledge base.",
  openGraph: {
    title: "Help Center | sightseeing.lu",
    description: "Your complete guide to booking experiences in Luxembourg. FAQs, app help, tour information and customer support.",
  },
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HelpClient />
      <SiteFooter />
    </div>
  )
}
