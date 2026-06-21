import test from "node:test"
import assert from "node:assert/strict"

// Compiled by the `pretest` step (see package.json) → .test-build CJS.
const mod = await import("../../.test-build/search-card.js")
const toSearchCard = mod.toSearchCard ?? mod.default?.toSearchCard
const HEAVY = mod.HEAVY_FIELDS_EXCLUDED_FROM_SEARCH ?? mod.default?.HEAVY_FIELDS_EXCLUDED_FROM_SEARCH

// A realistic RichTrip carrying the full Palisis payload, like loadTripCatalog()
// produces. The long prose fields below are what used to be replayed into the
// chat history for EVERY trip on a "skip all" (whole-catalog) search and blew
// the OpenAI per-minute token limit → "I couldn't reach the AI assistant".
function richTrip(i = 0) {
  return {
    id: `tcms_${i}`,
    title: `City Highlights Tour ${i}`,
    image: `https://img/${i}.jpg`,
    price: 25,
    originalPrice: 42,
    rating: 4.8,
    reviewCount: 1200,
    duration: "75 minutes",
    category: "Tours",
    tags: ["sightseeing", "city"],
    badge: "Mega Deal",
    city: "Luxembourg",
    description: "A scenic minibus loop around the capital.",
    highlights: ["a", "b", "c", "d", "e", "f", "g", "h"],
    tripTags: ["day-trips", "sightseeing"],
    languages: ["en", "fr", "de"],
    tourType: "Bus",
    departureLocation: "Place Guillaume",
    endLocation: "Place Guillaume",
    country: "LU",
    minBookingSize: 1,
    maxBookingSize: 50,
    nonRefundable: false,
    nextBookableDate: "2026-06-21",
    lastBookableDate: "2026-12-31",
    // ── heavy fields that must NOT survive into the card ──
    longDescription: "x".repeat(2000),
    experienceHighlights: "y".repeat(800),
    itinerary: { stops: Array.from({ length: 20 }, (_, k) => ({ k, text: "z".repeat(100) })) },
    essentialInformation: "w".repeat(1500),
    hotelPickupInstructions: "pickup ".repeat(100),
    voucherRedemptionInstructions: "voucher ".repeat(100),
    restrictions: "r".repeat(600),
    extras: { addons: Array.from({ length: 10 }, (_, k) => ({ k, name: "extra" })) },
    cancellationPolicy: "c".repeat(600),
    included: Array.from({ length: 12 }, (_, k) => `included item ${k}`),
    excluded: Array.from({ length: 12 }, (_, k) => `excluded item ${k}`),
    grade: "easy",
    tourLeader: "guide",
    accommodationRating: "n/a",
  }
}

test("skip-all card — drops every heavy prose/JSON field (TPM token-bomb guard)", () => {
  const card = toSearchCard(richTrip(1))
  for (const field of HEAVY) {
    assert.ok(
      !(field in card),
      `heavy field "${field}" must NOT appear in the compact search card`,
    )
  }
})

test("skip-all card — keeps the fields the client canvas + light AI Q&A need", () => {
  const card = toSearchCard(richTrip(2))
  // Card-rendering fields consumed by app/planner/page.tsx aiTrips memo:
  for (const field of [
    "id", "title", "image", "price", "originalPrice", "rating",
    "reviewCount", "duration", "category", "tags", "badge", "city",
    "description", "highlights",
  ]) {
    assert.ok(field in card, `card-render field "${field}" must be present`)
  }
  // Small, low-token AI-useful fields:
  for (const field of [
    "tripTags", "languages", "tourType", "departureLocation", "country",
    "nextBookableDate", "lastBookableDate", "minBookingSize",
    "maxBookingSize", "nonRefundable",
  ]) {
    assert.ok(field in card, `AI-useful field "${field}" must be present`)
  }
  assert.equal(card.id, "tcms_2")
  assert.equal(card.title, "City Highlights Tour 2")
})

test("skip-all card — bounds description length and highlight count", () => {
  const card = toSearchCard({
    id: "tcms_3",
    title: "Long one",
    description: "d".repeat(5000),
    highlights: Array.from({ length: 30 }, (_, k) => `h${k}`),
  })
  assert.ok(card.description.length <= 301, "description must be truncated (~300 + ellipsis)")
  assert.ok(card.description.endsWith("…"), "truncated description ends with an ellipsis")
  assert.ok(card.highlights.length <= 6, "highlights capped at 6")
})

test("skip-all card — whole-catalog payload stays small (regression budget)", () => {
  // 18 trips with full Palisis payloads, the exact 'skip all' shape.
  const catalog = Array.from({ length: 18 }, (_, i) => richTrip(i))
  const cards = catalog.map(toSearchCard)
  const bytes = Buffer.byteLength(JSON.stringify({ trips: cards }), "utf8")
  // Each full RichTrip is ~6KB+ of prose; 18 of them = ~110KB+ (the bomb).
  // Compact cards must stay an order of magnitude smaller.
  assert.ok(
    bytes < 12_000,
    `compact whole-catalog payload should be well under 12KB, got ${bytes} bytes`,
  )
})

test("skip-all card — null fields are dropped from the payload, not serialized as null", () => {
  const card = toSearchCard({ id: "tcms_4", title: "T", badge: null, city: null, originalPrice: null })
  const serialized = JSON.parse(JSON.stringify(card))
  assert.ok(!("badge" in serialized), "null badge not serialized")
  assert.ok(!("city" in serialized), "null city not serialized")
  assert.ok(!("originalPrice" in serialized), "null originalPrice not serialized")
  assert.equal(serialized.id, "tcms_4")
})
