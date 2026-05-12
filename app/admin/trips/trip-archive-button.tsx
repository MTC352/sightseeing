"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Archive, ArchiveRestore } from "lucide-react"

export function TripArchiveButton({
  tripId,
  isArchived,
}: {
  tripId: string
  isArchived: boolean
}) {
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function toggle() {
    setPending(true)
    await fetch(`/api/admin/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: isArchived ? "draft" : "archived" }),
    })
    router.refresh()
    setPending(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={isArchived ? "Restore from archive" : "Archive trip"}
      className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      {isArchived ? (
        <ArchiveRestore className="h-3.5 w-3.5" />
      ) : (
        <Archive className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
