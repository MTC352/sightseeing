import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/search-keyword-match.js")
const { keywordsFromQuery, tripMatchesKeywords, tripSearchHaystack, isVisibleTripTag } = mod.default ?? mod

// A trip whose theme lives ONLY in its admin-managed `tripTags` — not in the
// title/description and not in the legacy `tags` column. This is exactly the
// reported bug: admin adds "audio-guide" via /admin/trips/[id] → Trip Tags,
// but the search box never looked at `tripTags`.
const AUDIO_GUIDE_TRIP = {
  id: "tcms_50",
  title: "City Highlights Walking Tour",
  description: "See the best of the old town on foot with a knowledgeable local guide.",
  tags: [],
  tripTags: ["audio-guide"],
}

const NO_AUDIO_TRIP = {
  id: "tcms_51",
  title: "Kayak Tour on the Alzette",
  description: "Paddle through Luxembourg's scenic river valley.",
  tags: [],
  tripTags: ["outdoor"],
}

// Palisis-imported internal flag — never meaningful to a searcher, so it must
// not surface a trip just because the query happens to contain "operator".
const INTERNAL_FLAG_TRIP = {
  id: "tcms_52",
  title: "Museum Pass",
  description: "Entry to seven museums.",
  tags: [],
  tripTags: ["operator-direct-product"],
}

test("keywordsFromQuery — normalizes case, accents, and punctuation", () => {
  assert.deepEqual(keywordsFromQuery("Audio Guide"), ["audio", "guide"])
  assert.deepEqual(keywordsFromQuery("café"), ["cafe"])
  assert.deepEqual(keywordsFromQuery("  "), [])
})

test("tripMatchesKeywords — matches a trip tagged only via tripTags (the reported bug)", () => {
  assert.equal(tripMatchesKeywords(AUDIO_GUIDE_TRIP, keywordsFromQuery("audio")), true)
  assert.equal(tripMatchesKeywords(AUDIO_GUIDE_TRIP, keywordsFromQuery("audio guide")), true)
})

test("tripMatchesKeywords — does not match trips without the tag or matching text", () => {
  assert.equal(tripMatchesKeywords(NO_AUDIO_TRIP, keywordsFromQuery("audio")), false)
})

test("tripMatchesKeywords — legacy `tags` column still matches (no regression)", () => {
  const legacyTagged = { id: "x", title: "Old Town Tour", tags: ["audio-guide"], tripTags: [] }
  assert.equal(tripMatchesKeywords(legacyTagged, keywordsFromQuery("audio")), true)
})

test("tripMatchesKeywords — empty query matches everything", () => {
  assert.equal(tripMatchesKeywords(NO_AUDIO_TRIP, []), true)
})

test("isVisibleTripTag / tripSearchHaystack — hidden internal tags are excluded from search", () => {
  assert.equal(isVisibleTripTag("operator-direct-product"), false)
  assert.equal(tripMatchesKeywords(INTERNAL_FLAG_TRIP, keywordsFromQuery("operator")), false)
  assert.ok(!tripSearchHaystack(INTERNAL_FLAG_TRIP).includes("operator"))
})

test("tripMatchesKeywords — all keywords must match (AND), across title + tag", () => {
  // "audio" only lives in the tag, "walking" only in the title — both must hit.
  assert.equal(tripMatchesKeywords(AUDIO_GUIDE_TRIP, keywordsFromQuery("audio walking")), true)
  assert.equal(tripMatchesKeywords(AUDIO_GUIDE_TRIP, keywordsFromQuery("audio kayak")), false)
})
