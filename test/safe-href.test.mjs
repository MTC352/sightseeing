import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/safe-href.js")
const { safeHref } = mod.default ?? mod

test("allows site paths, anchors, http(s), mailto and tel", () => {
  for (const v of ["/uploads/brochure.pdf", "#contact", "https://example.com/x.pdf", "http://a.lu", "mailto:hello@sightseeing.lu", "tel:+352266512200"]) {
    assert.equal(safeHref(v, "#fallback"), v)
  }
})

test("rejects script and protocol-relative links", () => {
  for (const v of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<b>x</b>", "//evil.com/x", "vbscript:x", "ftp://x"]) {
    assert.equal(safeHref(v, "#fallback"), "#fallback")
  }
})

test("empty or missing → fallback; whitespace trimmed", () => {
  assert.equal(safeHref("", "#f"), "#f")
  assert.equal(safeHref(undefined, "#f"), "#f")
  assert.equal(safeHref("  /a  ", "#f"), "/a")
})
