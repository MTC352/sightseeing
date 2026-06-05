"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { AiSystemEditor } from "@/components/admin/ai-system-editor"

// Per-trip chat and the itinerary generator are now managed together on the
// "Single Trip AIs" page. Any direct hit on their old per-system URLs redirects
// there so there is exactly one editable surface per prompt.
const SINGLE_TRIP_KEYS = new Set(["chat", "trip_itinerary"])

export default function AiSystemSettingsPage({ params }: { params: Promise<{ system: string }> }) {
  const { system } = use(params)
  const router = useRouter()
  const isSingleTrip = SINGLE_TRIP_KEYS.has(system)

  useEffect(() => {
    if (isSingleTrip) router.replace("/admin/ai-systems/single-trip")
  }, [isSingleTrip, router])

  if (isSingleTrip) return null

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/admin/ai-systems")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">AI Systems</p>
      </div>

      <AiSystemEditor system={system} />
    </div>
  )
}
