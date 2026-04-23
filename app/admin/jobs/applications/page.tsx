"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  FileText, 
  ExternalLink, 
  Linkedin, 
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Briefcase
} from "lucide-react"

interface JobApplication {
  id: string
  jobId: string
  jobTitle: string
  fullName: string
  email: string
  phone?: string
  coverLetter: string
  resumeUrl?: string
  portfolioUrl?: string
  linkedinUrl?: string
  attachments: { name: string; url: string }[]
  status: "new" | "reviewing" | "shortlisted" | "rejected" | "hired"
  notes?: string
  createdAt: string
}

const STATUS_OPTIONS: { value: JobApplication["status"]; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-blue-500/15 text-blue-600" },
  { value: "reviewing", label: "Reviewing", color: "bg-amber-500/15 text-amber-600" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-emerald-500/15 text-emerald-600" },
  { value: "rejected", label: "Rejected", color: "bg-red-500/15 text-red-600" },
  { value: "hired", label: "Hired", color: "bg-primary/15 text-primary" },
]

function ApplicationCard({ app, onUpdate, onDelete }: { 
  app: JobApplication
  onUpdate: (id: string, data: Partial<JobApplication>) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(app.notes || "")
  const statusOption = STATUS_OPTIONS.find((s) => s.value === app.status) || STATUS_OPTIONS[0]

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{app.fullName}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusOption.color}`}>
              {statusOption.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{app.jobTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              <a href={`mailto:${app.email}`} className="hover:text-primary">{app.email}</a>
            </span>
            {app.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <a href={`tel:${app.phone}`} className="hover:text-primary">{app.phone}</a>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(app.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={app.status}
            onChange={(e) => onUpdate(app.id, { status: e.target.value as JobApplication["status"] })}
            className="rounded-lg border border-border bg-secondary/30 px-2 py-1 text-xs focus:border-primary/50 focus:outline-none"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Links */}
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
            {app.resumeUrl && (
              <a
                href={app.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80"
              >
                <FileText className="h-3.5 w-3.5" />
                Resume
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {app.linkedinUrl && (
              <a
                href={app.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#0077B5]/10 px-3 py-1.5 text-xs font-medium text-[#0077B5] transition-colors hover:bg-[#0077B5]/20"
              >
                <Linkedin className="h-3.5 w-3.5" />
                LinkedIn
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {app.portfolioUrl && (
              <a
                href={app.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-500/20"
              >
                <Globe className="h-3.5 w-3.5" />
                Portfolio
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {app.attachments.filter(a => a.url !== app.resumeUrl).map((att) => (
              <a
                key={att.url}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80"
              >
                <FileText className="h-3.5 w-3.5" />
                {att.name}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>

          {/* Cover letter */}
          <div className="px-4 py-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Cover Letter</h4>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{app.coverLetter}</p>
          </div>

          {/* Notes */}
          <div className="border-t border-border px-4 py-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Internal Notes</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onUpdate(app.id, { notes })}
              placeholder="Add notes about this candidate..."
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <a
              href={`mailto:${app.email}?subject=Re: Your application for ${encodeURIComponent(app.jobTitle)}`}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Mail className="h-3.5 w-3.5" />
              Email Candidate
            </a>
            <button
              type="button"
              onClick={() => { if (confirm("Delete this application?")) onDelete(app.id) }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function JobApplicationsPage() {
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | JobApplication["status"]>("all")

  useEffect(() => {
    fetch("/api/admin/applications")
      .then((res) => res.json())
      .then((data) => {
        setApplications(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleUpdate = async (id: string, data: Partial<JobApplication>) => {
    const res = await fetch("/api/admin/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    })
    if (res.ok) {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)))
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/applications?id=${id}`, { method: "DELETE" })
    if (res.ok) {
      setApplications((prev) => prev.filter((a) => a.id !== id))
    }
  }

  const filtered = filter === "all" ? applications : applications.filter((a) => a.status === filter)
  const counts = {
    all: applications.length,
    new: applications.filter((a) => a.status === "new").length,
    reviewing: applications.filter((a) => a.status === "reviewing").length,
    shortlisted: applications.filter((a) => a.status === "shortlisted").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
    hired: applications.filter((a) => a.status === "hired").length,
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/jobs"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Jobs
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Jobs</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Job Applications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {applications.length} total applications, {counts.new} new
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", ...STATUS_OPTIONS.map((s) => s.value)] as const).map((status) => {
          const label = status === "all" ? "All" : STATUS_OPTIONS.find((s) => s.value === status)?.label
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === status
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {label} ({counts[status]})
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {filter === "all" ? "No applications yet" : `No ${filter} applications`}
          </p>
          {filter === "all" && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              Applications submitted through the careers page will appear here
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((app) => (
            <ApplicationCard key={app.id} app={app} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
