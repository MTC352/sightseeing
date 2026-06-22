import test from "node:test"
import assert from "node:assert/strict"

// Compiled by the `pretest` step (see package.json) → .test-build CJS.
const mod = await import("../../.test-build/canvas-trips.js")
const AUTO_SEED_PREFIX = mod.AUTO_SEED_PREFIX ?? mod.default?.AUTO_SEED_PREFIX
const isAutoSeedText = mod.isAutoSeedText ?? mod.default?.isAutoSeedText
const firstRealUserMessageIndex =
  mod.firstRealUserMessageIndex ?? mod.default?.firstRealUserMessageIndex

// The real seed sent by app/planner/page.tsx, reconstructed from the prefix so
// this test breaks loudly if the wording ever drifts from the constant.
const seedText = `${AUTO_SEED_PREFIX} today based on my preferences and the weather. The Trip Canvas already shows which trips are bookable on 2026-06-22 — recommend from those.`

test("isAutoSeedText matches the hidden auto-seed message", () => {
  assert.equal(isAutoSeedText(seedText), true)
  assert.equal(isAutoSeedText(`  ${seedText}`), true, "tolerates leading whitespace")
})

test("isAutoSeedText rejects real visitor messages and empties", () => {
  assert.equal(isAutoSeedText("Show me museums & walking-tours picks"), false)
  assert.equal(isAutoSeedText("Only show me outdoor experiences"), false)
  assert.equal(isAutoSeedText(""), false)
  assert.equal(isAutoSeedText(null), false)
  assert.equal(isAutoSeedText(undefined), false)
})

test("firstRealUserMessageIndex: -1 during the auto-seed turn (no real message yet)", () => {
  // Only the hidden seed + the AI's opening reply exist. The canvas MUST fall
  // back to the deterministic recommendedTrips, so no AI pin may be honored.
  const messages = [
    { role: "user", text: seedText },
    { role: "assistant", text: "Here are some great options for today!" },
  ]
  assert.equal(firstRealUserMessageIndex(messages), -1)
})

test("firstRealUserMessageIndex: -1 for an empty conversation", () => {
  assert.equal(firstRealUserMessageIndex([]), -1)
})

test("firstRealUserMessageIndex: points at the first real user turn (chip/typed)", () => {
  // seed(0) → AI reply(1) → real user message(2) → AI reply w/ searchTrips(3).
  // Pins from index >= 2 are honored, so an explicit "show me museums" narrows
  // the canvas while the auto-seed pin at index 1 is ignored.
  const messages = [
    { role: "user", text: seedText },
    { role: "assistant", text: "Opening recommendations." },
    { role: "user", text: "Show me museums & walking-tours picks" },
    { role: "assistant", text: "Here are the museums." },
  ]
  assert.equal(firstRealUserMessageIndex(messages), 2)
})

test("firstRealUserMessageIndex: a typed first message (no onboarding seed) counts immediately", () => {
  const messages = [
    { role: "user", text: "What are the best experiences for today's weather?" },
    { role: "assistant", text: "..." },
  ]
  assert.equal(firstRealUserMessageIndex(messages), 0)
})

test("firstRealUserMessageIndex: ignores assistant messages, keys only on user role", () => {
  const messages = [
    { role: "assistant", text: "Find the best trips for me — sounds like the seed but it's the assistant" },
    { role: "user", text: seedText },
    { role: "assistant", text: "reply" },
  ]
  // The assistant text starting with the prefix must NOT be treated as a real
  // user turn, and the seed user message must still be skipped → -1.
  assert.equal(firstRealUserMessageIndex(messages), -1)
})
