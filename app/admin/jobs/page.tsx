import Link from "next/link"
import { dbListJobs } from "@/lib/db/queries"
import { Plus, Pencil, Briefcase } from "lucide-react"
import { JobDeleteButton } from "./job-delete-button"
import { JobStatusButton } from "./job-status-button"

export const dynamic = "force-dynamic"

export default async function AdminJobsPage() {
  const jobs = await dbListJobs()

  const typedJobs = jobs as { id: string; title: string; department: string; type: string; location: string; status: string; createdAt: string }[]

  const open = typedJobs.filter((j) => j.status === "open").length

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Content</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Jobs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{open} open positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/jobs/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New Job
          </Link>
        </div>
      </div>

      {typedJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No job listings yet</p>
          <Link href="/admin/jobs/new" className="mt-3 text-sm font-medium text-primary hover:underline">Create your first listing</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Title</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Department</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Type</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {typedJobs.map((job) => (
                <tr key={job.id} className="group transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <p className="truncate font-medium text-foreground">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ""}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{job.department}</td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      job.type === "Full-time" ? "bg-blue-500/15 text-blue-600"
                      : job.type === "Part-time" ? "bg-amber-500/15 text-amber-600"
                      : "bg-secondary text-muted-foreground"
                    }`}>{job.type}</span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{job.location}</td>
                  <td className="px-4 py-3">
                    <JobStatusButton jobId={job.id} status={job.status as "open" | "closed"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/admin/jobs/${job.id}`}
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <JobDeleteButton jobId={job.id} jobTitle={job.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
