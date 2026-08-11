import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/footer-menu-normalize.js")
const normalizeFooterMenu = mod.normalizeFooterMenu ?? mod.default?.normalizeFooterMenu
const defMod = await import("../.test-build/footer-menu-default.js")
const FOOTER_MENU_DEFAULT = defMod.FOOTER_MENU_DEFAULT ?? defMod.default?.FOOTER_MENU_DEFAULT

test("passes a valid document through unchanged in shape", () => {
  const out = normalizeFooterMenu(FOOTER_MENU_DEFAULT)
  assert.equal(out.groups.length, FOOTER_MENU_DEFAULT.groups.length)
  assert.equal(out.groups[2].items.find((i) => i.id === "plan-flights").pageKey, "flights")
})

test("returns the default for unusable input", () => {
  for (const bad of [null, undefined, 42, "x", {}, { groups: "nope" }, { groups: [] }]) {
    const out = normalizeFooterMenu(bad)
    assert.ok(Array.isArray(out.groups) && out.groups.length > 0, `bad input ${JSON.stringify(bad)} → default`)
  }
})

test("drops malformed groups/items and coerces fields", () => {
  const out = normalizeFooterMenu({
    groups: [
      { id: "g1", title: "G1", items: [
        { id: "i1", label: "A", href: "/a", external: "yes", hidden: 1 },
        { label: "", href: "/b" },              // empty label → dropped
        { id: "i3", label: "C" },               // missing href → dropped
        "garbage",                               // non-object → dropped
      ]},
      { title: "no id but has items", items: [{ label: "D", href: "/d" }] }, // id filled
      { id: "empty", title: "Empty", items: [] }, // no valid items → dropped
      "notagroup",
    ],
  })
  const g1 = out.groups.find((g) => g.id === "g1")
  assert.ok(g1)
  assert.equal(g1.items.length, 1)
  assert.equal(g1.items[0].external, true) // coerced from truthy
  assert.equal(g1.items[0].hidden, true)
  // group missing id still kept (id filled deterministically) because it has a valid item
  const filled = out.groups.find((g) => g.items.some((i) => i.label === "D"))
  assert.ok(filled && typeof filled.id === "string" && filled.id.length > 0)
  // empty group dropped
  assert.ok(!out.groups.some((g) => g.id === "empty"))
})

test("forces pageKey to null when not a known affiliate key", () => {
  const out = normalizeFooterMenu({ groups: [{ id: "g", title: "G", items: [
    { id: "i", label: "X", href: "/x", pageKey: "evil" },
  ]}]})
  assert.equal(out.groups[0].items[0].pageKey, null)
})

test("default document round-trips (normalize is a no-op on it)", () => {
  const out = normalizeFooterMenu(FOOTER_MENU_DEFAULT)
  const keys = out.groups.flatMap((g) => g.items.map((i) => i.pageKey).filter(Boolean)).sort()
  assert.deepEqual(keys, ["cars", "flights", "hotels", "trains", "travel"])
})
