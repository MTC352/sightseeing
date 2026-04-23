"use client"

import { useState } from "react"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { MapPin, Clock, Briefcase, ChevronDown, ChevronUp } from "lucide-react"

interface JobListing {
  id: string
  title: string
  department: string
  location: string
  type: "Full-time" | "Part-time" | "Freelance"
  description: string
  requirements: string[]
}

const JOBS: JobListing[] = [
  {
    id: "j1",
    title: "Experienced Tour Guide",
    department: "Operations",
    location: "Luxembourg City",
    type: "Freelance",
    description: "Join our team of passionate local guides and share the stories of Luxembourg with visitors from around the world. You will lead walking tours, food tours, and themed experiences across the capital and beyond.",
    requirements: [
      "Fluency in English plus at least one of French, German, or Luxembourgish",
      "Strong knowledge of Luxembourg history, culture, and gastronomy",
      "Excellent communication and interpersonal skills",
      "Previous guiding or hospitality experience preferred",
      "Availability on weekends and public holidays",
    ],
  },
  {
    id: "j2",
    title: "Digital Marketing Manager",
    department: "Marketing",
    location: "Luxembourg City (hybrid)",
    type: "Full-time",
    description: "Drive awareness and bookings for sightseeing.lu through creative campaigns across SEO, social media, email, and paid channels. You will own the content calendar, manage agency partners, and report on performance.",
    requirements: [
      "3+ years in digital marketing, ideally in travel or e-commerce",
      "Hands-on experience with Google Ads, Meta Ads, and email platforms",
      "Strong analytical skills and comfort with GA4 / Looker",
      "Portfolio of compelling content in English; French/German a plus",
      "Creative eye and strong project management skills",
    ],
  },
  {
    id: "j3",
    title: "Full-Stack Developer",
    department: "Technology",
    location: "Remote (Luxembourg-based preferred)",
    type: "Full-time",
    description: "Help us build the best sightseeing discovery and booking platform in Luxembourg. You will work on our Next.js front-end, API integrations (Palisis, weather, maps), and internal tooling.",
    requirements: [
      "Proficiency in TypeScript, React / Next.js, and Node.js",
      "Experience with REST APIs and third-party integrations",
      "Familiarity with AI SDK or LLM tooling is a strong plus",
      "Interest in travel, tourism, or local experiences",
      "Good written English; other languages appreciated",
    ],
  },
  {
    id: "j4",
    title: "Customer Support Specialist",
    department: "Support",
    location: "Luxembourg City",
    type: "Part-time",
    description: "Be the first point of contact for our guests and partners. You will handle booking inquiries, cancellation requests, and general questions via email and chat — ensuring every visitor leaves with a smile.",
    requirements: [
      "Excellent written and verbal communication in English and French",
      "Empathy-first mindset with a passion for helping people",
      "Organised and calm under pressure",
      "Familiarity with booking or CRM software is a plus",
      "Available at least 3 days per week including one weekend day",
    ],
  },
  {
    id: "j5",
    title: "E-Bike & Outdoor Activity Leader",
    department: "Operations",
    location: "Luxembourg (mobile)",
    type: "Freelance",
    description: "Lead e-bike tours, cycling adventures, and outdoor experiences through Luxembourg's stunning landscapes. You will combine passion for the outdoors with excellent guest communication skills.",
    requirements: [
      "Certified cycling instructor or equivalent outdoor leadership qualification",
      "Strong knowledge of cycling routes in and around Luxembourg",
      "First aid certification (or willingness to obtain)",
      "Fluent English; additional languages a strong advantage",
      "Own or access to transport to reach departure points",
    ],
  },
  {
    id: "j6",
    title: "Partnerships & B2B Sales Executive",
    department: "Sales",
    location: "Luxembourg City",
    type: "Full-time",
    description: "Build and grow relationships with hotels, MICE operators, travel agencies, and corporate clients. You will drive group bookings and custom experiences, representing sightseeing.lu at trade events.",
    requirements: [
      "2+ years in B2B sales, travel industry preferred",
      "Strong network in Luxembourg or Benelux hospitality",
      "Confident presenter and skilled negotiator",
      "Fluency in English and French; German is a major advantage",
      "Results-driven with a collaborative team spirit",
    ],
  },
]

const DEPARTMENTS = ["All", ...Array.from(new Set(JOBS.map((j) => j.department)))]

const TYPE_COLORS: Record<string, string> = {
  "Full-time": "bg-primary/10 text-primary",
  "Part-time": "bg-amber-500/10 text-amber-700",
  Freelance: "bg-secondary text-foreground",
}

function JobCard({ job }: { job: JobListing }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-primary">{job.department}</p>
            <h3 className="mt-0.5 text-base font-bold text-foreground">{job.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{job.type}</span>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${TYPE_COLORS[job.type]}`}>{job.type}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">{job.description}</p>
      </div>
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{open ? "Hide requirements" : "View requirements"}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {open && (
          <div className="border-t border-border px-5 pb-5">
            <ul className="mt-3 flex flex-col gap-2">
              {job.requirements.map((req) => (
                <li key={req} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-primary/10 text-[10px] font-bold text-primary flex items-center justify-center">&#10003;</span>
                  {req}
                </li>
              ))}
            </ul>
            <a
              href={`mailto:careers@sightseeing.lu?subject=Application: ${encodeURIComponent(job.title)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Briefcase className="h-4 w-4" /> Apply for this role
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CareersPage() {
  const [activeTab, setActiveTab] = useState("All")
  const filtered = activeTab === "All" ? JOBS : JOBS.filter((j) => j.department === activeTab)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
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

      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {/* Department filter tabs */}
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map((dept) => (
            <button
              key={dept}
              type="button"
              onClick={() => setActiveTab(dept)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === dept
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        {/* Job listings */}
        <div className="mt-6 flex flex-col gap-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No open positions in this department right now. Check back soon!</p>
          )}
        </div>

        {/* Open application CTA */}
        <div className="mt-10 rounded-2xl border border-border bg-card p-6 text-center">
          <h2 className="text-base font-bold text-foreground">Don&#39;t see the right role?</h2>
          <p className="mt-1 text-sm text-muted-foreground">We are always open to hearing from talented people. Send us your CV and tell us how you can contribute.</p>
          <a
            href="mailto:careers@sightseeing.lu?subject=Open Application"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Send an open application
          </a>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
