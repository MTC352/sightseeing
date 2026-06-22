import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/availability-parity.js")
const interpretSingleDayFallback = mod.interpretSingleDayFallback ?? mod.default?.interpretSingleDayFallback

test("single-day fallback — null (checkavail threw) is an ERROR, never 'no slots'", () => {
  assert.equal(interpretSingleDayFallback(null), "error")
  assert.equal(interpretSingleDayFallback(undefined), "error")
})

test("single-day fallback — ok:false (provider error) is an ERROR, never 'no slots'", () => {
  assert.equal(interpretSingleDayFallback({ ok: false }), "error")
  assert.equal(interpretSingleDayFallback({ ok: false, components: [] }), "error")
})

test("single-day fallback — ok with components is 'has-slots'", () => {
  assert.equal(interpretSingleDayFallback({ ok: true, components: [{}] }), "has-slots")
  assert.equal(interpretSingleDayFallback({ ok: true, components: [{}, {}] }), "has-slots")
})

test("single-day fallback — ok with zero components is a genuine 'empty'", () => {
  assert.equal(interpretSingleDayFallback({ ok: true, components: [] }), "empty")
  assert.equal(interpretSingleDayFallback({ ok: true }), "empty")
})

// ── PASS-2 checkavail fallback (date-level, start_time-independent) ──
const isCheckavailComponentBookable =
  mod.isCheckavailComponentBookable ?? mod.default?.isCheckavailComponentBookable
const resolveSelectedDateFallback =
  mod.resolveSelectedDateFallback ?? mod.default?.resolveSelectedDateFallback

test("checkavail component is bookable WITHOUT a start_time (MULTI/recurring tours)", () => {
  // The exact false-negative we fixed: a bookable component with no start_time.
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: "5" }), true)
  assert.equal(isCheckavailComponentBookable({ start_time: null, spaces_remaining: "UNLIMITED" }), true)
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: null }), true)
  assert.equal(isCheckavailComponentBookable({}), true)
})

test("checkavail component honors seats + party-size parity", () => {
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: "0" }), false)
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: "2" }, 2), true)
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: "1" }, 2), false)
  // Unparseable seat counts pass (we don't hide what we can't classify).
  assert.equal(isCheckavailComponentBookable({ spaces_remaining: "lots" }, 3), true)
  assert.equal(isCheckavailComponentBookable(null), false)
})

test("fallback verdict — checkavail success w/ a bookable component => available", () => {
  // (a) datesndeals miss + checkavail success (no start_time) => available.
  assert.equal(
    resolveSelectedDateFallback({ ddFailed: false, checkavail: { ok: true, bookable: true } }),
    "available",
  )
  assert.equal(
    resolveSelectedDateFallback({ ddFailed: true, checkavail: { ok: true, bookable: true } }),
    "available",
  )
})

test("fallback verdict — dual-source failure => unknown (never false 'none available')", () => {
  // (b) datesndeals failed AND checkavail errored/threw => unknown.
  assert.equal(resolveSelectedDateFallback({ ddFailed: true, checkavail: { ok: false } }), "unknown")
  assert.equal(resolveSelectedDateFallback({ ddFailed: true, checkavail: null }), "unknown")
  assert.equal(resolveSelectedDateFallback({ ddFailed: true, checkavail: undefined }), "unknown")
})

test("fallback verdict — checkavail error but datesndeals OK => no-change (keep verdict, not a closure)", () => {
  // (c) provider error must NOT emit a false confident "not available".
  assert.equal(resolveSelectedDateFallback({ ddFailed: false, checkavail: { ok: false } }), "no-change")
  assert.equal(resolveSelectedDateFallback({ ddFailed: false, checkavail: null }), "no-change")
})

test("fallback verdict — checkavail OK but no bookable component => confident not-available", () => {
  assert.equal(
    resolveSelectedDateFallback({ ddFailed: false, checkavail: { ok: true, bookable: false } }),
    "not-available",
  )
  assert.equal(
    resolveSelectedDateFallback({ ddFailed: true, checkavail: { ok: true, bookable: false } }),
    "not-available",
  )
})
