import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/available-interests.js")
const { computeAvailableInterests, buildAvailableInterestsLine } = mod.default ?? mod

const VOCAB = [
  { value: "museums", label: "Museums" },
  { value: "boat-tours", label: "Boat Tours" },
  { value: "walking-tours", label: "Walking Tours" },
  { value: "nightlife", label: "Nightlife" }, // not offered in catalog below
]

const CATALOG = [
  { id: "tcms_1", title: "City Museum Pass", tags: ["museums"], tripTags: ["history"] },
  { id: "tcms_2", title: "Moselle Boat Cruise", tags: ["boat-tours"] },
  { id: "tcms_3", title: "Old Town Walk", tags: ["walking-tours"] },
  { id: "tcms_4", title: "Combi Museum + Train", tags: [], tripTags: ["museums"] },
]

test("computeAvailableInterests — bookable theme lands in available", () => {
  const r = computeAvailableInterests({
    vocab: VOCAB,
    catalog: CATALOG,
    tripStatus: (id) => (id === "tcms_2" ? "available" : "unavailable"),
  })
  assert.deepEqual(r.available.map((e) => e.value), ["boat-tours"])
})

test("computeAvailableInterests — theme with all trips confidently off goes to unavailableOnDate", () => {
  const r = computeAvailableInterests({
    vocab: VOCAB,
    catalog: CATALOG,
    tripStatus: () => "unavailable",
  })
  // museums (tcms_1 + tcms_4), boat-tours, walking-tours all unavailable
  assert.deepEqual(r.available, [])
  assert.deepEqual(r.unavailableOnDate.map((e) => e.value).sort(), [
    "boat-tours",
    "museums",
    "walking-tours",
  ])
})

test("computeAvailableInterests — one available trip wins even if a sibling trip is off", () => {
  // museums has tcms_1 (off) + tcms_4 (available) → should be AVAILABLE
  const r = computeAvailableInterests({
    vocab: VOCAB,
    catalog: CATALOG,
    tripStatus: (id) => (id === "tcms_4" ? "available" : "unavailable"),
  })
  assert.ok(r.available.some((e) => e.value === "museums"))
  assert.ok(!r.unavailableOnDate.some((e) => e.value === "museums"))
})

test("computeAvailableInterests — unknown-only theme is omitted from BOTH lists (no false negative)", () => {
  // boat-tours' only trip is unknown (not scanned / incident) → omit, don't claim empty
  const r = computeAvailableInterests({
    vocab: [{ value: "boat-tours", label: "Boat Tours" }],
    catalog: CATALOG,
    tripStatus: () => "unknown",
  })
  assert.deepEqual(r.available, [])
  assert.deepEqual(r.unavailableOnDate, [])
})

test("computeAvailableInterests — theme with no catalog trip is omitted entirely", () => {
  const r = computeAvailableInterests({
    vocab: VOCAB,
    catalog: CATALOG,
    tripStatus: () => "available",
  })
  assert.ok(!r.available.some((e) => e.value === "nightlife"))
  assert.ok(!r.unavailableOnDate.some((e) => e.value === "nightlife"))
})

test("computeAvailableInterests — duplicate vocab values are de-duped", () => {
  const r = computeAvailableInterests({
    vocab: [
      { value: "museums", label: "Museums" },
      { value: "museums", label: "Museums (dup)" },
    ],
    catalog: CATALOG,
    tripStatus: () => "available",
  })
  assert.equal(r.available.length, 1)
})

test("computeAvailableInterests — skips malformed vocab entries", () => {
  const r = computeAvailableInterests({
    vocab: [null, { label: "no value" }, { value: "", label: "empty" }, { value: "museums", label: "Museums" }],
    catalog: CATALOG,
    tripStatus: () => "available",
  })
  assert.deepEqual(r.available.map((e) => e.value), ["museums"])
})

test("buildAvailableInterestsLine — returns empty string when nothing to say", () => {
  assert.equal(
    buildAvailableInterestsLine({ result: { available: [], unavailableOnDate: [] }, visitDatePretty: "Mon, 22 Jun 2026" }),
    "",
  )
})

test("buildAvailableInterestsLine — renders AVAILABLE block with value(Label) pairs", () => {
  const line = buildAvailableInterestsLine({
    result: { available: [{ value: "boat-tours", label: "Boat Tours" }], unavailableOnDate: [] },
    visitDatePretty: "Mon, 22 Jun 2026",
  })
  assert.match(line, /AVAILABLE INTERESTS ON Mon, 22 Jun 2026/)
  assert.match(line, /boat-tours \(Boat Tours\)/)
  assert.ok(!/NOT BOOKABLE/.test(line))
})

test("buildAvailableInterestsLine — renders NOT BOOKABLE block and warns against re-suggesting", () => {
  const line = buildAvailableInterestsLine({
    result: {
      available: [{ value: "boat-tours", label: "Boat Tours" }],
      unavailableOnDate: [{ value: "museums", label: "Museums" }],
    },
    visitDatePretty: "Mon, 22 Jun 2026",
  })
  assert.match(line, /NOT BOOKABLE ON Mon, 22 Jun 2026/)
  assert.match(line, /museums \(Museums\)/)
  assert.match(line, /NEVER suggest/)
})
