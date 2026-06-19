"use client"

import { useEffect } from "react"
import { useConsent } from "@/lib/cookie-consent"
import { ConsentNotice } from "@/components/consent-notice"

export function FlightSearchWidget() {
  const consent = useConsent()
  const marketing = !!consent?.marketing

  useEffect(() => {
    // Only inject the Travelpayouts affiliate script after marketing consent.
    if (!marketing) return
    // Use window flag so it survives HMR full reloads (module scope resets, window does not)
    if ((window as any).__tpFlightInjected) return
    ;(window as any).__tpFlightInjected = true

    // Set config before script loads
    ;(window as any).TPWL_CONFIGURATION = {
      ...((window as any).TPWL_CONFIGURATION ?? {}),
      resultsURL: "https://travel.sightseeing.lu",
    }

    const script = document.createElement("script")
    script.async = true
    script.type = "module"
    script.src = "https://tpembd.com/wl_web/main.js?wl_id=15226"
    document.head.appendChild(script)
    // No cleanup — third-party widget must not be removed/re-added
  }, [marketing])

  if (!marketing) return <ConsentNotice label="the flight search" />

  return <div id="tpwl-search" className="w-full" />
}
