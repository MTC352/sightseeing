"use client"

import { Cookie } from "lucide-react"
import { openCookiePreferences } from "@/lib/cookie-consent"

/**
 * Placeholder shown in place of a marketing/affiliate widget when the visitor
 * has NOT granted marketing-cookie consent. Lets them open the cookie
 * preferences to enable it.
 */
export function ConsentNotice({ label = "this content" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      <Cookie className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-sm text-sm text-muted-foreground">
        Marketing cookies are required to load {label}. They power our affiliate flight,
        hotel, train, and car-rental search widgets.
      </p>
      <button
        type="button"
        onClick={openCookiePreferences}
        className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Manage cookie preferences
      </button>
    </div>
  )
}
