import test from "node:test"
import assert from "node:assert/strict"
const { localizeHref } = await import("../../.test-build/i18n/routing.js")

test("under /de, internal links gain the prefix; others are left alone", () => {
  const L = (h) => localizeHref(h, "de")
  assert.equal(L("/planner"), "/de/planner")
  assert.equal(L("/trip/abc"), "/de/trip/abc")
  assert.equal(L("/admin/x"), "/admin/x")
  assert.equal(L("https://ext.com"), "https://ext.com")
  assert.equal(L("#a"), "#a")
})
