"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

// Injects admin-configured custom HTML (header/footer blocks) into the public
// site. Plain dangerouslySetInnerHTML does NOT execute <script> tags, so we
// re-create each <script> element after inserting the markup — this is what
// makes analytics, tag managers, and chat widgets actually run.
export function CustomHtmlBlock({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin") ?? false

  useEffect(() => {
    const el = ref.current
    if (!el || isAdmin || !html) return
    el.innerHTML = html
    const scripts = Array.from(el.querySelectorAll("script"))
    for (const old of scripts) {
      const s = document.createElement("script")
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value)
      s.text = old.textContent ?? ""
      old.replaceWith(s)
    }
    return () => {
      el.innerHTML = ""
    }
  }, [html, isAdmin])

  if (isAdmin || !html) return null
  return <div ref={ref} suppressHydrationWarning />
}
