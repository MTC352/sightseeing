import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/google-reviews-normalize.js")
const normalizePlaceDetails = mod.normalizePlaceDetails ?? mod.default?.normalizePlaceDetails

const RAW = {
  name: "Sightseeing Luxembourg",
  rating: 4.7,
  user_ratings_total: 128,
  reviews: [
    { author_name: "Ana", profile_photo_url: "http://x/a.png", rating: 5, relative_time_description: "a week ago", text: "Great!", author_url: "http://g/ana" },
    { author_name: "Ben", rating: 4, relative_time_description: "a month ago", text: "Good" },
  ],
}

test("maps place details into the normalized shape", () => {
  const out = normalizePlaceDetails(RAW)
  assert.equal(out.name, "Sightseeing Luxembourg")
  assert.equal(out.rating, 4.7)
  assert.equal(out.totalReviews, 128)
  assert.equal(out.reviews.length, 2)
  assert.deepEqual(out.reviews[0], {
    author: "Ana", avatar: "http://x/a.png", rating: 5,
    date: "a week ago", text: "Great!", url: "http://g/ana",
  })
  // Optional fields absent → undefined, not empty string
  assert.equal(out.reviews[1].avatar, undefined)
  assert.equal(out.reviews[1].url, undefined)
})

test("caps the number of returned reviews at max (default 6)", () => {
  const many = { ...RAW, reviews: Array.from({ length: 10 }, (_, i) => ({ author_name: `U${i}`, rating: 5, relative_time_description: "now", text: "t" })) }
  assert.equal(normalizePlaceDetails(many).reviews.length, 6)
  assert.equal(normalizePlaceDetails(many, 3).reviews.length, 3)
})

test("handles missing rating/total/reviews without throwing", () => {
  const out = normalizePlaceDetails({ name: "X" })
  assert.equal(out.rating, undefined)
  assert.equal(out.totalReviews, undefined)
  assert.deepEqual(out.reviews, [])
})

test("falls back gracefully on malformed review entries", () => {
  const out = normalizePlaceDetails({ reviews: [{}] })
  assert.equal(out.reviews[0].author, "Google user")
  assert.equal(out.reviews[0].rating, 0)
  assert.equal(out.reviews[0].text, "")
  assert.equal(out.reviews[0].date, "")
})
