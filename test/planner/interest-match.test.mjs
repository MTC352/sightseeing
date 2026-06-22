import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/interest-match.js")
const { interestKeywords, matchTripInterest, scoreTripInterests } = mod.default ?? mod

const MUSEUM_TAGGED = {
  id: "tcms_1",
  title: "City Museum Pass",
  description: "Visit the national art gallery and history exhibits.",
  tags: ["museums"],
  duration: "2 hours",
}
// Museum trip that was NEVER tagged `museums` — only its text reveals the theme.
const MUSEUM_UNTAGGED = {
  id: "tcms_2",
  title: "Combi-ticket City Train & 7 Museums",
  description: "Step back in time and explore seven museums of the old town.",
  tags: ["hop-on-hop-off"],
  duration: "check timetable",
}
const WALKING = {
  id: "tcms_3",
  title: "Best Walking Tour in Luxembourg City",
  description: "Immerse yourself in the beauty of Luxembourg City on foot.",
  tags: ["walking-tours"],
  duration: "2.5 hours",
}
const EBIKE = {
  id: "tcms_4",
  title: "Discover Luxembourg with E-Bike Rentals",
  description: "Explore the vibrant Luxembourg City and discover the main sights by bike.",
  tags: [],
  duration: "Full Day: 7 Hours / Half Day: 4 Hours",
}

test("interestKeywords strips generic tourism noise but keeps the theme word", () => {
  assert.deepEqual(interestKeywords("walking-tours"), ["walking"])
  assert.deepEqual(interestKeywords("boat-tours"), ["boat"])
  assert.deepEqual(interestKeywords({ value: "food", label: "Food & Drink" }), ["food", "drink"])
})

test("interestKeywords — 'day-trips' yields no text keywords (tag-only by design)", () => {
  // Both words are noise (day = duration noise, trips = generic), so this theme
  // is intentionally matched by its exact tag only — never by 'day' in text.
  assert.deepEqual(interestKeywords("day-trips"), [])
})

test("matchTripInterest — exact canonical tag matches via tag", () => {
  const m = matchTripInterest(MUSEUM_TAGGED, "museums")
  assert.equal(m.matched, true)
  assert.equal(m.viaTag, true)
})

test("matchTripInterest — untagged museum trip still matches via title/description", () => {
  const m = matchTripInterest(MUSEUM_UNTAGGED, "museums")
  assert.equal(m.matched, true)
  assert.equal(m.viaTag, false)
  assert.equal(m.viaText, true)
})

test("matchTripInterest — e-bike trip (no tags) matches bike-tours via text", () => {
  const m = matchTripInterest(EBIKE, "bike-tours")
  assert.equal(m.matched, true)
  assert.equal(m.viaText, true)
})

test("scoreTripInterests — multi-interest is OR, never zero", () => {
  const interests = ["museums", "walking-tours"]
  // The untagged museum trip matches one of two interests → partial, not zero.
  const partial = scoreTripInterests(MUSEUM_UNTAGGED, interests)
  assert.equal(partial.hits, 1)
  assert.equal(partial.full, false)
  assert.ok(partial.score > 0)
})

test("scoreTripInterests — full match outranks partial match", () => {
  const interests = ["museums", "walking-tours"]
  const full = scoreTripInterests(
    { id: "x", title: "Old Town Walking Tour & Museum Visit", tags: ["walking-tours", "museums"] },
    interests,
  )
  const partial = scoreTripInterests(WALKING, interests)
  assert.equal(full.full, true)
  assert.equal(partial.full, false)
  assert.ok(full.score > partial.score, `full ${full.score} should beat partial ${partial.score}`)
})

test("scoreTripInterests — no interests requested → no hits, zero score", () => {
  const r = scoreTripInterests(WALKING, [])
  assert.equal(r.hits, 0)
  assert.equal(r.full, false)
  assert.equal(r.score, 0)
})

test("matchTripInterest — 'day-trips' does NOT text-match a generic 'Full Day' trip", () => {
  const fullDayCityTour = {
    id: "tcms_9",
    title: "City Highlights Sightseeing",
    description: "Enjoy a full day of sightseeing across the city.",
    tags: ["hop-on-hop-off"], // NOT tagged day-trips
    duration: "Full Day: 7 Hours",
  }
  const m = matchTripInterest(fullDayCityTour, "day-trips")
  assert.equal(m.matched, false, "'day' must not match 'Full Day' (noise word)")
})

test("matchTripInterest — word-level, not substring (no 'art' inside 'start')", () => {
  const trip = {
    id: "tcms_10",
    title: "Tour start point downtown",
    description: "We start the walk at the central square.",
    tags: [],
  }
  // 'museums' label keyword 'art' must not match the substring in 'start'.
  const m = matchTripInterest(trip, { value: "museums", label: "Art & Museums" })
  assert.equal(m.matched, false)
})

test("full match ranks above a higher-scoring partial (server/client sort parity)", () => {
  // 3 interests: a 2-tag partial (score 20) vs a 3-text full (score lower). The
  // explicit full-first comparator used by searchTrips + fallbackTrips must put
  // the FULL match first regardless of raw score.
  const interests = ["museums", "walking-tours", "food"]
  const partial = scoreTripInterests(
    { id: "p", title: "x", tags: ["museums", "walking-tours"] },
    interests,
  )
  const full = scoreTripInterests(
    {
      id: "f",
      title: "Old town walk with museum stop and food tasting",
      description: "A walking route past a museum, ending with a food tasting.",
      tags: [],
    },
    interests,
  )
  assert.equal(partial.full, false)
  assert.equal(full.full, true)
  const cmp = (a, b) => (b.full ? 1 : 0) - (a.full ? 1 : 0) || b.score - a.score
  const ordered = [partial, full].sort(cmp)
  assert.equal(ordered[0].full, true, "full match must sort first even if partial scores higher")
})
