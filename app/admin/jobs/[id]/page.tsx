import { getJob } from "@/lib/admin-store"
import { notFound } from "next/navigation"
import { JobEditForm } from "./job-edit-form"

export default async function JobEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = id === "new" ? null : getJob(id)
  if (id !== "new" && !job) notFound()

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Jobs</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{job ? "Edit Job" : "New Job"}</h1>
      </div>
      <JobEditForm job={job} />
    </div>
  )
}
