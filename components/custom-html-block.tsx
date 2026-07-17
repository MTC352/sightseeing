"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useConsent } from "@/lib/cookie-consent"

// Injects admin-configured custom HTML (header/footer blocks) into the public
// site. Plain dangerouslySetInnerHTML does NOT execute <script> tags, so we
// re-create each <script> element after inserting the markup — this is what
// makes analytics, tag managers, and chat widgets actually run.
//
// CONSENT GATE: tracking/analytics scripts (Google Analytics / gtag / Tag
// Manager / Meta pixel / Matomo…) only run when the visitor has accepted the
// "Marketing & Analytics" cookie category. Until then those <script> tags are
// stripped out (non-tracking markup in the same block still renders). When the
// banner is disabled in the admin panel, stored consent is force-set to
// all-true by the banner, so scripts load as before.

const TRACKING_SRC = /googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|connect\.facebook\.net|matomo|clarity\.ms|hotjar/i
const TRACKING_INLINE = /gtag\s*\(|dataLayer|GoogleAnalyticsObject|google_tag_manager|fbq\s*\(|_paq|ga\s*\(\s*['"]create/i

function isTrackingScript(s: HTMLScriptElement): boolean {
  const src = s.getAttribute("src") ?? ""
  if (src && TRACKING_SRC.test(src)) return true
  const text = s.textContent ?? ""
  return !src && TRACKING_INLINE.test(text)
}

/** Google's official kill-switch: window["ga-disable-<MEASUREMENT_ID>"] = true
 *  stops gtag from sending hits even if it was already loaded this session. */
function setGaDisableFlags(html: string, disabled: boolean) {
  const ids = html.match(/\b(G-[A-Z0-9]{4,}|UA-\d{4,}-\d+|AW-\d{4,})\b/g) ?? []
  for (const id of new Set(ids)) {
    ;(window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled
  }
}

export function CustomHtmlBlock({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin") ?? false
  const consent = useConsent()
  const marketingAllowed = consent?.marketing === true

  useEffect(() => {
    const el = ref.current
    if (!el || isAdmin || !html) return
    el.innerHTML = html
    setGaDisableFlags(html, !marketingAllowed)
    const scripts = Array.from(el.querySelectorAll("script"))
    for (const old of scripts) {
      if (!marketingAllowed && isTrackingScript(old)) {
        // No consent (yet) → drop the tracking script entirely.
        old.remove()
        continue
      }
      const s = document.createElement("script")
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value)
      s.text = old.textContent ?? ""
      old.replaceWith(s)
    }
    return () => {
      el.innerHTML = ""
    }
  }, [html, isAdmin, marketingAllowed])

  if (isAdmin || !html) return null
  return <div ref={ref} suppressHydrationWarning />
}
