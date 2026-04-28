"use client"

import { useState } from "react"
import { MapPin, Clock, Briefcase, ChevronDown, ChevronUp } from "lucide-react"

export interface JobListing {
  id: string
  title: string
  department: string
  location: string
  type: "Full-time" | "Part-time" | "Freelance"
  description: string
  requirements: string[]
}

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
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${TYPE_COLORS[job.type] ?? "bg-muted text-muted-foreground"}`}>{job.type}</span>
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

export function CareersClient({ jobs }: { jobs: JobListing[] }) {
  const departments = ["All", ...Array.from(new Set(jobs.map((j) => j.department)))]
  const [activeTab, setActiveTab] = useState("All")
  const filtered = activeTab === "All" ? jobs : jobs.filter((j) => j.department === activeTab)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="flex flex-wrap gap-2">
        {departments.map((dept) => (
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

      <div className="mt-6 flex flex-col gap-4">
        {filtered.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No open positions in this department right now. Check back soon!</p>
        )}
      </div>

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
  )
}
