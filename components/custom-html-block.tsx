"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { useConsent } from "@/lib/cookie-consent"

// Injects admin-configured custom HTML (header/footer blocks) into the public
// site. Plain dangerouslySetInnerHTML does NOT execute <script> tags, so we
// re-create each <script> element after inserting the markup — this is what
// makes analytics, tag managers, and chat widgets actually run.
//
// CONSENT GATE (block-level): the admin "Google Analytics / Tracking" (header)
// and "Analytics & Tracking" (footer) blocks are saved wrapped in
// <!--consent:marketing--> … <!--/consent:marketing--> markers. Everything
// between those markers — scripts, noscript pixels, iframes — is removed from
// the page until the visitor accepts the "Marketing & analytics" cookie
// category, and injected live (no reload) once they do. Content OUTSIDE the
// markers (Head Scripts / Meta Tags, Footer Widget, chat widgets…) always
// loads, regardless of consent.
//
// LEGACY FALLBACK: if the stored HTML predates the markers (none present),
// tracking scripts are detected by pattern (GTM/GA src domains, inline
// gtag/dataLayer/fbq/_paq snippets) and gated the same way, so old content
// stays compliant until it is re-saved from the admin panel.

const CONSENT_OPEN = "<!--consent:marketing-->"
const CONSENT_SEGMENT = /<!--consent:marketing-->[\s\S]*?<!--\/consent:marketing-->/g

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

    const hasMarkers = html.includes(CONSENT_OPEN)
    // Block-level gate: strip marked segments entirely when not consented.
    const effectiveHtml =
      hasMarkers && !marketingAllowed
        ? html.replace(CONSENT_SEGMENT, "<!-- consent-gated block withheld -->")
        : html

    el.innerHTML = effectiveHtml
    setGaDisableFlags(html, !marketingAllowed)

    const scripts = Array.from(el.querySelectorAll("script"))
    for (const old of scripts) {
      // Legacy pattern-based gate — only for content saved before the
      // block-level markers existed.
      if (!hasMarkers && !marketingAllowed && isTrackingScript(old)) {
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
