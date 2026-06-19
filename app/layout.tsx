import React, { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { Instrument_Sans } from "next/font/google"
import Script from "next/script"
import { CartProvider } from "@/lib/cart-context"
import { PlannerListProvider } from "@/lib/planner-list-context"
import { WeatherProvider } from "@/lib/weather-context"
import { EditModeProvider } from "@/components/edit-mode-provider"
import { SiteStoreProvider } from "@/components/providers/site-store-provider"
import { CookieBanner } from "@/components/cookie-banner"
import { AccessibilityToolbar } from "@/components/accessibility-toolbar"
import { CustomHtmlBlock } from "@/components/custom-html-block"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { SiteAccessGate } from "@/components/site-access-gate"
import { isIndexingEnabled } from "@/lib/seo"
import { dbGetInjectionBlocks, dbGetWeglotApiKey, dbGetAnnouncement, dbGetSiteProtection } from "@/lib/db/queries"
import { withTimeout } from "@/lib/db"
import { headers, cookies } from "next/headers"
import {
  SITE_ACCESS_COOKIE,
  verifySiteAccess,
  PATHNAME_HEADER,
  PATHNAME_SIG_HEADER,
  verifyPathname,
} from "@/lib/site-protection"
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
  robots: isIndexingEnabled()
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-video-preview": -1,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      }
    : {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true,
        },
      },
}

export const viewport: Viewport = {
  themeColor: "#7ec6b0",
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Run independent DB reads concurrently so the root layout (and the deploy
  // healthcheck that renders `/`) is bounded by a single round-trip rather than
  // three sequential connection acquisitions. Each falls back gracefully so a
  // cold or slow DB never blocks first paint.
  //
  // The timeout is deliberately small (250ms). The autoscale deploy healthcheck
  // GETs `/` within ~0.3s of boot, while the managed prod DB can take several
  // seconds to wake from suspension. Layout reads resolve BEFORE the child page
  // renders its own read, so these budgets are additive on the critical path;
  // keeping each tiny guarantees `/` returns 200 well under the healthcheck
  // deadline even when the DB is stone cold. All three values are purely
  // additive (header/footer injection, Weglot key, announcement) — every
  // visible homepage element is client-fetched — so an empty fallback during
  // the brief cold window has no user-facing impact. A warm DB (~50ms) always
  // resolves them fully.
  const [injection, weglotApiKey, announcement, protection] = await Promise.all([
    withTimeout(dbGetInjectionBlocks().catch(() => ({ header: "", footer: "" })), 250, { header: "", footer: "" }),
    withTimeout(dbGetWeglotApiKey().catch(() => ""), 250, ""),
    withTimeout(dbGetAnnouncement().catch(() => null), 250, null),
    // null = DB read failed/timed out. Treated as "protected, password unknown"
    // below so the staging site fails closed, while already-authenticated
    // visitors (valid cookie) still get through.
    withTimeout(dbGetSiteProtection().catch(() => null), 250, null),
  ])

  // ── Frontend password gate (server-side, no content flash) ────────────────
  // The page HTML is never rendered until the visitor is authenticated. Admin
  // routes have their own auth and always bypass this gate. The pathname comes
  // from the x-pathname header set by proxy.ts, but we only trust it when its
  // companion signature verifies — otherwise a client could forge
  // `x-pathname: /admin` on the proxy-excluded `/` route to skip the gate. An
  // unsigned/missing path (e.g. bare `/`) defaults to "/", a gated public route.
  const hdrs = await headers()
  const rawPathname = hdrs.get(PATHNAME_HEADER)
  const pathnameTrusted = rawPathname
    ? await verifyPathname(rawPathname, hdrs.get(PATHNAME_SIG_HEADER))
    : false
  const pathname = pathnameTrusted && rawPathname ? rawPathname : "/"
  const isAdminRoute = pathname.startsWith("/admin")
  const protectionEnabled = protection === null ? true : protection.enabled
  let locked = false
  if (!isAdminRoute && protectionEnabled) {
    const token = (await cookies()).get(SITE_ACCESS_COOKIE)?.value
    const ok = await verifySiteAccess(token, protection === null ? null : protection.password)
    locked = !ok
  }

  if (locked) {
    return (
      <html lang="en" className={instrumentSans.variable}>
        <body className="font-sans antialiased">
          <SiteAccessGate />
        </body>
      </html>
    )
  }

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
              legalName: "sightseeing.lu S.à r.l.",
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
                    "Monday", "Tuesday", "Wednesday", "Thursday",
                    "Friday", "Saturday", "Sunday",
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
          {/* Announcement banner lives OUTSIDE the password gate so the
              gate's mount-delay never causes it to disappear on reload.
              The banner hides itself on /admin routes via usePathname(). */}
          <Suspense fallback={null}>
            <AnnouncementBanner announcement={announcement} />
          </Suspense>
          <CartProvider>
            <PlannerListProvider>
            <WeatherProvider>
              <Suspense>
                <EditModeProvider>
                  {/* Admin-configured custom HTML injected above the navbar
                      (head scripts, analytics). */}
                  <CustomHtmlBlock html={injection.header} />
                  {children}
                  {/* Admin-configured custom HTML injected below the footer
                      (chat widgets, body-end scripts). */}
                  <CustomHtmlBlock html={injection.footer} />
                </EditModeProvider>
              </Suspense>
            </WeatherProvider>
            </PlannerListProvider>
          </CartProvider>
        </SiteStoreProvider>

        {/* ── Cookie consent banner ────────────────────────────────────────
            Client component. Also conditionally loads Weglot only after
            the user accepts functional cookies. */}
        <CookieBanner weglotApiKey={weglotApiKey} />

        {/* ── Accessibility toolbar ────────────────────────────────────────
            Built-in WCAG 2.1 AA / EAA 2025 accessibility panel.
            Provides: text size, high contrast, dyslexia font, focus outlines.
            Preferences stored in localStorage; no third-party dependency.
            To replace with UserWay: sign up free at https://userway.org,
            remove <AccessibilityToolbar /> below, and add:
            <Script src="https://cdn.userway.org/widget.js" data-account="YOUR_ID" strategy="lazyOnload" /> */}
        <AccessibilityToolbar />

        {/* ── Userback feedback widget ──────────────────────────────────────
            Lets testers submit feedback/bug reports from any page while the
            site is in staging. Loads after the page is interactive. */}
        <Script id="userback-widget" strategy="afterInteractive">
          {`window.Userback = window.Userback || {};
Userback.access_token = "A-BKTgSB2GkdORqgFBBqlxgTjZI";
(function(d) {
  var s = d.createElement('script');s.async = true;s.src = 'https://static.userback.io/widget/v1.js';(d.head || d.body).appendChild(s);
})(document);`}
        </Script>
      </body>
    </html>
  )
}
