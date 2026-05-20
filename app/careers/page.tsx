import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { CareersClient } from "./careers-client"
import type { JobListing } from "./careers-client"
import { dbListJobs } from "@/lib/db/queries"
import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "Careers | sightseeing.lu",
  description: "Join the sightseeing.lu team. Browse open positions in Luxembourg across operations, technology, marketing, and more.",
  alternates: { canonical: `${BASE}/careers` },
  openGraph: {
    title: "Careers at sightseeing.lu",
    description: "Open positions across operations, technology, marketing, and more — based in Luxembourg.",
    url: `${BASE}/careers`,
  },
}

export const dynamic = "force-dynamic"

// Map our admin "type" → Google's required `employmentType` enum.
function employmentType(type: string): string[] {
  switch (type) {
    case "Full-time":  return ["FULL_TIME"]
    case "Part-time":  return ["PART_TIME"]
    case "Contract":   return ["CONTRACTOR"]
    case "Freelance":  return ["CONTRACTOR"]
    case "Internship": return ["INTERN"]
    case "Temporary":  return ["TEMPORARY"]
    default:           return ["OTHER"]
  }
}

export default async function CareersPage() {
  const rows = await dbListJobs().catch(() => [])

  const openRows = rows.filter((r) => (r.status as string) === "open")

  const jobs: JobListing[] = openRows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    department: String(r.department ?? "General"),
    location: String(r.location ?? "Luxembourg"),
    type: (r.type as JobListing["type"]) ?? "Full-time",
    description: String(r.description ?? ""),
    requirements: Array.isArray(r.requirements) ? (r.requirements as string[]) : [],
  }))

  // One JobPosting per role + a single ItemList grouping. Each posting needs
  // `datePosted`; Google also strongly prefers `validThrough`. We default to
  // created_at and 60 days out so postings stay "current" without needing
  // admin-side fields right now.
  const jobPostings = openRows.map((r) => {
    const datePosted = r.created_at
      ? new Date(r.created_at as string | Date).toISOString()
      : new Date().toISOString()
    const validThrough = new Date(
      new Date(datePosted).getTime() + 60 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const requirementsList = Array.isArray(r.requirements)
      ? (r.requirements as string[])
      : []
    const description = `<p>${String(r.description ?? "")}</p>${
      requirementsList.length > 0
        ? `<h3>Requirements</h3><ul>${requirementsList.map((q) => `<li>${q}</li>`).join("")}</ul>`
        : ""
    }`
    return {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: String(r.title ?? ""),
      description,
      identifier: {
        "@type": "PropertyValue",
        name: "sightseeing.lu",
        value: String(r.id),
      },
      datePosted,
      validThrough,
      employmentType: employmentType(String(r.type ?? "Full-time")),
      hiringOrganization: {
        "@type": "Organization",
        name: "sightseeing.lu",
        sameAs: BASE,
        logo: `${BASE}/icon.png`,
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: String(r.location ?? "Luxembourg"),
          addressCountry: "LU",
        },
      },
      ...(String(r.location ?? "").toLowerCase().includes("remote")
        ? {
            jobLocationType: "TELECOMMUTE",
            applicantLocationRequirements: { "@type": "Country", name: "LU" },
          }
        : {}),
      industry: String(r.department ?? "Tourism"),
      directApply: false,
      url: `${BASE}/careers`,
    }
  })

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Careers", item: `${BASE}/careers` },
    ],
  }

  const schemas = [breadcrumbLd, ...jobPostings]
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

      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <p className="text-sm font-medium text-primary">Join our team</p>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">Work at sightseeing.lu</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            We are a small but growing team passionate about sharing the best of Luxembourg with the world. If you love travel, technology, and exceptional guest experiences — we would love to hear from you.
          </p>
          <div className="mt-6 flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Luxembourg-based &amp; remote-friendly</div>
            <div className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Flexible working arrangements</div>
            <div className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Free experiences for staff</div>
          </div>
        </div>
      </section>

      <CareersClient jobs={jobs} />

      <SiteFooter />
    </div>
  )
}
