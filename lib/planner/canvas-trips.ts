// Canvas determinism for the Trip Planner "Recommended for you" panel.
//
// WHY THIS EXISTS — the canvas count was non-deterministic for identical prefs:
// The planner auto-sends ONE hidden "seed" message after onboarding so the AI
// produces an opening recommendation. The AI answers that seed by calling the
// `searchTrips` tool, and whatever trip set it pins becomes the canvas. But that
// opening pick is non-deterministic — on one load the model returns the whole
// catalog (18), on the next it narrows to a theme (7 "museums"), on the next a
// tiny shortlist (3). Because "Available on Today" is just the on-date slice of
// that pinned set, the badge swung 7 → 3 → 1 for the SAME preferences. The user
// (correctly) reported this as broken.
//
// FIX: tool pins from the auto-seed turn must NOT drive the canvas. Until the
// visitor sends a REAL chat message (typing or clicking a suggestion chip) the
// canvas stays on the deterministic `recommendedTrips` fallback. Once a real
// message lands, the AI may re-pin (so "show me museums" still narrows the
// canvas). These pure helpers make that gate unit-testable.

/**
 * Prefix of the hidden auto-seed message. The seed is constructed at send time
 * as `${AUTO_SEED_PREFIX} <date phrase> based on my preferences …`, so a simple
 * prefix match reliably identifies it. Kept here as the single source of truth
 * so the sender and the detector can never drift apart.
 */
export const AUTO_SEED_PREFIX = "Find the best trips for me"

/** True when a user message's text is the hidden auto-seed (not a real turn). */
export function isAutoSeedText(text: string | null | undefined): boolean {
  return !!text && text.trimStart().startsWith(AUTO_SEED_PREFIX)
}

/** Minimal message shape the gate needs (decoupled from the UI message type). */
export interface CanvasGateMessage {
  role: string
  text?: string | null
}

/**
 * Index of the FIRST real (non-auto-seed) user message, or -1 if the visitor
 * has not interacted yet. Tool pins from messages BEFORE this index belong to
 * the auto-seed turn and must be ignored so the canvas stays deterministic.
 *
 * Returning -1 means "honor no AI pins yet — show the deterministic
 * recommendedTrips". Any value >= 0 means AI pins from that index onward are
 * honored (later searchTrips/getTripDetails outputs win, so explicit narrowing
 * like "show me museums" still re-pins the canvas).
 */
export function firstRealUserMessageIndex(messages: CanvasGateMessage[]): number {
  return messages.findIndex((m) => m.role === "user" && !isAutoSeedText(m.text))
}
