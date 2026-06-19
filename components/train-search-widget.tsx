"use client"

import { useEffect, useRef } from "react"
import { useConsent } from "@/lib/cookie-consent"
import { ConsentNotice } from "@/components/consent-notice"

export function TrainSearchWidget() {
  const containerRef = useRef<HTMLDivElement>(null)
  const consent = useConsent()
  const marketing = !!consent?.marketing

  useEffect(() => {
    // Only inject the Travelpayouts affiliate script after marketing consent.
    if (!marketing) return
    if (!containerRef.current) return
    // Prevent re-injection if script already in this container
    if (containerRef.current.querySelector("script")) return

    const script = document.createElement("script")
    script.async = true
    script.charset = "utf-8"
    script.src =
      "https://c91.travelpayouts.com/content?currency=EUR&trs=506581&shmarker=256130&powered_by=true&locale=en&mode=train&arrival=390305&theme=white&layout=fluid&promo_id=4770"
    containerRef.current.appendChild(script)
  }, [marketing])

  if (!marketing) return <ConsentNotice label="the train search" />

  return <div ref={containerRef} className="w-full min-h-[120px]" />
}
