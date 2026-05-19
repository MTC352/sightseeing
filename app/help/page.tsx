import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { HelpClient, type HelpArticle } from "./help-client"
import { dbListHelpArticles } from "@/lib/db/queries"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Help Center & Knowledge Base | sightseeing.lu",
  description:
    "Find answers to common questions about booking, payments, cancellations, the sightseeing.lu app, City Tours, and more. Browse articles or search our knowledge base.",
  openGraph: {
    title: "Help Center | sightseeing.lu",
    description:
      "Your complete guide to booking experiences in Luxembourg. FAQs, app help, tour information and customer support.",
  },
}

export default async function HelpPage() {
  const rows = (await dbListHelpArticles().catch(() => [])) as HelpArticle[]
  const articles = rows.filter((a) => a.status === "published" || a.status == null)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HelpClient articles={articles} />
      <SiteFooter />
    </div>
  )
}
