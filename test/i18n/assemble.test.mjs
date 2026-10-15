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

test("looksUntranslated: all real sentences echoed back → true", async () => {
  const { looksUntranslated } = mod
  const src = ["Your local partner for all of Luxembourg", "One team, from the first idea", "Tell us your dates and budget"]
  assert.equal(looksUntranslated(src, src), true)
  // Weglot collapsed a space in its echo — still "unchanged"
  assert.equal(looksUntranslated(src, ["Your local partner forall of Luxembourg", src[1], src[2]]), true)
})

test("looksUntranslated: any real translation → false", async () => {
  const { looksUntranslated } = mod
  const src = ["Your local partner for all of Luxembourg", "One team, from the first idea", "Tell us your dates and budget"]
  assert.equal(looksUntranslated(src, ["Votre partenaire local pour tout le Luxembourg", src[1], src[2]]), false)
})

test("looksUntranslated: short names / too few sentences / misaligned → false", async () => {
  const { looksUntranslated } = mod
  assert.equal(looksUntranslated(["Luxembourg", "Instagram", "Tours", "Vianden"], ["Luxembourg", "Instagram", "Tours", "Vianden"]), false)
  assert.equal(looksUntranslated(["One two three", "Four five six"], ["One two three", "Four five six"]), false)
  assert.equal(looksUntranslated(["a b c", "d e f", "g h i"], ["a b c"]), false)
})
