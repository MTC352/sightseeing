"use client"

import { useEffect, useRef } from "react"

export function CarRentalWidget() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Prevent re-injection if script already in this container
    if (containerRef.current.querySelector("script")) return

    const script = document.createElement("script")
    script.async = true
    script.charset = "utf-8"
    script.src =
      "https://tpembd.com/content?currency=eur&trs=506581&shmarker=256130&country=luxembourg&city=luxembourg&locale=en&powered_by=true&bg_color=%23FFFFFFff&font_color=%23333333&button_color=%237ec6b0&button_font_color=%23ffffff&button_text=Search%20Offers&rounded_corners=true&benefits=true&dc_powered_by=true&supplier_logos=true&campaign_id=117&promo_id=3873"
    containerRef.current.appendChild(script)
  }, [])

  return <div ref={containerRef} className="w-full min-h-[120px]" />
}
