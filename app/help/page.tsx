import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { HelpClient, type HelpArticle } from "./help-client"
import { dbListHelpArticles } from "@/lib/db/queries"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "Help Center & Knowledge Base | sightseeing.lu",
  description:
    "Find answers to common questions about booking, payments, cancellations, the sightseeing.lu app, City Tours, and more. Browse articles or search our knowledge base.",
  alternates: { canonical: `${BASE}/help` },
  openGraph: {
    title: "Help Center | sightseeing.lu",
    description:
      "Your complete guide to booking experiences in Luxembourg. FAQs, app help, tour information and customer support.",
    url: `${BASE}/help`,
  },
}

// Strip light HTML/markdown formatting so the FAQPage `text` answer is plain
// quotable prose. AI engines paste this verbatim into answers, so leaving
// raw <p> / **bold** in there shows ugly markup.
function plainText(s: string): string {
  return String(s ?? "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export default async function HelpPage() {
  const rows = (await dbListHelpArticles().catch(() => [])) as HelpArticle[]
  const articles = rows.filter((a) => a.status === "published" || a.status == null)

  // FAQPage JSON-LD over every published article — server-rendered so bots
  // see it on the first HTML response, no JS required.
  const faqLd =
    articles.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: articles.slice(0, 50).map((a) => ({
            "@type": "Question",
            name: a.question,
            acceptedAnswer: { "@type": "Answer", text: plainText(a.answer) },
          })),
        }
      : null

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Help Center", item: `${BASE}/help` },
    ],
  }

  const schemas = faqLd ? [breadcrumbLd, faqLd] : [breadcrumbLd]
  const safeJsonLd = JSON.stringify(schemas)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd }} />
      <Navbar />
      <HelpClient articles={articles} />
      <SiteFooter />
    </div>
  )
}
