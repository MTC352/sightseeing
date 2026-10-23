import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/page-layout.js")
const {
  hideKey, colsKey, isHiddenValue, hideValue, parseHideValue, listRemovedBoxes,
  cardPresetOptions, resolveCardColumns, resolveSplitTemplate, isValidColsValue,
  validateLayoutChanges, SPLIT_PRESETS,
} = mod.default ?? mod

test("hide values: removed vs restored", () => {
  assert.equal(isHiddenValue("/about|Our values"), true)
  assert.equal(isHiddenValue("0"), false)
  assert.equal(isHiddenValue(""), false)
  assert.equal(isHiddenValue(undefined), false)
})

test("hideValue round-trips and strips the separator from labels", () => {
  const v = hideValue("/about", "Values | Passion")
  assert.deepEqual(parseHideValue(v), { path: "/about", label: "Values / Passion" })
  assert.deepEqual(parseHideValue(hideValue("", "")), { path: "/", label: "Section" })
})

test("listRemovedBoxes ignores restored boxes and other keys", () => {
  const list = listRemovedBoxes({
    [hideKey("help/faq")]: "/help|FAQ",
    [hideKey("about/team")]: "/about|Team",
    [hideKey("about/gone")]: "0",
    [colsKey("about/values")]: "2",
    "home:hero:headline": "Hi",
  })
  assert.deepEqual(list.map((b) => b.id), ["about/team", "help/faq"])
})

test("card columns never exceed visible boxes", () => {
  assert.equal(resolveCardColumns(3, undefined, 3, 3), null) // untouched
  assert.equal(resolveCardColumns(3, undefined, 2, 2), null) // short row, untouched → as coded
  assert.equal(resolveCardColumns(3, "auto", 2, 3), 2)       // one removed → 2 columns
  assert.equal(resolveCardColumns(3, "auto", 5, 6), null)    // removed, still ≥ 3 visible
  assert.equal(resolveCardColumns(3, "4", 4, 4), 4)
  assert.equal(resolveCardColumns(3, "4", 2, 2), 2)
  assert.equal(resolveCardColumns(3, "1", 3, 3), 1)
  assert.equal(resolveCardColumns(3, "auto", 0, 3), 1)
  assert.equal(resolveCardColumns(3, "bogus", 3, 3), null)
})

test("card preset options are capped by visible boxes", () => {
  assert.deepEqual(cardPresetOptions(2), ["auto", "1", "2"])
  assert.deepEqual(cardPresetOptions(9), ["auto", "1", "2", "3", "4"])
  assert.deepEqual(cardPresetOptions(0), ["auto", "1"])
})

test("split template: one visible column fills the row", () => {
  assert.equal(resolveSplitTemplate("60-40", 1), SPLIT_PRESETS.stack)
  assert.equal(resolveSplitTemplate(undefined, 2), null)
  assert.equal(resolveSplitTemplate("60-40", 2), SPLIT_PRESETS["60-40"])
  assert.equal(resolveSplitTemplate("3", 2), null)
  assert.equal(resolveSplitTemplate("auto", 2), null) // "Default" = as coded
})

test("preset validation by kind", () => {
  assert.equal(isValidColsValue("cards", "3"), true)
  assert.equal(isValidColsValue("cards", "60-40"), false)
  assert.equal(isValidColsValue("split", "stack"), true)
  assert.equal(isValidColsValue("any", "7"), false)
})

test("only the superadmin may restore a removed box", () => {
  const saved = { [hideKey("about/team")]: "/about|Team" }
  const restore = { [hideKey("about/team")]: "0" }
  assert.match(validateLayoutChanges(restore, saved, false), /superadmin/)
  assert.equal(validateLayoutChanges(restore, saved, true), null)
  // Removing, or "restoring" something never removed, is fine for anyone.
  assert.equal(validateLayoutChanges({ [hideKey("x")]: "/|X" }, {}, false), null)
  assert.equal(validateLayoutChanges({ [hideKey("x")]: "0" }, {}, false), null)
})

test("removed-section values must carry a site-relative path", () => {
  for (const bad of ["javascript:alert(1)|X", "//evil.com|X", "https://evil.com|X", "/a b|X", "/ok|"]) {
    assert.match(validateLayoutChanges({ [hideKey("x")]: bad }, {}, true), /Invalid/, bad)
  }
  assert.equal(validateLayoutChanges({ [hideKey("x")]: "/about-us/team|Team" }, {}, false), null)
})

test("invalid layout values are rejected", () => {
  assert.match(validateLayoutChanges({ [colsKey("a")]: "9" }, {}, true), /preset/)
  assert.match(validateLayoutChanges({ [hideKey("")]: "/|X" }, {}, true), /id/)
  assert.equal(validateLayoutChanges({ "home:hero": "text" }, {}, false), null)
})
