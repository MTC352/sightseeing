"use client"

import Script from "next/script"

interface WeglotLoaderProps {
  apiKey: string
}

export function WeglotLoader({ apiKey }: WeglotLoaderProps) {
  return (
    <Script
      src="https://cdn.weglot.com/weglot.min.js"
      strategy="afterInteractive"
      onLoad={() => {
        // @ts-ignore
        if (typeof Weglot !== "undefined") {
          // @ts-ignore
          Weglot.initialize({
            api_key: apiKey,
            // Original language is English
            // Target languages: French (fr), German (de)
            // Weglot automatically handles:
            // - hreflang tags for SEO
            // - Subdirectory URLs (/fr/..., /de/...)
            // - Translation caching
            // We hide Weglot's default floating bottom-right switcher; any
            // language switching lives in the navbar / footer instead.
            hide_switcher: true,
            auto_switch: true,
            auto_switch_fallback: "en",
            exceptions: [
              // Don't translate code blocks, API responses, etc.
              { value: ".no-translate" },
              { value: "code" },
              { value: "pre" },
            ],
          })
        }
      }}
    />
  )
}
