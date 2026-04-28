import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { CareersClient } from "./careers-client"
import type { JobListing } from "./careers-client"
import { dbListJobs } from "@/lib/db/queries"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Careers | sightseeing.lu",
  description: "Join the sightseeing.lu team. Browse open positions in Luxembourg across operations, technology, marketing, and more.",
}

export const dynamic = "force-dynamic"

export default async function CareersPage() {
  const rows = await dbListJobs().catch(() => [])

  const jobs: JobListing[] = rows
    .filter((r) => (r.status as string) === "open")
    .map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      department: String(r.department ?? "General"),
      location: String(r.location ?? "Luxembourg"),
      type: (r.type as JobListing["type"]) ?? "Full-time",
      description: String(r.description ?? ""),
      requirements: Array.isArray(r.requirements) ? (r.requirements as string[]) : [],
    }))

  return (
    <div className="min-h-screen bg-background">
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
