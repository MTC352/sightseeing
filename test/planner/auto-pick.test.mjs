import test from "node:test"
import assert from "node:assert/strict"

// Transpiled by the `pretest` step (see package.json) to .test-build/auto-pick.js.
const mod = await import("../../.test-build/auto-pick.js")
const autoPickTrips = mod.autoPickTrips ?? mod.default?.autoPickTrips

// ── helpers ─────────────────────────────────────────────────────────────────
const HM = (h, m = 0) => h * 60 + m
const slot = (startH, endH, spaces = null) => ({
  startMin: HM(startH),
  endMin: HM(endH),
  spacesRemaining: spaces,
})
const cand = (id, slots, extra = {}) => ({
  id,
  title: extra.title ?? id,
  city: extra.city ?? "Luxembourg",
  score: extra.score ?? 0,
  slots,
  ...(extra.preselected ? { preselected: true } : {}),
  ...(extra.keep ? { keep: true } : {}),
})
const baseConfig = (over = {}) => ({
  partySize: 1,
  dayStartMin: HM(9),
  dayEndMin: HM(21),
  bufferMin: 30,
  maxStops: 5,
  ...over,
})

// ── mode 'one' ────────────────────────────────────────────────────────────────

test("mode one — empty list picks the single best-scoring available trip", () => {
  const r = autoPickTrips({
    mode: "one",
    config: baseConfig(),
    candidates: [
      cand("a", [slot(9, 11)], { score: 1 }),
      cand("b", [slot(12, 14)], { score: 5 }),
      cand("c", [slot(15, 17)], { score: 3 }),
    ],
  })
  assert.deepEqual(r.addedIds, ["b"])
  assert.deepEqual(r.pickedIds, ["b"])
  assert.equal(r.needsClear, false)
})

test("mode one — picks the best trip that does NOT conflict with a preselected trip", () => {
  const r = autoPickTrips({
    mode: "one",
    config: baseConfig(),
    candidates: [
      // preselected occupies 9–13 (+buffer)
      cand("pre", [slot(9, 13)], { preselected: true }),
      // best score but conflicts with pre
      cand("hi", [slot(11, 12)], { score: 9 }),
      // lower score but free in the afternoon
      cand("lo", [slot(15, 17)], { score: 2 }),
    ],
  })
  assert.deepEqual(r.addedIds, ["lo"])
  assert.ok(r.pickedIds.includes("pre"))
  assert.ok(r.pickedIds.includes("lo"))
  assert.equal(r.needsClear, false)
})

test("mode one — only conflicting candidate against a full list ⇒ needsClear", () => {
  const r = autoPickTrips({
    mode: "one",
    config: baseConfig(),
    candidates: [
      cand("pre", [slot(9, 20)], { preselected: true }), // fills almost the whole day
      cand("x", [slot(10, 12)], { score: 9 }), // bookable on its own, but conflicts
    ],
  })
  assert.deepEqual(r.addedIds, [])
  assert.equal(r.needsClear, true)
})

test("mode one — empty list, no bookable candidate ⇒ NOT needsClear (nothing to clear)", () => {
  const r = autoPickTrips({
    mode: "one",
    config: baseConfig({ partySize: 4 }),
    candidates: [
      cand("x", [slot(10, 12, 1)], { score: 9 }), // only 1 seat, party of 4
    ],
  })
  assert.deepEqual(r.addedIds, [])
  assert.equal(r.needsClear, false)
  assert.equal(r.skipped.length, 1)
  assert.match(r.skipped[0].reason, /not bookable/i)
})

// ── mode 'day' ────────────────────────────────────────────────────────────────

test("mode day — fills the day with multiple non-conflicting trips", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 15 }),
    candidates: [
      cand("m", [slot(9, 10, 30)], { score: 5 }),
      cand("n", [slot(11, 12, 30)], { score: 4 }),
      cand("o", [slot(13, 14, 30)], { score: 3 }),
    ],
  })
  assert.equal(r.addedIds.length, 3)
  // scheduled in start-time order
  assert.deepEqual(r.pickedIds, ["m", "n", "o"])
  assert.equal(r.needsClear, false)
})

test("mode day — never schedules two overlapping trips", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 0 }),
    candidates: [
      cand("a", [slot(9, 12)], { score: 5 }),
      cand("b", [slot(10, 13)], { score: 4 }), // overlaps a
      cand("c", [slot(13, 15)], { score: 3 }), // free after a
    ],
  })
  assert.ok(r.pickedIds.includes("a"))
  assert.ok(r.pickedIds.includes("c"))
  assert.ok(!r.pickedIds.includes("b"))
})

test("mode day — respects maxStops cap", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 0, maxStops: 2 }),
    candidates: [
      cand("a", [slot(9, 10)], { score: 5 }),
      cand("b", [slot(11, 12)], { score: 4 }),
      cand("c", [slot(13, 14)], { score: 3 }),
    ],
  })
  assert.equal(r.pickedIds.length, 2)
  assert.deepEqual(r.pickedIds, ["a", "b"])
})

test("mode day — keeps preselected trips locked and picks around them", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 0 }),
    candidates: [
      cand("pre", [slot(12, 14)], { preselected: true }),
      cand("morning", [slot(9, 11)], { score: 5 }),
      cand("evening", [slot(15, 17)], { score: 4 }),
      cand("clash", [slot(13, 15)], { score: 9 }), // conflicts with pre
    ],
  })
  assert.ok(r.pickedIds.includes("pre"))
  assert.ok(r.addedIds.includes("morning"))
  assert.ok(r.addedIds.includes("evening"))
  assert.ok(!r.pickedIds.includes("clash"))
})

// ── keep ──────────────────────────────────────────────────────────────────────

test("keep — locks the kept trip first and picks around it", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 0 }),
    candidates: [
      cand("wine", [slot(14, 16)], { keep: true, score: 0 }),
      cand("x", [slot(9, 11)], { score: 5 }),
      cand("y", [slot(15, 16)], { score: 9 }), // conflicts with the kept wine
    ],
  })
  assert.ok(r.pickedIds.includes("wine"))
  assert.ok(r.pickedIds.includes("x"))
  assert.ok(!r.pickedIds.includes("y"))
})

test("keep — kept trip with no bookable slot is reported, others still picked", () => {
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ partySize: 6 }),
    candidates: [
      cand("wine", [slot(14, 16, 2)], { keep: true }), // only 2 seats, party of 6
      cand("x", [slot(9, 11)], { score: 5 }), // unlimited seats
    ],
  })
  assert.ok(!r.pickedIds.includes("wine"))
  assert.ok(r.pickedIds.includes("x"))
  const skip = r.skipped.find((s) => s.id === "wine")
  assert.ok(skip)
  assert.match(skip.reason, /couldn't keep/i)
})

// ── replaceList ────────────────────────────────────────────────────────────────

test("replaceList — ignores old preselected trips and reports them as removed", () => {
  const r = autoPickTrips({
    mode: "day",
    replaceList: true,
    config: baseConfig({ bufferMin: 0 }),
    candidates: [
      cand("old", [slot(9, 20)], { preselected: true }), // would have blocked everything
      cand("a", [slot(9, 11)], { score: 5 }),
      cand("b", [slot(12, 14)], { score: 4 }),
    ],
  })
  // old is dropped; fresh non-conflicting set picked
  assert.ok(!r.pickedIds.includes("old"))
  assert.deepEqual(r.removedIds, ["old"])
  assert.ok(r.addedIds.includes("a"))
  assert.ok(r.addedIds.includes("b"))
  assert.equal(r.needsClear, false)
})

test("replaceList — honors keep even while clearing the rest", () => {
  const r = autoPickTrips({
    mode: "day",
    replaceList: true,
    config: baseConfig({ bufferMin: 0 }),
    candidates: [
      cand("old", [slot(9, 11)], { preselected: true }),
      cand("wine", [slot(14, 16)], { preselected: true, keep: true }),
      cand("a", [slot(9, 11)], { score: 5 }),
    ],
  })
  assert.ok(r.pickedIds.includes("wine")) // kept
  assert.ok(!r.removedIds.includes("wine"))
  assert.ok(r.removedIds.includes("old"))
})

// ── travel separation ──────────────────────────────────────────────────────────

test("travelMinBetween — cross-city travel widens the required gap", () => {
  const travel = (a, b) => (a.city === b.city ? 0 : 120)
  const r = autoPickTrips({
    mode: "day",
    config: baseConfig({ bufferMin: 0, travelMinBetween: travel }),
    candidates: [
      cand("city1", [slot(9, 11)], { score: 5, city: "Luxembourg" }),
      // starts only 30 min after city1 ends, but it's 2h travel away ⇒ conflict
      cand("far", [slot(11, 13)], { score: 4, city: "Vianden" }),
      // far enough away in time to clear the 2h travel gap
      cand("far2", [slot(14, 16)], { score: 3, city: "Vianden" }),
    ],
  })
  assert.ok(r.pickedIds.includes("city1"))
  assert.ok(!r.pickedIds.includes("far"))
  assert.ok(r.pickedIds.includes("far2"))
})
