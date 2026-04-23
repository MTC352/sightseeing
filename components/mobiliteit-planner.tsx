"use client"

import { useEffect, useRef } from "react"
import { Bus } from "lucide-react"

const HAFAS_SCRIPT = "https://cdt.hafas.de/staticfiles/hafas-widget-core.1.0.0.js?language=en_GB"

export function MobiliteitPlanner() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load the HAFAS script once globally
    if (!document.querySelector(`script[src="${HAFAS_SCRIPT}"]`)) {
      const script = document.createElement("script")
      script.src = HAFAS_SCRIPT
      script.async = true
      document.head.appendChild(script)
    }

    // Inject our CSS overrides for the widget's background-image
    const styleId = "mobiliteit-widget-overrides"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = `
        [data-hfs-widget] .hfs_widgetAppContainer {
          min-height: 200px;
          background-color: rgb(209 0 116) !important;
        }
        [data-hfs-widget] .hfs_widgetAppContainer[data-layout="default"] .lyr_widgetTop {
          height: 125px;
          padding-left: 25px;
          padding-top: 30px;
          background-image: none !important;
          background-size: cover;
        }
        [data-hfs-widget] .hfs_widgetAppContainer[data-layout="default"] .lyr_widgetBottom {
          height: 82px;
          background-image: none !important;
          background-size: cover;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border border-[#d10074]/20" style={{ backgroundColor: "#d10074" }}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
          <Bus className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Getting there</h3>
          <p className="text-[10px] text-white/70">Powered by mobiliteit.lu</p>
        </div>
      </div>
      <div
        ref={containerRef}
        data-hfs-widget="true"
        data-hfs-widget-tp="true"
        data-hfs-widget-tp-postform="newtab"
        className="w-full"
        style={{ backgroundColor: "#d10074" }}
      />
    </div>
  )
}
