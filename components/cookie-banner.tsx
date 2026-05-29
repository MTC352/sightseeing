"use client"

import { useState, useEffect } from "react"
import Script from "next/script"
import { X, ChevronDown, ChevronUp, Cookie } from "lucide-react"
import { getConsent, saveConsent, type ConsentState } from "@/lib/cookie-consent"

export function CookieBanner() {
  const [consent, setConsent] = useState<ConsentState | null | "loading">("loading")
  const [showPanel, setShowPanel] = useState(false)
  const [functional, setFunctional] = useState(true)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    setConsent(getConsent())
  }, [])

  function accept(fn: boolean, mk: boolean) {
    const state = saveConsent(fn, mk)
    setConsent(state)
    setShowPanel(false)
  }

  // Loading — don't flash banner
  if (consent === "loading") return null
  // Consent already given — just load scripts conditionally
  if (consent !== null) {
    return (
      <>
        {consent.functional && <WeglotScript />}
        {consent.marketing && <TravelpayoutsAllowed />}
      </>
    )
  }

  // No consent yet — show banner
  return (
    <>
      <div
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
                <p className="text-sm font-semibold text-foreground">We use cookies</p>
                <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  We use strictly necessary cookies to operate the site, and optional functional cookies for language preferences and trip planning. Marketing cookies power our flight and hotel search widgets. See our{" "}
                  <a href="/privacy" className="underline underline-offset-2 hover:text-primary">Privacy Policy</a> for details.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                onClick={() => accept(true, true)}
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
                title="Strictly necessary"
                description="Required for the website to function. Includes your shopping cart and admin authentication. Cannot be disabled."
                enabled={true}
                locked
              />
              {/* Functional */}
              <CategoryRow
                title="Functional"
                description="Language preferences (Weglot), trip planning preferences, and recently viewed trips. These improve your experience but are not essential."
                enabled={functional}
                onChange={setFunctional}
              />
              {/* Marketing */}
              <CategoryRow
                title="Marketing & affiliate tracking"
                description="Affiliate cookies from Travelpayouts power our flight, hotel, and car rental search widgets. Disabled by default."
                enabled={marketing}
                onChange={setMarketing}
              />
              <div className="flex justify-end px-4 py-3">
                <button
                  type="button"
                  onClick={() => accept(functional, marketing)}
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

/** Conditionally rendered Weglot initialiser — only after functional consent */
function WeglotScript() {
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
                api_key: 'wg_65ddaa54ea08d95572a1ed507b2b458b7',
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
  function reopen() {
    try {
      localStorage.removeItem("cookie_consent_v1")
      window.location.reload()
    } catch { /* ignore */ }
  }
  return (
    <button
      type="button"
      onClick={reopen}
      className="text-xs text-muted-foreground transition-colors hover:text-primary"
    >
      Cookie Settings
    </button>
  )
}
