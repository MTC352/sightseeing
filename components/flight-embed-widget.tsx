"use client"

import { useEffect, useRef } from "react"

export function FlightEmbedWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ((window as any).__tpFlightEmbedInjected) return
    ;(window as any).__tpFlightEmbedInjected = true

    const container = containerRef.current
    if (!container) return

    const script = document.createElement("script")
    script.async = true
    script.charset = "utf-8"
    script.src =
      "https://tpembd.com/content?trs=506581&shmarker=256130&locale=en&curr=EUR&default_destination=Luxembourg&powered_by=true&border_radius=25&plain=false&color_button=%237ec6b0&color_button_text=%23ffffff&color_border=%237ec6b0&promo_id=4132&campaign_id=121"
    container.appendChild(script)
  }, [])

  return <div ref={containerRef} className="w-full min-h-[120px]" />
}
