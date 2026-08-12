import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/i18n/assemble.js")
const { splitCacheMisses, assembleTranslations } = mod

test("splitCacheMisses returns only uncached, deduped, in order", () => {
  const cached = new Map([["Book now", "Réservez"]])
  assert.deepEqual(
    splitCacheMisses(["Book now", "Search", "Search", "Help"], cached),
    ["Search", "Help"],
  )
})

test("assembleTranslations prefers cache, then fresh, else source fallback", () => {
  const cached = new Map([["Book now", "Réservez"]])
  const fresh = new Map([["Help", "Aide"]])
  assert.deepEqual(
    assembleTranslations(["Book now", "Help", "Missing"], cached, fresh),
    { "Book now": "Réservez", Help: "Aide", Missing: "Missing" },
  )
})
