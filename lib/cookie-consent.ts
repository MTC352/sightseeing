export interface ConsentState {
  version: 1
  timestamp: string
  necessary: true
  functional: boolean
  marketing: boolean
}

const CONSENT_KEY = "cookie_consent_v1"

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
  return state
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch { /* ignore */ }
}
