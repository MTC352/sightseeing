import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/available-interests.js")
const { buildInterestAvailabilityBreakdown } = mod.default ?? mod

// Returned-search set spanning three themes: food, city, wine.
const RETURNED = [
  { id: "food_1", title: "3-hour Food Tour", tags: ["food"] },
  { id: "food_2", title: "Street Food Crawl", tags: ["food"] },
  { id: "city_1", title: "City Highlights by Minibus", tags: ["city"] },
  { id: "wine_1", title: "Wine Tasting Experience", tags: ["wine"] },
]

const THEMES = [{ value: "food" }, { value: "city" }, { value: "wine" }]

const get = (entries, interest) => entries.find((e) => e.interest === interest)

test("multi-theme: food empty, city+wine available — food flagged noneAvailableOnVisitDate", () => {
  const entries = buildInterestAvailabilityBreakdown({
    themes: THEMES,
    returnedTrips: RETURNED,
    statusOf: (id) => {
      if (id.startsWith("food")) return "alternative" // not bookable on the date
      return "available"
    },
    datesOf: (id) => (id === "food_1" ? ["Sat 27 Jun"] : []),
  })

  const food = get(entries, "food")
  const city = get(entries, "city")
  const wine = get(entries, "wine")

  assert.ok(food && city && wine)
  // Food is the confident-empty theme even though city/wine are available.
  assert.equal(food.noneAvailableOnVisitDate, true)
  assert.equal(food.availableCount, 0)
  assert.equal(food.matchedCount, 2)
  assert.deepEqual(food.notBookable, [
    { title: "3-hour Food Tour", dates: ["Sat 27 Jun"] },
    { title: "Street Food Crawl", dates: [] },
  ])
  // City + wine are bookable; never flagged empty.
  assert.equal(city.noneAvailableOnVisitDate, false)
  assert.equal(city.availableCount, 1)
  assert.equal(wine.noneAvailableOnVisitDate, false)
  assert.equal(wine.availableCount, 1)
})

test("unconfirmed-only theme is NOT flagged as empty (incident, not closure)", () => {
  const entries = buildInterestAvailabilityBreakdown({
    themes: [{ value: "food" }],
    returnedTrips: RETURNED,
    statusOf: () => "unconfirmed",
    datesOf: () => [],
  })
  const food = get(entries, "food")
  assert.ok(food)
  assert.equal(food.noneAvailableOnVisitDate, false)
  assert.equal(food.unconfirmedCount, 2)
  assert.equal(food.availableCount, 0)
})

test("themes with no matched trip in the returned set are omitted", () => {
  const entries = buildInterestAvailabilityBreakdown({
    themes: [{ value: "food" }, { value: "skydiving" }],
    returnedTrips: RETURNED,
    statusOf: () => "available",
    datesOf: () => [],
  })
  assert.deepEqual(entries.map((e) => e.interest), ["food"])
})

test("notBookable is capped by maxNotBookablePerTheme", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    id: `food_${i}`,
    title: `Food ${i}`,
    tags: ["food"],
  }))
  const entries = buildInterestAvailabilityBreakdown({
    themes: [{ value: "food" }],
    returnedTrips: many,
    statusOf: () => "none",
    datesOf: () => [],
    maxNotBookablePerTheme: 2,
  })
  const food = get(entries, "food")
  assert.equal(food.matchedCount, 6)
  assert.equal(food.notBookable.length, 2)
  assert.equal(food.noneAvailableOnVisitDate, true)
})

test("label is carried through when provided, omitted otherwise", () => {
  const entries = buildInterestAvailabilityBreakdown({
    themes: [{ value: "food", label: "Food & Drink" }, { value: "wine" }],
    returnedTrips: RETURNED,
    statusOf: () => "available",
    datesOf: () => [],
  })
  assert.equal(get(entries, "food").label, "Food & Drink")
  assert.equal("label" in get(entries, "wine"), false)
})

test("duplicate themes (case-insensitive) are deduped", () => {
  const entries = buildInterestAvailabilityBreakdown({
    themes: [{ value: "Food" }, { value: "food" }],
    returnedTrips: RETURNED,
    statusOf: () => "available",
    datesOf: () => [],
  })
  assert.equal(entries.length, 1)
})
