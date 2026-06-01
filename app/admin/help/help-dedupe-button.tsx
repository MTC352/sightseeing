"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Check, AlertCircle } from "lucide-react"

export function HelpDedupeButton() {
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string>("")
  const [error, setError] = useState("")
  const router = useRouter()

  async function handleDedupe() {
    setRunning(true)
    setError("")
    try {
      const res = await fetch("/api/admin/help/dedupe", { method: "POST" })
      const data = (await res.json()) as { removed?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Failed to remove duplicates")
      const n = data.removed ?? 0
      setResult(n === 0 ? "No duplicates found" : `Removed ${n} duplicate${n === 1 ? "" : "s"}`)
      setConfirming(false)
      router.refresh()
      setTimeout(() => setResult(""), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove duplicates")
    } finally {
      setRunning(false)
    }
  }

  if (result) {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-600">
        <Check className="h-4 w-4" /> {result}
      </span>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        {error && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
        <button
          type="button"
          onClick={handleDedupe}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
        >
          {running ? "Removing…" : "Confirm remove"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError("") }}
          disabled={running}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Remove duplicate help articles, keeping the oldest of each"
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
    >
      <Copy className="h-4 w-4" /> Remove duplicates
    </button>
  )
}
