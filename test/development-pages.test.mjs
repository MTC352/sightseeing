import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/development-pages.js")
const {
  DEVELOPMENT_PAGES,
  DEVELOPMENT_PAGE_SLUGS,
  topLevelSlug,
  sanitizeDisabledSlugs,
  isDevPageBlocked,
} = mod.default ?? mod

test("registry lists exactly the 9 governed pages", () => {
  const slugs = DEVELOPMENT_PAGES.map((p) => p.slug).sort()
  assert.deepEqual(slugs, ["cars", "emergency", "flights", "hotels", "impressum", "privacy", "trains", "travel", "widgets"])
  assert.equal(DEVELOPMENT_PAGE_SLUGS.size, 9)
})

test("topLevelSlug extracts the first path segment", () => {
  assert.equal(topLevelSlug("/emergency"), "emergency")
  assert.equal(topLevelSlug("/emergency/anything"), "emergency")
  assert.equal(topLevelSlug("/"), "")
  assert.equal(topLevelSlug(""), "")
})

test("sanitizeDisabledSlugs keeps only governed slugs, deduped", () => {
  assert.deepEqual(sanitizeDisabledSlugs(["emergency", "emergency", "cars"]), ["emergency", "cars"])
  assert.deepEqual(sanitizeDisabledSlugs(["about", "evil", 42, null, "hotels"]), ["hotels"])
  assert.deepEqual(sanitizeDisabledSlugs("nonsense"), [])
  assert.deepEqual(sanitizeDisabledSlugs(undefined), [])
})

test("isDevPageBlocked: governed + disabled + non-admin → true", () => {
  assert.equal(isDevPageBlocked("/emergency", ["emergency"], false), true)
})

test("isDevPageBlocked: admin always bypasses", () => {
  assert.equal(isDevPageBlocked("/emergency", ["emergency"], true), false)
})

test("isDevPageBlocked: enabled (not in disabled set) → false", () => {
  assert.equal(isDevPageBlocked("/emergency", [], false), false)
  assert.equal(isDevPageBlocked("/emergency", ["cars"], false), false)
})

test("isDevPageBlocked: non-governed page → false even if listed", () => {
  assert.equal(isDevPageBlocked("/about", ["about"], false), false)
})
