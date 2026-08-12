import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/i18n/collect.js")
const { isTranslatableText, dedupe, chunk } = mod

test("isTranslatableText rejects empty / whitespace / numeric / symbol-only", () => {
  assert.equal(isTranslatableText(""), false)
  assert.equal(isTranslatableText("   "), false)
  assert.equal(isTranslatableText("\n\t "), false)
  assert.equal(isTranslatableText("123"), false)
  assert.equal(isTranslatableText("€11"), false)
  assert.equal(isTranslatableText("45 - 60"), false)
  assert.equal(isTranslatableText("—"), false)
})

test("isTranslatableText accepts real words", () => {
  assert.equal(isTranslatableText("Book now"), true)
  assert.equal(isTranslatableText("Luxembourg"), true)
  assert.equal(isTranslatableText("Today's Best"), true)
})

test("dedupe preserves first-seen order", () => {
  assert.deepEqual(dedupe(["a", "b", "a", "c", "b"]), ["a", "b", "c"])
})

test("chunk splits into fixed-size groups", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 3), [])
})
