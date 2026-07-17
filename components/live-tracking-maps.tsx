"use client"

import { useEffect, useRef } from "react"
import { Bus, TrainFront } from "lucide-react"

/**
 * Live tracking maps — GreatGuideMagic (GG) map widget.
 *
 * Each tour card renders an admin-editable embed (HTML + <script>) stored in
 * the `pages` row for slug "live-tracking" (content.busEmbed / trainEmbed),
 * editable at /admin/pages/live-tracking. Falls back to DEFAULT_EMBED when
 * the admin has not customised it.
 *
 * Plain innerHTML does NOT execute <script> tags, so scripts are re-created
 * after injection (same approach as CustomHtmlBlock). External scripts are
 * deduplicated by src across the page so a shared loader (which scans the
 * DOM for every `.gg-map-widget` div) runs once after ALL cards rendered.
 */

export const DEFAULT_EMBED = `<script defer src="https://remote.greatguidemagic.com/widget/map/loader.js"></script>
<div style="height:250px;" class="gg-map-widget" data-token="QqZQdonBxy" data-language="en" data-zoom="13" data-center-lat="49.6123327" data-center-lng="6.1258432"></div>`

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

function TourTrackingCard({
  title,
  icon: Icon,
  embed,
}: {
  title: string
  icon: typeof Bus
  embed: string
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
        <LiveBadge />
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
  const bus = busEmbed?.trim() ? busEmbed : DEFAULT_EMBED
  const train = trainEmbed?.trim() ? trainEmbed : DEFAULT_EMBED
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TourTrackingCard title="Bus Tour" icon={Bus} embed={bus} />
      <TourTrackingCard title="Train Tour" icon={TrainFront} embed={train} />
    </div>
  )
}
