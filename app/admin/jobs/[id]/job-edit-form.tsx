"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { AdminJob } from "@/lib/admin-store"
import { Save, ArrowLeft, Plus, X, AlertCircle } from "lucide-react"
import Link from "next/link"

const DEPARTMENTS = ["Operations", "Marketing", "Technology", "Support", "Sales", "Finance", "HR"]

export function JobEditForm({ job }: { job: AdminJob | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [form, setForm] = useState<Partial<AdminJob>>(
    job ?? {
      title: "",
      department: "Operations",
      location: "Luxembourg City",
      type: "Full-time",
      description: "",
      requirements: [],
      status: "open",
    }
  )
  const [reqInput, setReqInput] = useState("")

  function set<K extends keyof AdminJob>(key: K, value: AdminJob[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addReq(r: string) {
    const rt = r.trim()
    if (rt) set("requirements", [...(form.requirements ?? []), rt])
    setReqInput("")
  }

  function removeReq(i: number) {
    set("requirements", (form.requirements ?? []).filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!form.title?.trim()) {
      setSaveError("Job title is required before saving.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const method = job ? "PATCH" : "POST"
      const url = job ? `/api/admin/jobs/${job.id}` : `/api/admin/jobs`
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? `Save failed (${res.status})`)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      if (!job) {
        router.push("/admin/jobs")
        router.refresh()
      } else {
        router.refresh()
      }
    } catch {
      setSaveError("Network error — please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"

  return (
    <div className="mx-auto max-w-2xl">
      {saveError && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/admin/jobs" className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to jobs
        </Link>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Core */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Job Details</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Job Title</label>
              <input type="text" className={inputClass} placeholder="e.g. Senior Tour Guide" value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Department</label>
                <select className={inputClass} value={form.department ?? "Operations"} onChange={(e) => set("department", e.target.value)}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select className={inputClass} value={form.type ?? "Full-time"} onChange={(e) => set("type", e.target.value as AdminJob["type"])}>
                  {(["Full-time", "Part-time", "Freelance"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input type="text" className={inputClass} placeholder="e.g. Luxembourg City" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea rows={4} className={inputClass} placeholder="Describe the role" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </div>
          </div>
        </section>

        {/* Requirements */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Requirements</h2>
          <div className="mb-3 flex flex-col gap-2">
            {(form.requirements ?? []).map((req, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                <span className="text-sm text-foreground">{req}</span>
                <button type="button" onClick={() => removeReq(i)} className="text-muted-foreground/40 hover:text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder="Add a requirement"
              value={reqInput}
              onChange={(e) => setReqInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReq(reqInput) }}}
            />
            <button type="button" onClick={() => addReq(reqInput)}
              className="rounded-lg border border-border px-3 text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Status */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Status</h2>
          <select className={`${inputClass} max-w-xs`} value={form.status ?? "open"} onChange={(e) => set("status", e.target.value as "open" | "closed")}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : saved ? "Saved!" : "Save Job"}
        </button>
      </div>
    </div>
  )
}
