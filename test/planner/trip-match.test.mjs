import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/trip-match.js")
const { normalizeTitle, matchById, matchByTitle, matchTrip, resolveCartToolAction } = mod.default ?? mod

const CATALOG = [
  { id: "tcms_5", title: "Boat Cruise on the Moselle" },
  { id: "tcms_18", title: "Combi-ticket: City Train & 7 Museums" },
  { id: "tcms_7", title: "City Train" },
]

test("normalizeTitle — trims, lowercases, strips apostrophes, collapses spaces", () => {
  assert.equal(normalizeTitle("  The   Boat’s  Cruise "), "the boats cruise")
})

test("matchById — exact internal id", () => {
  assert.equal(matchById([CATALOG], "tcms_18")?.id, "tcms_18")
})

test("matchById — raw Palisis id is retried in the tcms_ form", () => {
  assert.equal(matchById([CATALOG], "5")?.id, "tcms_5")
})

test("matchById — empty/unknown id returns undefined", () => {
  assert.equal(matchById([CATALOG], ""), undefined)
  assert.equal(matchById([CATALOG], "nope"), undefined)
  assert.equal(matchById([CATALOG], null), undefined)
})

test("matchByTitle — exact normalised match", () => {
  assert.equal(matchByTitle([CATALOG], "boat cruise on the moselle")?.id, "tcms_5")
})

test("matchByTitle — substring either direction ('the boat cruise')", () => {
  // user phrase is a substring of the full title
  assert.equal(matchByTitle([CATALOG], "boat cruise")?.id, "tcms_5")
})

test("matchByTitle — blank / whitespace title never matches a random row", () => {
  assert.equal(matchByTitle([CATALOG], "   "), undefined)
  assert.equal(matchByTitle([CATALOG], ""), undefined)
})

test("matchTrip — id wins over title", () => {
  assert.equal(matchTrip([CATALOG], { tripId: "tcms_7", tripTitle: "Boat Cruise on the Moselle" })?.id, "tcms_7")
})

test("matchTrip — falls back to title when id misses", () => {
  assert.equal(matchTrip([CATALOG], { tripId: "unknown", tripTitle: "city train" })?.id, "tcms_7")
})

test("matchTrip — removeFromCart over the live list (single pool)", () => {
  const list = [{ id: "tcms_5", title: "Boat Cruise on the Moselle" }]
  assert.equal(matchTrip([list], { tripTitle: "boat cruise" })?.id, "tcms_5")
  // a trip not in the list resolves to undefined (honest "nothing removed")
  assert.equal(matchTrip([list], { tripTitle: "city train" }), undefined)
})

/* ── Tool-loop contract: resolveCartToolAction (the onToolCall decision) ──
 * The chat must be HONEST: never claim "Saved/Removed X" without a real match,
 * and "Cleared N" must report the true count. These assert the exact
 * user-facing message + the changed/trip side-effect signal. */

test("addToCart — match → changed:true + 'Saved' message naming the trip", () => {
  const r = resolveCartToolAction("addToCart", { tripId: "tcms_18" }, { catalog: [CATALOG], list: [] })
  assert.equal(r.kind, "add")
  assert.equal(r.changed, true)
  assert.equal(r.trip.id, "tcms_18")
  assert.match(r.message, /^Saved /)
  assert.ok(r.message.includes("Combi-ticket: City Train & 7 Museums"))
})

test("addToCart — no match → changed:false + honest failure (no false 'Saved')", () => {
  const r = resolveCartToolAction("addToCart", { tripTitle: "Nonexistent Tour" }, { catalog: [CATALOG], list: [] })
  assert.equal(r.changed, false)
  assert.equal(r.trip, undefined)
  assert.ok(!/^Saved /.test(r.message))
  assert.ok(r.message.includes("Could not add"))
  assert.ok(r.message.includes("Nonexistent Tour"))
})

test("removeFromCart — in list → changed:true + 'Removed' message", () => {
  const list = [{ id: "tcms_5", title: "Boat Cruise on the Moselle" }]
  const r = resolveCartToolAction("removeFromCart", { tripTitle: "boat cruise" }, { catalog: [CATALOG], list })
  assert.equal(r.kind, "remove")
  assert.equal(r.changed, true)
  assert.equal(r.trip.id, "tcms_5")
  assert.match(r.message, /^Removed /)
})

test("removeFromCart — not in list → changed:false + 'nothing was removed'", () => {
  const list = [{ id: "tcms_5", title: "Boat Cruise on the Moselle" }]
  const r = resolveCartToolAction("removeFromCart", { tripTitle: "City Train" }, { catalog: [CATALOG], list })
  assert.equal(r.changed, false)
  assert.equal(r.trip, undefined)
  assert.ok(r.message.includes("nothing was removed"))
})

test("clearCart — non-empty → changed:true + true count (singular/plural)", () => {
  const one = resolveCartToolAction("clearCart", {}, { catalog: [CATALOG], list: [CATALOG[0]] })
  assert.equal(one.kind, "clear")
  assert.equal(one.changed, true)
  assert.equal(one.count, 1)
  assert.ok(one.message.includes("Cleared all 1 trip "))

  const many = resolveCartToolAction("clearCart", {}, { catalog: [CATALOG], list: CATALOG })
  assert.equal(many.count, 3)
  assert.ok(many.message.includes("Cleared all 3 trips "))
})

test("clearCart — already empty → changed:false + 'already empty'", () => {
  const r = resolveCartToolAction("clearCart", {}, { catalog: [CATALOG], list: [] })
  assert.equal(r.changed, false)
  assert.equal(r.count, 0)
  assert.ok(r.message.includes("already empty"))
})

test("resolveCartToolAction — removeFromCart prioritizes tripId over conflicting title", () => {
  const list = [
    { id: "tcms_5", title: "Boat Cruise on the Moselle" },
    { id: "tcms_7", title: "City Train" },
  ]
  const r = resolveCartToolAction("removeFromCart", { tripId: "tcms_7", tripTitle: "Boat Cruise on the Moselle" }, { catalog: [CATALOG], list })
  assert.equal(r.changed, true)
  assert.equal(r.trip.id, "tcms_7")
})

test("resolveCartToolAction — unknown tool returns null", () => {
  assert.equal(resolveCartToolAction("noop", {}, { catalog: [CATALOG], list: [] }), null)
})
