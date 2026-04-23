"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

export function JobDeleteButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    await fetch(`/api/admin/jobs/${jobId}`, { method: "DELETE" })
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button type="button" onClick={handleDelete}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/10">Confirm</button>
        <button type="button" onClick={() => setConfirming(false)}
          className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)}
      className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
      title={`Delete "${jobTitle}"`}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
