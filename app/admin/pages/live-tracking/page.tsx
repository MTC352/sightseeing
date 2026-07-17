"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Bus, Code2, ExternalLink, Loader2, RotateCcw, Save, TrainFront } from "lucide-react"
import { DEFAULT_EMBED } from "@/components/live-tracking-maps"

type PageRow = {
  id: string
  slug: string
  content?: { busEmbed?: string; trainEmbed?: string } | null
}

export default function AdminLiveTrackingPage() {
  const [pageId, setPageId] = useState<string | null>(null)
  const [busEmbed, setBusEmbed] = useState("")
  const [trainEmbed, setTrainEmbed] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/admin/pages")
        if (!res.ok) throw new Error(`Failed to load pages (${res.status})`)
        const pages: PageRow[] = await res.json()
        const row = pages.find((p) => p.slug === "live-tracking")
        if (!row) throw new Error("The live-tracking page row is missing — run data migration 014.")
        const full = await fetch(`/api/admin/pages/${row.id}`)
        if (!full.ok) throw new Error(`Failed to load page (${full.status})`)
        const data: PageRow = await full.json()
        if (cancelled) return
        setPageId(data.id)
        // Show the EFFECTIVE value: fall back to the built-in default so the
        // admin always sees what is actually rendered on the page.
        setBusEmbed(data.content?.busEmbed?.trim() ? data.content.busEmbed : DEFAULT_EMBED)
        setTrainEmbed(data.content?.trainEmbed?.trim() ? data.content.trainEmbed : DEFAULT_EMBED)
      } catch (err) {
        if (!cancelled)
          setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to load" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    if (!pageId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { busEmbed: busEmbed.trim(), trainEmbed: trainEmbed.trim() } }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      setMessage({ kind: "ok", text: "Saved. The live tracking page now uses these embeds." })
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    {
      key: "bus",
      label: "Bus Tour map embed",
      icon: Bus,
      value: busEmbed,
      set: setBusEmbed,
    },
    {
      key: "train",
      label: "Train Tour map embed",
      icon: TrainFront,
      value: trainEmbed,
      set: setTrainEmbed,
    },
  ] as const

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/pages"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Pages
          </Link>
          <h1 className="mt-1 text-xl font-bold text-foreground">Live Tracking — Map Scripts</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage the map widget embed (script + widget HTML) shown in each tour box on{" "}
            <Link href="/live-tracking" target="_blank" className="text-primary underline-offset-2 hover:underline">
              /live-tracking
            </Link>
            . Leave a field empty to use the built-in default.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/live-tracking"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View page
          </Link>
          <button
            onClick={save}
            disabled={saving || loading || !pageId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{f.label}</p>
                </div>
                <button
                  onClick={() => f.set(DEFAULT_EMBED)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  title="Insert the default embed"
                >
                  <RotateCcw className="h-3 w-3" />
                  Insert default
                </button>
              </div>
              <textarea
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder={DEFAULT_EMBED}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/40"
              />
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Code2 className="mt-0.5 h-3 w-3 shrink-0" />
                Paste the full embed: the loader &lt;script&gt; tag plus the widget &lt;div&gt; (token,
                zoom, center). Empty = built-in default. Scripts run exactly as pasted on the public page.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
