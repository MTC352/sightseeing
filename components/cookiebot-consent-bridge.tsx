"use client"

import { useEffect } from "react"
import { saveConsent } from "@/lib/cookie-consent"

// Bridges Cookiebot's consent state into the app's existing consent signal.
//
// The site already reads consent via useConsent() (localStorage `cookie_consent_v1`)
// in the Travelpayouts flight/train widgets and the Weglot loader. Rather than
// rewrite every consumer, this component listens to Cookiebot's consent events
// and mirrors them into that same signal, so those features keep working with
// Cookiebot as the single source of truth.
//
// Category mapping (Cookiebot → app):
//   preferences → functional   (Weglot language preference)
//   marketing   → marketing     (Travelpayouts affiliate widgets)
// GTM itself is NOT gated here — it loads unconditionally and Google Consent
// Mode (driven by Cookiebot) governs whether its tags fire.

interface CookiebotConsent {
  necessary?: boolean
  preferences?: boolean
  statistics?: boolean
  marketing?: boolean
}

interface CookiebotWindow extends Window {
  Cookiebot?: { consent?: CookiebotConsent }
}

export function CookiebotConsentBridge() {
  useEffect(() => {
    const sync = () => {
      const cb = (window as CookiebotWindow).Cookiebot
      if (!cb?.consent) return
      // Analytics (statistics) OR affiliate (marketing) both count as "marketing"
      // for the app's single optional-tracking bucket.
      const marketing = !!cb.consent.marketing || !!cb.consent.statistics
      saveConsent(!!cb.consent.preferences, marketing)
    }

    // Cookiebot may load before or after this mounts — cover both.
    window.addEventListener("CookiebotOnAccept", sync)
    window.addEventListener("CookiebotOnDecline", sync)
    window.addEventListener("CookiebotOnLoad", sync)
    sync()

    return () => {
      window.removeEventListener("CookiebotOnAccept", sync)
      window.removeEventListener("CookiebotOnDecline", sync)
      window.removeEventListener("CookiebotOnLoad", sync)
    }
  }, [])

  return null
}
