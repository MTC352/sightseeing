"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

export function HelpArticleDeleteButton({ articleId, question }: { articleId: string; question: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/admin/help/${articleId}`, { method: "DELETE" })
    setDeleting(false)
    setConfirming(false)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {deleting ? "..." : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      title={`Delete "${question}"`}
      onClick={() => setConfirming(true)}
      className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
