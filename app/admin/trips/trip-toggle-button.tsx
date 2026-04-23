"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function TripToggleButton({
  tripId,
  field,
  value,
}: {
  tripId: string
  field: "featured" | "featuredDeparture"
  value: boolean
}) {
  const [optimistic, setOptimistic] = useState(value)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function toggle() {
    setPending(true)
    setOptimistic((v) => !v)
    await fetch(`/api/admin/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !optimistic }),
    })
    router.refresh()
    setPending(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
        optimistic ? "bg-primary" : "bg-border"
      }`}
      aria-checked={optimistic}
      role="switch"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          optimistic ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}
