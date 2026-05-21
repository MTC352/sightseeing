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
        {/* Global TravelAgency / LocalBusiness graph — emitted on every page so
            AI engines and search crawlers see consistent NAP + entity data. */}
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["TravelAgency", "LocalBusiness"],
              "@id": `${BASE}/#organization`,
              name: "sightseeing.lu",
              legalName: "sightseeing.lu",
              url: BASE,
              logo: `${BASE}/icon.png`,
              image: `${BASE}/images/hero-luxembourg.jpg`,
              description:
                "Luxembourg's leading platform for handpicked tours, activities, and experiences. We connect travellers with local guides across the Grand Duchy.",
              email: "hello@sightseeing.lu",
              telephone: "+352-621-000-000",
              priceRange: "€€",
              currenciesAccepted: "EUR",
              paymentAccepted: "Credit Card, Debit Card",
              areaServed: { "@type": "Country", name: "Luxembourg" },
              address: {
                "@type": "PostalAddress",
                streetAddress: "Place Guillaume II",
                addressLocality: "Luxembourg City",
                postalCode: "1648",
                addressCountry: "LU",
              },
              geo: {
                "@type": "GeoCoordinates",
                latitude: 49.6116,
                longitude: 6.1319,
              },
              openingHoursSpecification: [
                {
                  "@type": "OpeningHoursSpecification",
                  dayOfWeek: [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ],
                  opens: "00:00",
                  closes: "23:59",
                },
              ],
              sameAs: [
                "https://www.facebook.com/sightseeing.lu",
                "https://www.instagram.com/sightseeing.lu",
                "https://www.linkedin.com/company/sightseeing-lu",
              ],
              knowsLanguage: ["en", "fr", "de", "lb"],
            }),
          }}
        />
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
                  Weglot.initialize({
                    api_key: 'wg_65ddaa54ea08d95572a1ed507b2b458b7',
                    // Hide Weglot's default floating bottom-right switcher;
                    // the navbar provides its own EN / FR / DE buttons.
                    hide_switcher: true
                  });
                  // Belt-and-braces: if Weglot still injects the widget for any
                  // reason (older cached script, race), strip it from the DOM.
                  try {
                    var kill = function() {
                      var nodes = document.querySelectorAll('.weglot-container, .country-selector, aside.country-selector');
                      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
                    };
                    kill();
                    setTimeout(kill, 500);
                    setTimeout(kill, 2000);
                  } catch (e) {}
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
