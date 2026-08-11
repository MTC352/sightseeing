import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { CookieSettingsButton } from "@/components/cookie-banner"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for sightseeing.lu — how we collect, use, and protect your personal data under GDPR.",
}

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: 29 May 2026 · Effective from first publication
        </p>

        <a
          href="https://www.slg.lu/politique-de-confidentialite/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 px-6 py-5 transition-colors hover:bg-primary/15 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-base font-semibold text-foreground">View our official Privacy Policy</p>
            <p className="mt-1 text-sm text-muted-foreground">Read the full, legally binding privacy policy on slg.lu</p>
          </div>
          <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            Open Privacy Policy →
          </span>
        </a>

        <div className="mt-8 rounded-xl border border-border bg-secondary/30 px-5 py-4 text-sm text-muted-foreground">
          This policy explains which personal data sightseeing.lu collects, why, who we share it with, and what rights you have under the EU General Data Protection Regulation (GDPR — Regulation 2016/679) and Luxembourg data protection law as supervised by the <strong>CNPD</strong>.
        </div>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-foreground">

          {/* 1. Data Controller */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Data controller</h2>
            <div className="mt-3 space-y-1 text-muted-foreground">
              <p>The data controller responsible for this website is:</p>
              <p className="mt-2 font-medium text-foreground">sightseeing.lu S.à r.l.</p>
              <p>Place Guillaume II, L-1648 Luxembourg City, Grand Duchy of Luxembourg</p>
              <p>E-mail: <a href="mailto:privacy@sightseeing.lu" className="text-primary underline underline-offset-2">privacy@sightseeing.lu</a></p>
              <p>Phone: +352 621 000 000</p>
            </div>
          </section>

          {/* 2. Data we collect */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">2. What data we collect and why</h2>
            <div className="mt-4 space-y-6">

              <div>
                <h3 className="font-semibold">2.1 Browsing & server logs</h3>
                <p className="mt-2 text-muted-foreground">When you visit our website, our hosting provider (Vercel) automatically records standard server log data: IP address, browser type, operating system, referring URL, pages visited, and timestamp. This data is retained for up to 30 days for security and performance purposes.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(f) GDPR — legitimate interest in operating a secure website.</p>
              </div>

              <div>
                <h3 className="font-semibold">2.2 Job applications</h3>
                <p className="mt-2 text-muted-foreground">When you apply for a position via our careers page, we collect your full name, email address, phone number, cover letter, LinkedIn/portfolio URL, and any CV or document you upload. Your application data is stored in our database and, for uploaded files, in Vercel Blob secure cloud storage. We use this data solely to assess your application.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(b) GDPR — steps taken at your request prior to entering a contract. Data is retained for 6 months after the position is filled, then deleted.</p>
              </div>

              <div>
                <h3 className="font-semibold">2.3 Support tickets</h3>
                <p className="mt-2 text-muted-foreground">If you contact us via the support form, we collect your name, email address, and message content. This data is used only to handle your request.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(b) GDPR — performance of a contract or pre-contractual steps. Retained for 2 years.</p>
              </div>

              <div>
                <h3 className="font-semibold">2.4 AI trip planner</h3>
                <p className="mt-2 text-muted-foreground">The AI trip planner collects your stated travel preferences (group type, interests, travel date, budget, party size) and the full text of your conversation with the AI assistant. These messages are sent to <strong>Anthropic, Inc.</strong> (USA) for processing by Claude AI models. We do not store your planner conversations in our database after your session ends. Your preferences (group type, date, interests) are stored in a browser cookie (<code>sightseeing_prefs</code>) and localStorage on your own device.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(a) GDPR — your consent, given by using the planner. See also §5 (cookies) and §7 (Anthropic).</p>
              </div>

              <div>
                <h3 className="font-semibold">2.5 Shopping cart & recently viewed</h3>
                <p className="mt-2 text-muted-foreground">Your cart contents and recently viewed trip IDs are stored exclusively in your browser's localStorage. This data never leaves your device and is not sent to our servers unless you proceed to checkout through the Palisis booking system.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(f) GDPR — legitimate interest in providing a functional shopping experience.</p>
              </div>

              <div>
                <h3 className="font-semibold">2.6 Bookings and payments</h3>
                <p className="mt-2 text-muted-foreground">Booking and payment processing is handled entirely by <strong>Palisis AG / TourCMS</strong>. When you proceed to checkout, you are redirected to a Palisis-hosted booking page at <code>sightseeingluxembourg.palisis.com</code>. Your name, contact details, and payment information are collected and processed by Palisis under their own privacy policy. We receive a booking confirmation but do not store your raw payment data.</p>
                <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Legal basis:</span> Article 6(1)(b) GDPR — performance of a contract.</p>
              </div>

            </div>
          </section>

          {/* 3. Cookies */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Cookies and similar technologies</h2>
            <p className="mt-3 text-muted-foreground">We use cookies and browser localStorage. You can manage your preferences at any time via the <CookieSettingsButton /> link in the footer.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="py-2 px-3 text-left font-semibold">Name</th>
                    <th className="py-2 px-3 text-left font-semibold">Type</th>
                    <th className="py-2 px-3 text-left font-semibold">Purpose</th>
                    <th className="py-2 px-3 text-left font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  <tr>
                    <td className="py-2 px-3 font-mono">admin_session</td>
                    <td className="py-2 px-3">Strictly Necessary</td>
                    <td className="py-2 px-3">Authenticates the admin back-office session (HttpOnly, not readable by scripts)</td>
                    <td className="py-2 px-3">8 hours</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">sightseeing_prefs</td>
                    <td className="py-2 px-3">Functional</td>
                    <td className="py-2 px-3">Stores your AI planner preferences (travel date, interests, group size) to personalise recommendations</td>
                    <td className="py-2 px-3">Session / 30 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">sightseeing_cart_v2 (localStorage)</td>
                    <td className="py-2 px-3">Strictly Necessary</td>
                    <td className="py-2 px-3">Persists your shopping cart between pages</td>
                    <td className="py-2 px-3">Until cleared</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">recently_viewed (localStorage)</td>
                    <td className="py-2 px-3">Functional</td>
                    <td className="py-2 px-3">Remembers the last 8 trips you viewed for the "Recently Viewed" section</td>
                    <td className="py-2 px-3">Until cleared</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">Weglot cookies</td>
                    <td className="py-2 px-3">Functional</td>
                    <td className="py-2 px-3">Remembers your chosen display language (EN / FR / DE). Set by Weglot SAS (France)</td>
                    <td className="py-2 px-3">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">Travelpayouts cookies</td>
                    <td className="py-2 px-3">Marketing</td>
                    <td className="py-2 px-3">Affiliate tracking for flights, hotels, and car rental search widgets</td>
                    <td className="py-2 px-3">30 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono">Mapbox (_ga_* via events.mapbox.com)</td>
                    <td className="py-2 px-3">Functional</td>
                    <td className="py-2 px-3">Mapbox may set analytics cookies when you interact with the interactive map</td>
                    <td className="py-2 px-3">Up to 2 years</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 4. Third-party processors */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Third-party data processors and transfers</h2>
            <p className="mt-3 text-muted-foreground">We use the following sub-processors. Where data is transferred outside the EU/EEA, we rely on European Commission-approved Standard Contractual Clauses (SCCs) or equivalent adequacy decisions.</p>

            <div className="mt-4 space-y-4">
              {[
                {
                  name: "Vercel Inc.",
                  location: "USA (SCCs)",
                  purpose: "Website hosting and edge functions. Processes server request logs including IP addresses.",
                  link: "https://vercel.com/legal/privacy-policy",
                },
                {
                  name: "Palisis AG / TourCMS",
                  location: "Switzerland/UK",
                  purpose: "Booking engine and tour inventory management. Processes customer booking data and payment confirmation.",
                  link: "https://www.tourcms.com/privacy",
                },
                {
                  name: "Anthropic, Inc.",
                  location: "USA (SCCs)",
                  purpose: "AI language model powering the trip planner and blog AI. Receives the text of your planner conversations and writing prompts.",
                  link: "https://www.anthropic.com/privacy",
                },
                {
                  name: "Mapbox, Inc.",
                  location: "USA (SCCs)",
                  purpose: "Interactive map tiles and geocoding on trip and planner pages. May log tile request metadata.",
                  link: "https://www.mapbox.com/legal/privacy",
                },
                {
                  name: "Weglot SAS",
                  location: "France (EU)",
                  purpose: "Website translation into French and German. Scans page content to deliver translated versions and sets a language-preference cookie.",
                  link: "https://weglot.com/privacy",
                },
                {
                  name: "Travelpayouts (Aviasales / Go Travel Un Limited)",
                  location: "Cyprus (EU) / international",
                  purpose: "Powers the flight, hotel, and car rental search widgets on /flights, /hotels, /cars, and /travel. Uses affiliate tracking cookies.",
                  link: "https://www.travelpayouts.com/en/privacy_policy",
                },
                {
                  name: "OpenWeatherMap (OpenWeather Ltd.)",
                  location: "UK (adequacy decision)",
                  purpose: "Live weather data shown in the AI planner. API call is made server-side — your IP is not sent directly to OpenWeather.",
                  link: "https://openweather.co.uk/privacy-policy",
                },
                {
                  name: "Google LLC (Google Places API)",
                  location: "USA (SCCs)",
                  purpose: "Google business reviews displayed on the homepage. The API call is made server-side; individual visitor data is not sent.",
                  link: "https://policies.google.com/privacy",
                },
                {
                  name: "Vercel Blob (via Vercel Inc.)",
                  location: "USA (SCCs)",
                  purpose: "Secure storage for files uploaded during job applications (e.g. CV/résumé documents).",
                  link: "https://vercel.com/legal/privacy-policy",
                },
                {
                  name: "UserWay Inc.",
                  location: "USA (SCCs)",
                  purpose: "Accessibility widget that helps users adjust font size, contrast, and navigation. Loads a script from UserWay's CDN.",
                  link: "https://userway.org/privacy",
                },
              ].map((p) => (
                <div key={p.name} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{p.location}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{p.purpose}</p>
                  <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline underline-offset-2">Privacy policy →</a>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Retention */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Data retention</h2>
            <div className="mt-3 text-muted-foreground space-y-2">
              <p>We keep personal data only as long as necessary for the purpose it was collected, or as required by law:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Server logs: up to 30 days</li>
                <li>Job applications: 6 months after position is filled</li>
                <li>Support tickets: 2 years</li>
                <li>AI planner conversations: not stored server-side after the session ends</li>
                <li>Admin session cookies: 8 hours</li>
                <li>Browser localStorage (cart, prefs, recently viewed): until you clear your browser data</li>
              </ul>
            </div>
          </section>

          {/* 6. Your rights */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Your rights under GDPR</h2>
            <div className="mt-3 text-muted-foreground space-y-2">
              <p>You have the following rights regarding your personal data:</p>
              <ul className="ml-4 list-disc space-y-2">
                <li><span className="font-medium text-foreground">Right of access (Art. 15):</span> Request a copy of the personal data we hold about you.</li>
                <li><span className="font-medium text-foreground">Right to rectification (Art. 16):</span> Have inaccurate data corrected.</li>
                <li><span className="font-medium text-foreground">Right to erasure (Art. 17):</span> Request deletion of your data ("right to be forgotten"), where no legal obligation requires us to keep it.</li>
                <li><span className="font-medium text-foreground">Right to restriction (Art. 18):</span> Ask us to pause processing while a dispute is resolved.</li>
                <li><span className="font-medium text-foreground">Right to data portability (Art. 20):</span> Receive your data in a structured, machine-readable format.</li>
                <li><span className="font-medium text-foreground">Right to object (Art. 21):</span> Object to processing based on legitimate interest.</li>
                <li><span className="font-medium text-foreground">Right to withdraw consent (Art. 7(3)):</span> Withdraw consent at any time (e.g. via cookie settings) without affecting processing already carried out.</li>
              </ul>
              <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:privacy@sightseeing.lu" className="text-primary underline underline-offset-2">privacy@sightseeing.lu</a>. We will respond within 30 days.</p>
            </div>
          </section>

          {/* 7. Supervisory authority */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Right to lodge a complaint</h2>
            <div className="mt-3 text-muted-foreground">
              <p>If you believe we have not handled your data correctly, you have the right to lodge a complaint with the Luxembourg data protection supervisory authority:</p>
              <p className="mt-3">
                <span className="font-medium text-foreground">Commission Nationale pour la Protection des Données (CNPD)</span><br />
                15, Boulevard du Jazz, L-4370 Belvaux, Luxembourg<br />
                <a href="https://cnpd.public.lu" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">cnpd.public.lu</a>
              </p>
            </div>
          </section>

          {/* 8. Changes */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Changes to this policy</h2>
            <div className="mt-3 text-muted-foreground">
              <p>We may update this policy from time to time to reflect changes in our services or legal obligations. The "Last updated" date at the top of the page will always show when the policy was most recently revised. Significant changes will be notified via a banner on the website.</p>
            </div>
          </section>

        </div>

        <div className="mt-12 border-t border-border pt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link href="/impressum" className="hover:text-primary underline underline-offset-2">Legal Notice (Impressum)</Link>
          <Link href="/help" className="hover:text-primary underline underline-offset-2">Help & FAQ</Link>
          <Link href="/" className="hover:text-primary underline underline-offset-2">Back to homepage</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
