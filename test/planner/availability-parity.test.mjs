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
