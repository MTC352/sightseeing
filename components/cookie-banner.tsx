"use client"

import { useState, useEffect } from "react"
import Script from "next/script"
import { X, ChevronDown, ChevronUp, Cookie } from "lucide-react"
import {
  getConsent,
  saveConsent,
  openCookiePreferences,
  CONSENT_PREFS_OPEN_EVENT,
  type ConsentState,
} from "@/lib/cookie-consent"

export interface CookieCategoryConfig {
  enabled: boolean
  defaultOn: boolean
  title: string
  description: string
}

export interface CookieBannerSettings {
  enabled: boolean
  title: string
  message: string
  privacyUrl: string
  necessaryTitle: string
  necessaryDescription: string
  categories: {
    functional: CookieCategoryConfig
    marketing: CookieCategoryConfig
  }
}

const FALLBACK_SETTINGS: CookieBannerSettings = {
  enabled: true,
  title: "We use cookies",
  message:
    "We use strictly necessary cookies to operate the site, and optional functional cookies for language preferences and trip planning. Marketing cookies power our flight and hotel search widgets.",
  privacyUrl: "/privacy",
  necessaryTitle: "Strictly necessary",
  necessaryDescription:
    "Required for the website to function. Includes your shopping cart and admin authentication. Cannot be disabled.",
  categories: {
    functional: {
      enabled: true,
      defaultOn: true,
      title: "Functional",
      description:
        "Language preferences (Weglot), trip planning preferences, and recently viewed trips. These improve your experience but are not essential.",
    },
    marketing: {
      enabled: true,
      defaultOn: false,
      title: "Marketing & affiliate tracking",
      description:
        "Affiliate cookies from Travelpayouts power our flight, hotel, and car rental search widgets. Disabled by default.",
    },
  },
}

export function CookieBanner({
  weglotApiKey = "",
  settings,
}: {
  weglotApiKey?: string
  settings?: CookieBannerSettings
}) {
  const cfg = settings ?? FALLBACK_SETTINGS
  const functionalOffered = cfg.categories.functional.enabled
  const marketingOffered = cfg.categories.marketing.enabled

  const [consent, setConsent] = useState<ConsentState | null | "loading">("loading")
  const [showPanel, setShowPanel] = useState(false)
  const [forceOpen, setForceOpen] = useState(false)
  const [functional, setFunctional] = useState(cfg.categories.functional.defaultOn)
  const [marketing, setMarketing] = useState(cfg.categories.marketing.defaultOn)

  useEffect(() => {
    const c = getConsent()
    setConsent(c)
    if (c) {
      setFunctional(c.functional)
      setMarketing(c.marketing)
    }
    // Allow the footer link / blocked widgets to re-open the preferences panel.
    const open = () => {
      const cur = getConsent()
      if (cur) {
        setFunctional(cur.functional)
        setMarketing(cur.marketing)
      }
      setForceOpen(true)
      setShowPanel(true)
    }
    window.addEventListener(CONSENT_PREFS_OPEN_EVENT, open)
    return () => window.removeEventListener(CONSENT_PREFS_OPEN_EVENT, open)
  }, [])

  // When the admin disables the consent banner, treat it as full consent so the
  // optional scripts still load (no consent management = load everything). This
  // also overrides any prior partial choice so returning users aren't stuck with
  // marketing/functional blocked after the admin turns the banner off.
  useEffect(() => {
    if (cfg.enabled || consent === "loading") return
    if (consent === null || !consent.functional || !consent.marketing) {
      setConsent(saveConsent(true, true))
    }
  }, [cfg.enabled, consent])

  // Reconcile stored consent against the admin's offered categories. If the admin
  // disables a category after a visitor already consented to it, force that stored
  // bit to false so the shared consent signal (read by useConsent() in the
  // Travelpayouts widgets) stops the scripts immediately — not just after the user
  // re-saves their preferences.
  useEffect(() => {
    if (!cfg.enabled || consent === "loading" || consent === null) return
    const fn = functionalOffered ? consent.functional : false
    const mk = marketingOffered ? consent.marketing : false
    if (fn !== consent.functional || mk !== consent.marketing) {
      setConsent(saveConsent(fn, mk))
    }
  }, [cfg.enabled, functionalOffered, marketingOffered, consent])

  function accept(fn: boolean, mk: boolean) {
    const state = saveConsent(fn, mk)
    setConsent(state)
    setShowPanel(false)
    setForceOpen(false)
  }

  // Loading — don't flash banner
  if (consent === "loading") return null

  // Admin disabled the consent system — load scripts, never show a banner.
  if (!cfg.enabled) {
    return (
      <>
        <WeglotScript apiKey={weglotApiKey} />
        <TravelpayoutsAllowed />
      </>
    )
  }

  const hasConsent = consent !== null
  // Effective gate: a script loads only if the admin still offers the category
  // AND the user consented to it. Disabling a category in admin immediately
  // stops its scripts even for users who previously opted in.
  const scripts = hasConsent ? (
    <>
      {functionalOffered && consent.functional && <WeglotScript apiKey={weglotApiKey} />}
      {marketingOffered && consent.marketing && <TravelpayoutsAllowed />}
    </>
  ) : null

  // Show banner when no choice has been made yet, or when re-opened from the footer.
  const showBanner = !hasConsent || forceOpen
  if (!showBanner) return scripts

  return (
    <>
      {scripts}
      <div
        data-no-edit
        role="dialog"
        aria-modal="false"
        aria-label="Cookie consent"
        className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-border bg-background shadow-2xl"
      >
        {/* Main bar */}
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">{cfg.title}</p>
                <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  {cfg.message}{" "}
                  {cfg.privacyUrl && (
                    <a
                      href={cfg.privacyUrl}
                      className="underline underline-offset-2 hover:text-primary"
                    >
                      Privacy Policy
                    </a>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {forceOpen && hasConsent && (
                <button
                  type="button"
                  onClick={() => {
                    setForceOpen(false)
                    setShowPanel(false)
                  }}
                  aria-label="Close cookie preferences"
                  className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPanel((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Manage preferences
                {showPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => accept(false, false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Reject non-essential
              </button>
              <button
                type="button"
                onClick={() => accept(functionalOffered, marketingOffered)}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Accept all
              </button>
            </div>
          </div>

          {/* Preferences panel */}
          {showPanel && (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-secondary/30">
              {/* Necessary */}
              <CategoryRow
                title={cfg.necessaryTitle}
                description={cfg.necessaryDescription}
                enabled={true}
                locked
              />
              {/* Functional */}
              {functionalOffered && (
                <CategoryRow
                  title={cfg.categories.functional.title}
                  description={cfg.categories.functional.description}
                  enabled={functional}
                  onChange={setFunctional}
                />
              )}
              {/* Marketing */}
              {marketingOffered && (
                <CategoryRow
                  title={cfg.categories.marketing.title}
                  description={cfg.categories.marketing.description}
                  enabled={marketing}
                  onChange={setMarketing}
                />
              )}
              <div className="flex justify-end px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    accept(
                      functionalOffered ? functional : false,
                      marketingOffered ? marketing : false,
                    )
                  }
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Save preferences
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function CategoryRow({
  title,
  description,
  enabled,
  locked,
  onChange,
}: {
  title: string
  description: string
  enabled: boolean
  locked?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={locked}
        onClick={() => onChange?.(!enabled)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60
          ${enabled ? "bg-primary" : "bg-secondary border border-border"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out
            ${enabled ? "translate-x-4" : "translate-x-0"}`}
        />
        <span className="sr-only">{enabled ? "Enabled" : "Disabled"}</span>
      </button>
    </div>
  )
}

/** Conditionally rendered Weglot initialiser — only after functional consent.
 *  The API key comes from the admin panel (integrations.weglot) with an env
 *  fallback, resolved server-side in app/layout.tsx and passed down as a prop.
 *  When no valid key is configured the loader renders nothing, so Weglot simply
 *  stays off rather than initialising against a dead/placeholder project. */
function WeglotScript({ apiKey }: { apiKey: string }) {
  // Only inject a well-formed Weglot key (wg_ + alphanumerics). This guards the
  // inline <script> against any unexpected value stored in the DB.
  if (!/^wg_[a-zA-Z0-9]+$/.test(apiKey)) return null
  return (
    <Script
      id="weglot-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            if (window.__weglotLoaded) return;
            window.__weglotLoaded = true;
            var s = document.createElement('script');
            s.src = 'https://cdn.weglot.com/weglot.min.js';
            s.onload = function() {
              Weglot.initialize({
                api_key: ${JSON.stringify(apiKey)},
                hide_switcher: true
              });
              try {
                var kill = function() {
                  var nodes = document.querySelectorAll('.weglot-container, .country-selector, aside.country-selector');
                  for (var i = 0; i < nodes.length; i++) nodes[i].remove();
                };
                kill(); setTimeout(kill, 500); setTimeout(kill, 2000);
              } catch(e) {}
            };
            document.head.appendChild(s);
          })();
        `,
      }}
    />
  )
}

/** Marker component — Travelpayouts scripts are embedded per-page; this signals consent is OK */
function TravelpayoutsAllowed() {
  useEffect(() => {
    // Signal to page-level Travelpayouts widgets that marketing consent was given
    ;(window as Window & { __tpConsentGiven?: boolean }).__tpConsentGiven = true
  }, [])
  return null
}

/** Cookie settings re-opener — rendered in the footer */
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="text-xs text-muted-foreground transition-colors hover:text-primary"
    >
      Cookie Settings
    </button>
  )
}
