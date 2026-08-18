"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/** "Ignore" action for an unresolved 404 row — marks it ignored so it drops out
 *  of the open list. The "Create redirect" affordance is a plain Link next to it. */
export function Log404Actions({ logId }: { logId: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function ignore() {
    setBusy(true)
    await fetch("/api/admin/blog-redirects/404s", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, status: "ignored" }),
    })
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={ignore}
      disabled={busy}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      Ignore
    </button>
  )
}
