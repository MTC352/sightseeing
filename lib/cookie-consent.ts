import { useEffect, useState } from "react"

export interface ConsentState {
  version: 1
  timestamp: string
  necessary: true
  functional: boolean
  marketing: boolean
}

const CONSENT_KEY = "cookie_consent_v1"

/** Fired (on window) whenever consent is saved, so listeners (e.g. the
 *  Travelpayouts widgets) can react immediately without a page reload. */
export const CONSENT_CHANGE_EVENT = "cookieconsentchange"
/** Fired (on window) to (re)open the cookie preferences panel from anywhere
 *  (footer "Cookie Settings" link, a blocked widget's "Manage cookies" button). */
export const CONSENT_PREFS_OPEN_EVENT = "cookieprefsopen"

export function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConsentState
    if (parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function saveConsent(functional: boolean, marketing: boolean): ConsentState {
  const state: ConsentState = {
    version: 1,
    timestamp: new Date().toISOString(),
    necessary: true,
    functional,
    marketing,
  }
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  } catch { /* ignore */ }
  return state
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  } catch { /* ignore */ }
}

/** Ask the cookie banner to open its preferences panel. */
export function openCookiePreferences(): void {
  try {
    window.dispatchEvent(new Event(CONSENT_PREFS_OPEN_EVENT))
  } catch { /* ignore */ }
}

/**
 * React hook returning the current consent state, kept in sync across the app.
 * Re-reads on mount and whenever consent changes (same tab via the custom event,
 * other tabs via the native `storage` event). Returns `null` until the visitor
 * has made a choice.
 */
export function useConsent(): ConsentState | null {
  const [consent, setConsent] = useState<ConsentState | null>(null)
  useEffect(() => {
    setConsent(getConsent())
    const handler = () => setConsent(getConsent())
    window.addEventListener(CONSENT_CHANGE_EVENT, handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, handler)
      window.removeEventListener("storage", handler)
    }
  }, [])
  return consent
}
