import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/drop-narration.js")
const { classifyDropReason, buildPartialBuildMessage } = mod

// Exact scheduler sentences (lib/itinerary/scheduler.ts 730-744).
const PARTY = "Not enough seats left for your group of 4 on this date — try a smaller group or another date."
const STOPCAP = "Kept to 3 stops for a relaxed pace — extend your trip length to include it."
const SLOTCONFLICT = 'Only available at 09:00 — the same time as "City Walk". Only one can run at that time.'
const FULLDAY = "Couldn't fit alongside your other stops that day — it's bookable on its own, so give it a separate date or drop a stop to make room."
const TIMEWINDOW = "Doesn't fit your half-day time window — choose a longer day or another date."

test("classifyDropReason: machine codes", () => {
  assert.equal(classifyDropReason("NO_SLOTS"), "unavailable")
  assert.equal(classifyDropReason("NO_PALISIS_LINK"), "unavailable")
  assert.equal(classifyDropReason("TOURCMS_ERROR"), "unconfirmed")
  assert.equal(classifyDropReason("DOES_NOT_FIT_DURATION"), "duration")
})

test("classifyDropReason: human-readable scheduler sentences", () => {
  assert.equal(classifyDropReason(PARTY), "capacity")
  assert.equal(classifyDropReason(STOPCAP), "stopcap")
  assert.equal(classifyDropReason(SLOTCONFLICT), "fit")
  assert.equal(classifyDropReason(FULLDAY), "fit")
  assert.equal(classifyDropReason(TIMEWINDOW), "duration")
})

test("THE BUG: a 'couldn't fit' trip is NEVER described as having no availability", () => {
  const msg = buildPartialBuildMessage({
    dropped: [{ title: "BBQ Dinner Hopping", reason: FULLDAY }],
    dateLabel: "Saturday, June 27",
    stops: 2,
  })
  assert.match(msg, /couldn't fit alongside/i)
  assert.match(msg, /bookable on \*\*Saturday, June 27\*\*/i)
  // Must NOT claim no availability / no slots / doesn't run for a fit drop.
  assert.doesNotMatch(msg, /no slots/i)
  assert.doesNotMatch(msg, /doesn't run/i)
  assert.doesNotMatch(msg, /not available/i)
})

test("genuinely unavailable trips read 'doesn't run on <date>' and can show alt dates", () => {
  const msg = buildPartialBuildMessage({
    dropped: [{ title: "Wine Tasting", reason: "NO_SLOTS", suggestedDates: ["2026-06-28"] }],
    dateLabel: "Saturday, June 27",
    stops: 1,
    alternativeDates: [{ date: "2026-06-28", tripCount: 2 }],
    formatDate: (d) => `pretty(${d})`,
  })
  assert.match(msg, /doesn't run on \*\*Saturday, June 27\*\*/i)
  assert.match(msg, /Best alternative dates/i)
  assert.match(msg, /pretty\(2026-06-28\)/)
})

test("fit-only drops do NOT show alternative dates (trip IS bookable that day)", () => {
  const msg = buildPartialBuildMessage({
    dropped: [{ title: "Castle Tour", reason: FULLDAY }],
    dateLabel: "Saturday, June 27",
    stops: 3,
    alternativeDates: [{ date: "2026-06-28", tripCount: 2 }],
  })
  assert.doesNotMatch(msg, /Best alternative dates/i)
})

test("mixed buckets each get their own honest line", () => {
  const msg = buildPartialBuildMessage({
    dropped: [
      { title: "No-Run Tour", reason: "NO_SLOTS" },
      { title: "Big Group Tour", reason: PARTY },
      { title: "Overflow Tour", reason: FULLDAY },
      { title: "Capped Tour", reason: STOPCAP },
    ],
    dateLabel: "Saturday, June 27",
    stops: 2,
  })
  assert.match(msg, /No-Run Tour.*doesn't run/i)
  assert.match(msg, /Big Group Tour.*enough seats/i)
  assert.match(msg, /Overflow Tour.*couldn't fit alongside/i)
  assert.match(msg, /Capped Tour.*comfortable number of stops/i)
})

test("empty dropped list returns empty string", () => {
  assert.equal(buildPartialBuildMessage({ dropped: [], dateLabel: "x", stops: 3 }), "")
})
