"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react"

interface Props {
  palisisId?: string | null | undefined
  variant?: "icon" | "full"
}

// Config keeps the copy/endpoint accurate in one component.
const SOURCE = {
  palisis: {
    label: "Palisis",
    endpoint: "/api/admin/palisis-import/single",
    idKey: "palisisId",
    accent: "blue",
  },
} as const

export function TripSyncButton({ palisisId, variant = "icon" }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [status, setStatus]   = useState<"idle" | "ok" | "err">("idle")
  const [message, setMessage] = useState<string>("")

  const source = palisisId ? "palisis" : null
  const id = palisisId ?? null
  if (!source || !id) return null

  const cfg = SOURCE[source]

  async function sync() {
    const confirmed = window.confirm(
      `Sync from ${cfg.label} will OVERRIDE this trip's local data.\n\n` +
      "All static fields (title, description, pricing, images, languages, etc.) " +
      `will be replaced with the latest data from ${cfg.label}. Any fields you edited ` +
      "manually here will be lost.\n\n" +
      "This action cannot be undone.\n\n" +
      "Do you want to continue?"
    )
    if (!confirmed) return

    setPending(true)
    setStatus("idle")
    setMessage("")
    try {
      const res = await fetch(cfg.endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ [cfg.idKey]: id }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus("ok")
        setMessage(data.action === "created" ? `Created from ${cfg.label}` : `Synced from ${cfg.label}`)
        router.refresh()
        setTimeout(() => setStatus("idle"), 2500)
      } else {
        setStatus("err")
        setMessage(data.error ?? "Sync failed")
        setTimeout(() => setStatus("idle"), 4000)
      }
    } catch (err) {
      setStatus("err")
      setMessage(err instanceof Error ? err.message : "Sync failed")
      setTimeout(() => setStatus("idle"), 4000)
    } finally {
      setPending(false)
    }
  }

  const hoverColor = cfg.accent === "blue" ? "hover:text-blue-600" : "hover:text-emerald-600"

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        title={
          status === "ok"  ? message
          : status === "err" ? `Error: ${message}`
          : `Sync from ${cfg.label} (override local data)`
        }
        className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
          status === "ok"
            ? "bg-emerald-500/10 text-emerald-600"
            : status === "err"
            ? "bg-destructive/10 text-destructive"
            : `text-muted-foreground/60 hover:bg-secondary ${hoverColor}`
        }`}
      >
        {status === "ok" ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : status === "err" ? (
          <XCircle className="h-3.5 w-3.5" />
        ) : (
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        )}
      </button>
    )
  }

  // Full variant
  const fullClasses =
    cfg.accent === "blue"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${fullClasses}`}
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Syncing…" : `Sync from ${cfg.label}`}
      </button>
      {status !== "idle" && (
        <p className={`flex items-center gap-1 text-xs ${
          status === "ok" ? "text-emerald-600" : "text-destructive"
        }`}>
          {status === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {message}
        </p>
      )}
    </div>
  )
}
