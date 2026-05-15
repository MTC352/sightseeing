"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react"

interface Props {
  palisisId: string | null | undefined
  variant?: "icon" | "full"
}

export function TripSyncButton({ palisisId, variant = "icon" }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [status, setStatus]   = useState<"idle" | "ok" | "err">("idle")
  const [message, setMessage] = useState<string>("")

  if (!palisisId) return null

  async function sync() {
    setPending(true)
    setStatus("idle")
    setMessage("")
    try {
      const res = await fetch("/api/admin/palisis-import/single", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ palisisId }),
      })
      const data = await res.json()
      if (data.ok) {
        setStatus("ok")
        setMessage(data.action === "created" ? "Created from Palisis" : "Synced from Palisis")
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

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        title={
          status === "ok"  ? message
          : status === "err" ? `Error: ${message}`
          : "Sync from Palisis (override local data)"
        }
        className={`rounded-lg p-2 transition-colors disabled:opacity-50 ${
          status === "ok"
            ? "bg-emerald-500/10 text-emerald-600"
            : status === "err"
            ? "bg-destructive/10 text-destructive"
            : "text-muted-foreground/60 hover:bg-secondary hover:text-blue-600"
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
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3.5 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Syncing…" : "Sync from Palisis"}
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
