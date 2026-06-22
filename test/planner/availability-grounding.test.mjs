import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/availability-parity.js")
const classifyTripAvailability = mod.classifyTripAvailability ?? mod.default?.classifyTripAvailability
const isConfidentNoneAvailable = mod.isConfidentNoneAvailable ?? mod.default?.isConfidentNoneAvailable
const isCanvasCountTrustworthy = mod.isCanvasCountTrustworthy ?? mod.default?.isCanvasCountTrustworthy

test("classify — onDate wins over everything (even unknown/dates)", () => {
  assert.equal(classifyTripAvailability({ onDate: true }), "available")
  assert.equal(classifyTripAvailability({ onDate: true, unknown: true }), "available")
  assert.equal(classifyTripAvailability({ onDate: true, dates: ["2026-06-24"] }), "available")
})

test("classify — unknown (dual-source failure) is 'unconfirmed', never 'none'", () => {
  assert.equal(classifyTripAvailability({ onDate: false, unknown: true }), "unconfirmed")
  // An incident must outrank stale alternative dates so it is never downgraded.
  assert.equal(classifyTripAvailability({ unknown: true, dates: ["2026-06-24"] }), "unconfirmed")
})

test("classify — not-on-date with other bookable dates is 'alternative'", () => {
  assert.equal(classifyTripAvailability({ onDate: false, dates: ["2026-06-24", "2026-06-25"] }), "alternative")
})

test("classify — confidently not bookable is 'none'", () => {
  assert.equal(classifyTripAvailability({ onDate: false, dates: [] }), "none")
  assert.equal(classifyTripAvailability({ onDate: false }), "none")
  assert.equal(classifyTripAvailability({}), "none")
  assert.equal(classifyTripAvailability(null), "none")
  assert.equal(classifyTripAvailability(undefined), "none")
})

test("none-available — confident only when 0 bookable AND 0 unconfirmed", () => {
  assert.equal(isConfidentNoneAvailable(0, 0), true)
})

test("none-available — at least one bookable is NOT a none-available day", () => {
  assert.equal(isConfidentNoneAvailable(2, 0), false)
  assert.equal(isConfidentNoneAvailable(1, 3), false)
})

test("none-available — an incident (unconfirmed>0) is NEVER a confident empty day", () => {
  // This is the core failsafe: a TourCMS outage must not make the AI say the
  // whole date is closed.
  assert.equal(isConfidentNoneAvailable(0, 1), false)
  assert.equal(isConfidentNoneAvailable(0, 5), false)
})

// ── canvas-count trustworthiness (zero-misinformation gate) ─────────────────

test("trustworthy — count>0 is always trustworthy when the scan succeeded", () => {
  assert.equal(isCanvasCountTrustworthy({ scanFailed: false, canvasCount: 3, matchingResolvedCount: 3 }), true)
  // even if some matching trips are unknown, having ≥1 bookable trip is concrete
  assert.equal(isCanvasCountTrustworthy({ scanFailed: false, canvasCount: 1, matchingResolvedCount: 1 }), true)
})

test("trustworthy — a FAILED scan is never trustworthy (regression a: endpoint failure)", () => {
  // A failed fetch leaves an empty map → canvasCount 0; this must NOT ground the
  // AI to "0 available". It is "couldn't confirm", not a closure.
  assert.equal(isCanvasCountTrustworthy({ scanFailed: true, canvasCount: 0, matchingResolvedCount: 0 }), false)
  // even a non-zero count from a flagged-failed scan is not trusted
  assert.equal(isCanvasCountTrustworthy({ scanFailed: true, canvasCount: 5, matchingResolvedCount: 5 }), false)
})

test("trustworthy — count===0 with NO resolved matching trips is NOT trustworthy (regression b: all-unknown)", () => {
  // Every matching trip is `unknown` (dual-source TourCMS incident) → the 0 is an
  // incident, not a confident empty day.
  assert.equal(isCanvasCountTrustworthy({ scanFailed: false, canvasCount: 0, matchingResolvedCount: 0 }), false)
})

test("trustworthy — count===0 WITH at least one resolved matching trip IS a confident empty day", () => {
  // The scan succeeded and at least one matching trip definitively does NOT run
  // that day → grounding the AI to a 0 is legitimate.
  assert.equal(isCanvasCountTrustworthy({ scanFailed: false, canvasCount: 0, matchingResolvedCount: 4 }), true)
})
