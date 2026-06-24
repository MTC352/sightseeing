import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/relative-date.js")
const resolveRelativeDate = mod.resolveRelativeDate ?? mod.default?.resolveRelativeDate

// Anchor: Wednesday 2026-06-24 (noon UTC => same calendar day in Luxembourg).
// This is the exact scenario from the bug report: gpt-4o-mini resolved
// "friday" to Monday 2026-06-29 instead of Friday 2026-06-26.
const WED = new Date("2026-06-24T12:00:00Z")

test("THE BUG: 'friday' from Wed 2026-06-24 resolves to Fri 2026-06-26 (not Mon 06-29)", () => {
  assert.equal(resolveRelativeDate("friday", WED), "2026-06-26")
})

test("'monday' from Wed resolves to the NEXT Monday 2026-06-29", () => {
  assert.equal(resolveRelativeDate("monday", WED), "2026-06-29")
})

test("today / tomorrow tokens", () => {
  assert.equal(resolveRelativeDate("today", WED), "2026-06-24")
  assert.equal(resolveRelativeDate("tomorrow", WED), "2026-06-25")
})

test("every weekday token resolves to its next occurrence (today counts)", () => {
  assert.equal(resolveRelativeDate("wednesday", WED), "2026-06-24") // today itself
  assert.equal(resolveRelativeDate("thursday", WED), "2026-06-25")
  assert.equal(resolveRelativeDate("saturday", WED), "2026-06-27")
  assert.equal(resolveRelativeDate("sunday", WED), "2026-06-28")
  assert.equal(resolveRelativeDate("tuesday", WED), "2026-06-30")
})

test("this-weekend / next-weekend from a midweek day", () => {
  // From Wed, the nearest Saturday is 06-27; next weekend Saturday is 07-04.
  assert.equal(resolveRelativeDate("this-weekend", WED), "2026-06-27")
  assert.equal(resolveRelativeDate("next-weekend", WED), "2026-07-04")
})

test("weekend tokens when today IS Saturday (2026-06-27)", () => {
  const SAT = new Date("2026-06-27T12:00:00Z")
  assert.equal(resolveRelativeDate("this-weekend", SAT), "2026-06-27") // today
  assert.equal(resolveRelativeDate("next-weekend", SAT), "2026-07-04")
})

test("weekend tokens when today IS Sunday (2026-06-28)", () => {
  const SUN = new Date("2026-06-28T12:00:00Z")
  // Sunday is still "this weekend"; next weekend lands on the following Saturday.
  assert.equal(resolveRelativeDate("this-weekend", SUN), "2026-06-28")
  assert.equal(resolveRelativeDate("next-weekend", SUN), "2026-07-04")
})

test("unrecognised / empty / non-string tokens return null (caller falls back)", () => {
  assert.equal(resolveRelativeDate("someday", WED), null)
  assert.equal(resolveRelativeDate("", WED), null)
  assert.equal(resolveRelativeDate("   ", WED), null)
  assert.equal(resolveRelativeDate(null, WED), null)
  assert.equal(resolveRelativeDate(undefined, WED), null)
  assert.equal(resolveRelativeDate(123, WED), null)
})

test("tokens are case-insensitive and trimmed", () => {
  assert.equal(resolveRelativeDate("  FRIDAY ", WED), "2026-06-26")
  assert.equal(resolveRelativeDate("Next-Weekend", WED), "2026-07-04")
})
