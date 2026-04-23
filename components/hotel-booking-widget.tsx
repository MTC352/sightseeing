"use client"

import { useEffect, useRef } from "react"

export function HotelBookingWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Prevent re-injection if script already in this container
    if (containerRef.current.querySelector("script")) return

    const script = document.createElement("script")
    script.async = true
    script.charset = "utf-8"
    script.src =
      "https://tpembd.com/content?trs=506581&shmarker=256130&lang=www&layout=S10391&powered_by=true&campaign_id=121&promo_id=4038"
    containerRef.current.appendChild(script)
  }, [])

  return <div ref={containerRef} className="w-full min-h-[120px]" />
}
