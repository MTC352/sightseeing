"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function JobStatusButton({ jobId, status }: { jobId: string; status: "open" | "closed" }) {
  const [optimistic, setOptimistic] = useState(status)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function toggle() {
    const next = optimistic === "open" ? "closed" : "open"
    setPending(true)
    setOptimistic(next)
    await fetch(`/api/admin/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    router.refresh()
    setPending(false)
  }

  return (
    <button type="button" onClick={toggle} disabled={pending}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
        optimistic === "open" ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25" : "bg-secondary text-muted-foreground hover:bg-muted"
      }`}>
      {optimistic}
    </button>
  )
}
