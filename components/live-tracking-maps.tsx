"use client"

import { useEffect, useRef, useState } from "react"
import { Bus, Code2, Loader2, RotateCcw, TrainFront, X } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"

/**
 * Live tracking maps — GreatGuideMagic (GG) map widget.
 *
 * Each tour card renders an admin-editable embed (HTML + <script>) stored in
 * the `pages` row for slug "live-tracking" (content.busEmbed / trainEmbed).
 * Editable in two places:
 *   - /admin/pages/live-tracking (backend editor)
 *   - inline: in frontend Edit Mode (?admin_edit=1) each card shows an
 *     "Edit Script" button that opens a popup and saves via the same
 *     PATCH /api/admin/pages/{id} endpoint.
 * Empty value = built-in DEFAULT_EMBED fallback.
 *
 * Plain innerHTML does NOT execute <script> tags, so scripts are re-created
 * after injection (same approach as CustomHtmlBlock). External scripts are
 * deduplicated by src across the page so a shared loader (which scans the
 * DOM for every `.gg-map-widget` div) runs once after ALL cards rendered.
 */

export const DEFAULT_EMBED = `<script defer src="https://remote.greatguidemagic.com/widget/map/loader.js"></script>
<div style="height:250px;" class="gg-map-widget" data-token="QqZQdonBxy" data-language="en" data-zoom="13" data-center-lat="49.6123327" data-center-lng="6.1258432"></div>`

const PAGE_SLUG = "live-tracking"

function MapEmbed({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !html) return
    el.innerHTML = html

    const appended: HTMLScriptElement[] = []
    const scripts = Array.from(el.querySelectorAll("script"))
    for (const old of scripts) {
      const src = old.getAttribute("src")
      if (src && document.querySelector(`script[data-embed-src="${CSS.escape(src)}"]`)) {
        // Same external script already (re)injected by another card this
        // page-view — it executes after this effect, sees all widget divs.
        old.remove()
        continue
      }
      const s = document.createElement("script")
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value)
      s.text = old.textContent ?? ""
      if (src) {
        s.setAttribute("data-embed-src", src)
        // Loaders must re-execute on every mount (client-side navigation),
        // so drop any stale copy from a previous page view first.
        document
          .querySelectorAll(`script[data-embed-src="${CSS.escape(src)}"]`)
          .forEach((e) => e.remove())
        old.remove()
        document.body.appendChild(s)
        appended.push(s)
      } else {
        old.replaceWith(s)
      }
    }

    return () => {
      appended.forEach((s) => s.remove())
      el.innerHTML = ""
    }
  }, [html])

  return (
    <div
      ref={ref}
      data-no-edit
      className="absolute inset-0 [&_.gg-map-widget]:!h-full [&_iframe]:h-full [&_iframe]:w-full"
    />
  )
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Live
    </span>
  )
}

/** Popup editor for one card's embed script (frontend Edit Mode only). */
function ScriptEditorModal({
  title,
  initial,
  saving,
  error,
  onSave,
  onClose,
}: {
  title: string
  initial: string
  saving: boolean
  error: string | null
  onSave: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      data-editable="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">{title} — map embed script</h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary/40"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Paste the full embed: the loader &lt;script&gt; tag plus the widget &lt;div&gt; (token, zoom,
          center). It runs exactly as pasted on the public page.
        </p>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setValue(DEFAULT_EMBED)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Insert default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(value)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save script
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TourTrackingCard({
  title,
  icon: Icon,
  embed,
  isEditMode,
  onEditScript,
}: {
  title: string
  icon: typeof Bus
  embed: string
  isEditMode: boolean
  onEditScript: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <button
              onClick={onEditScript}
              data-editable="true"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <Code2 className="h-3 w-3" />
              Edit Script
            </button>
          )}
          <LiveBadge />
        </div>
      </div>

      {/* Live map (admin-editable embed) */}
      <div className="relative aspect-[4/3]" data-no-edit>
        <MapEmbed html={embed} />
      </div>
    </div>
  )
}

export function LiveTrackingMaps({
  busEmbed,
  trainEmbed,
}: {
  busEmbed?: string
  trainEmbed?: string
}) {
  const { isEditMode } = useEditMode()
  // Local copies so an inline save re-renders the maps without a reload.
  const [embeds, setEmbeds] = useState({
    bus: busEmbed?.trim() ? busEmbed : "",
    train: trainEmbed?.trim() ? trainEmbed : "",
  })
  const [editing, setEditing] = useState<null | "bus" | "train">(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function saveEmbed(field: "bus" | "train", value: string) {
    setSaving(true)
    setSaveError(null)
    try {
      const listRes = await fetch("/api/admin/pages")
      if (!listRes.ok) throw new Error(`Not authorized to save (${listRes.status})`)
      const pages: { id: string; slug: string }[] = await listRes.json()
      const row = pages.find((p) => p.slug === PAGE_SLUG)
      if (!row) throw new Error("live-tracking page row missing — run data migration 014")
      const next = { ...embeds, [field]: value.trim() }
      const res = await fetch(`/api/admin/pages/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { busEmbed: next.bus, trainEmbed: next.train } }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      setEmbeds(next)
      setEditing(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const cards = [
    { key: "bus" as const, title: "Bus Tour", icon: Bus },
    { key: "train" as const, title: "Train Tour", icon: TrainFront },
  ]

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        {cards.map((c) => (
          <TourTrackingCard
            key={c.key}
            title={c.title}
            icon={c.icon}
            embed={embeds[c.key] || DEFAULT_EMBED}
            isEditMode={isEditMode}
            onEditScript={() => {
              setSaveError(null)
              setEditing(c.key)
            }}
          />
        ))}
      </div>

      {editing && (
        <ScriptEditorModal
          title={editing === "bus" ? "Bus Tour" : "Train Tour"}
          initial={embeds[editing] || DEFAULT_EMBED}
          saving={saving}
          error={saveError}
          onSave={(v) => saveEmbed(editing, v)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
