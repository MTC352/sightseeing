"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, MessageSquare, MapPinned } from "lucide-react"
import { AiSystemEditor } from "@/components/admin/ai-system-editor"

const TABS = [
  { key: "chat", label: "Per-Trip Chat", icon: MessageSquare },
  { key: "trip_itinerary", label: "Itinerary Generator", icon: MapPinned },
] as const

export default function SingleTripAiSystemsPage() {
  const router = useRouter()
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("chat")

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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Single Trip AIs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          AI assistants scoped to a single trip — the per-trip chat and the itinerary generator. Switch between them below; each prompt is saved separately.
        </p>
      </div>

      <div className="mb-8 inline-flex rounded-xl border border-border bg-card p-1">
        {TABS.map((tab) => {
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* key forces a fresh editor instance per tab so each loads its own config */}
      <AiSystemEditor key={active} system={active} />
    </div>
  )
}
