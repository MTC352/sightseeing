"use client"

import { useEffect } from "react"

/**
 * Pushes the GA4 `view_item` ecommerce event to the dataLayer when a product
 * (trip) page mounts. This is the site-exposed event the tracking spec asks for
 * on `/trip/{slug}` — GTM picks it up from the dataLayer and forwards it to
 * GA4 / Google Ads.
 *
 * Rendered from the server trip page with the resolved trip data, so the push
 * always carries real item id / name / category / price.
 */
interface ViewItemTrackerProps {
  id: string
  name: string
  category?: string
  price?: number
  currency?: string
}

interface DataLayerWindow extends Window {
  dataLayer?: Record<string, unknown>[]
}

export function ViewItemTracker({
  id,
  name,
  category,
  price,
  currency = "EUR",
}: ViewItemTrackerProps) {
  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window as DataLayerWindow
    w.dataLayer = w.dataLayer || []
    // Clear the previous ecommerce object first (GA4 recommendation) so stale
    // item data from a prior page never leaks into this event.
    w.dataLayer.push({ ecommerce: null })
    w.dataLayer.push({
      event: "view_item",
      ecommerce: {
        currency,
        ...(typeof price === "number" ? { value: price } : {}),
        items: [
          {
            item_id: id,
            item_name: name,
            ...(category ? { item_category: category } : {}),
            ...(typeof price === "number" ? { price } : {}),
            quantity: 1,
          },
        ],
      },
    })
  }, [id, name, category, price, currency])

  return null
}
