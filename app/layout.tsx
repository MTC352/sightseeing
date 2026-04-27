import React, { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Instrument_Sans } from "next/font/google"
import Script from "next/script"
import { CartProvider } from "@/lib/cart-context"
import { WeatherProvider } from "@/lib/weather-context"
import { EditModeProvider } from "@/components/edit-mode-provider"
import { SitePasswordGate } from "@/components/site-password-gate"
import { SiteStoreProvider } from "@/components/providers/site-store-provider"
import "./globals.css"

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: ["400", "500", "600", "700"],
})

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: "sightseeing.lu - Handpicked Experiences in Luxembourg",
    template: "%s | sightseeing.lu",
  },
  description: "Discover the best tours, activities, and experiences in and around Luxembourg. Wine tastings, castle tours, e-bike adventures, dinner hopping and more with local guides.",
  keywords: ["Luxembourg tours", "sightseeing Luxembourg", "Luxembourg activities", "Luxembourg experiences", "things to do in Luxembourg", "Luxembourg City tours", "Moselle wine tasting", "castle tours Luxembourg"],
  authors: [{ name: "sightseeing.lu" }],
  creator: "sightseeing.lu",
  publisher: "sightseeing.lu",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "sightseeing.lu",
    title: "sightseeing.lu - Handpicked Experiences in Luxembourg",
    description: "Discover the best tours, activities, and experiences in and around Luxembourg with local guides.",
    url: BASE,
  },
  twitter: {
    card: "summary_large_image",
    title: "sightseeing.lu - Handpicked Experiences in Luxembourg",
    description: "Discover the best tours, activities, and experiences in and around Luxembourg with local guides.",
  },
  alternates: {
    canonical: BASE,
    languages: {
      "en": BASE,
      "fr": `${BASE}/fr`,
      "de": `${BASE}/de`,
      "x-default": BASE,
    },
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: "#7ec6b0",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <head>
        {/* Preconnect to external services for faster first paint */}
        <link rel="preconnect" href="https://api.openweathermap.org" />
        <link rel="preconnect" href="https://sightseeingluxembourg.palisis.com" />
        <link rel="preconnect" href="https://api.mapbox.com" />
        <link rel="dns-prefetch" href="https://events.mapbox.com" />
      </head>
      <body className="font-sans antialiased">
        <SiteStoreProvider>
        <SitePasswordGate>
          <CartProvider>
            <WeatherProvider>
              <Suspense>
                <EditModeProvider>{children}</EditModeProvider>
              </Suspense>
            </WeatherProvider>
          </CartProvider>
        </SitePasswordGate>
        </SiteStoreProvider>
        {/* Weglot Translation - FR, DE, EN */}
        <Script
          id="weglot-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var s = document.createElement('script');
                s.src = 'https://cdn.weglot.com/weglot.min.js';
                s.onload = function() {
                  Weglot.initialize({ api_key: 'wg_65ddaa54ea08d95572a1ed507b2b458b7' });
                };
                document.head.appendChild(s);
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}
