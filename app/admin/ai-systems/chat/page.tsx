"use client"

/**
 * Legacy per-trip chat editor route. Per-trip chat is now managed alongside the
 * itinerary generator on the single "Single Trip AIs" page, so this static route
 * (which takes precedence over [system]/page.tsx) only redirects there to keep
 * exactly one editable surface and avoid prompt drift.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function LegacyTripChatRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/ai-systems/single-trip")
  }, [router])
  return null
}
