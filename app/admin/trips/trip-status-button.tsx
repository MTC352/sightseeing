"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function TripStatusButton({
  tripId,
  status,
  onStatusChange,
}: {
  tripId: string
  status: string
  onStatusChange?: (status: string) => void
}) {
  const [optimistic, setOptimistic] = useState(status)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function toggle() {
    if (optimistic === "deactivated") return
    const next = optimistic === "published" ? "draft" : "published"
    setPending(true)
    setOptimistic(next)
    onStatusChange?.(next)
    await fetch(`/api/admin/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    router.refresh()
    setPending(false)
  }

  // Sync external status changes (e.g. from TripDeactivateButton in the same row)
  const display = status === "deactivated" ? "deactivated" : optimistic

  if (display === "deactivated") {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-600">
        deactivated
      </span>
    )
  }

  const isPublished = display === "published"

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={isPublished ? "Click to set Draft" : "Click to Publish"}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity disabled:opacity-50 cursor-pointer hover:opacity-75 ${
        isPublished
          ? "bg-emerald-500/15 text-emerald-600"
          : "bg-amber-500/15 text-amber-600"
      }`}
    >
      {display}
    </button>
  )
}
