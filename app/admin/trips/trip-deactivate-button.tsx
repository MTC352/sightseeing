"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PowerOff, Power } from "lucide-react"

export function TripDeactivateButton({ tripId, status }: { tripId: string; status: string }) {
  const [optimistic, setOptimistic] = useState(status)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  const isDeactivated = optimistic === "deactivated"

  async function toggle() {
    const next = isDeactivated ? "draft" : "deactivated"
    setPending(true)
    setOptimistic(next)
    await fetch(`/api/admin/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    router.refresh()
    setPending(false)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={isDeactivated ? "Reactivate trip (set to draft)" : "Deactivate trip (hide from site + AI)"}
      className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
        isDeactivated
          ? "text-red-500 hover:bg-red-500/10 hover:text-red-600"
          : "text-muted-foreground/60 hover:bg-secondary hover:text-red-500"
      }`}
    >
      {isDeactivated ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
    </button>
  )
}
