import test from "node:test"
import assert from "node:assert/strict"

// Transpiled to .test-build/itinerary by the `pretest` step (see package.json).
const mod = await import("../../.test-build/itinerary/scheduler.js")
const { buildSchedule } = mod

/* ── Test fixtures ─────────────────────────────────────────────────────────
   buildSchedule depends only on injected helpers (computeLeg / cityTravelMin /
   addDays), so it's fully unit-testable with no network or DB. We model trips
   with REAL Palisis-style slot lists and assert which stops land on the plan. */

const NO_TRAVEL = async () => ({
  driveMin: 5,
  walkMin: null,
  cycleMin: null,
  transitMin: null,
  distanceKm: 0.5,
  reason: "ok",
  fromLabel: null,
  toLabel: null,
})
const ZERO_CITY_TRAVEL = () => 5
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function slot(startTime, endTime) {
  return {
    startTime,
    endTime: endTime ?? null,
    totalPrice: null,
    totalPriceDisplay: null,
    spacesRemaining: "UNLIMITED",
    componentKey: `${startTime}`,
  }
}

function candidate(over) {
  return {
    id: over.id,
    title: over.title,
    city: over.city ?? "Luxembourg City",
    category: over.category ?? "Tour",
    durationMin: over.durationMin,
    slots: over.slots,
    tags: over.tags ?? [],
    blurb: over.blurb ?? "",
    highlights: [],
    notes: "",
    location: over.location ?? "Luxembourg City",
    departureGeo: over.departureGeo ?? "49.6116,6.1319",
    endGeo: over.endGeo ?? "49.6116,6.1319",
  }
}

const baseConfig = {
  dayStartTime: "08:00",
  dayEndTime: "20:00",
  bufferTimeBetweenStops: 10,
  maxStopsPerDay: 5,
  defaultActivityDuration: 120,
  autoInsertMealBreaks: false, // keep meals out of these timing assertions
  mealBreakDuration: 60,
  lunchBreakTime: "13:00",
  dinnerBreakTime: "19:00",
  travelMethodLabel: "car",
  pace: "balanced",
}

function fullDayPrefs(over = {}) {
  return {
    duration: "full-day",
    dayCount: 1,
    isMultiDay: false,
    excludeEarlyMorning: false,
    excludeMeals: true,
    interests: [],
    userMealBreaks: new Map(),
    excludeInaccessible: false,
    partySize: 1,
    ...over,
  }
}

async function run(candidates, prefs = fullDayPrefs()) {
  return buildSchedule({
    candidates,
    config: baseConfig,
    prefs,
    visitDate: "2026-06-26",
    addDays,
    computeLeg: NO_TRAVEL,
    cityTravelMin: ZERO_CITY_TRAVEL,
    weather: null,
  })
}

test("REGRESSION: a fixed-time food tour + a flexible tour both fit on a full day", async () => {
  // The reported bug: a 3h Food Tour with a SINGLE 10:45 start, plus a flexible
  // 75-min City tour that runs hourly. Under plain earliest-finish ordering the
  // flexible City tour (finishes sooner) grabbed 10:45 and the Food tour — whose
  // only slot is 10:45 — was dropped. Both must now be scheduled.
  const food = candidate({
    id: "food",
    title: "3-Hour Food Tour",
    durationMin: 180,
    tags: ["food"],
    slots: [slot("10:45", "13:45")],
  })
  const city = candidate({
    id: "city",
    title: "City Highlights Instagram Tour by Minibus",
    durationMin: 75,
    slots: [
      slot("10:45", "12:00"),
      slot("12:45", "14:00"),
      slot("14:00", "15:15"),
      slot("15:30", "16:45"),
    ],
  })

  const { steps, dropped } = await run([city, food])
  const placed = steps.map((s) => s.tripId).sort()
  assert.deepEqual(placed, ["city", "food"], `expected both placed, got ${JSON.stringify(steps.map((s) => ({ id: s.tripId, t: s.time })))} dropped=${JSON.stringify(dropped)}`)

  // The food tour must keep its only slot; the flexible tour moves later.
  const foodStep = steps.find((s) => s.tripId === "food")
  const cityStep = steps.find((s) => s.tripId === "city")
  assert.equal(foodStep.time, "10:45")
  assert.ok(
    require_toMin(cityStep.time) >= require_toMin(foodStep.endTime),
    `city (${cityStep.time}) should start after food ends (${foodStep.endTime})`,
  )
})

test("INVARIANT: a single day-dominating long tour does NOT evict several short tours", async () => {
  // The earliest-finish ordering exists to stop one 8h tour from claiming the
  // whole day and evicting multiple short daytime trips. The new multi-ordering
  // engine only ADOPTS an alternative when it fits MORE stops, so this must still
  // keep the three short trips and drop the single long one.
  const longTour = candidate({
    id: "long",
    title: "Full-Day Nature & Castle Tour",
    durationMin: 8 * 60,
    slots: [slot("09:30", "17:30")],
  })
  const a = candidate({ id: "a", title: "Short A", durationMin: 60, slots: [slot("09:00", "10:00"), slot("11:00", "12:00")] })
  const b = candidate({ id: "b", title: "Short B", durationMin: 60, slots: [slot("12:30", "13:30"), slot("13:30", "14:30")] })
  const c = candidate({ id: "c", title: "Short C", durationMin: 60, slots: [slot("15:00", "16:00"), slot("16:00", "17:00")] })

  const { steps } = await run([longTour, a, b, c])
  const placed = steps.map((s) => s.tripId).sort()
  assert.equal(steps.length, 3, `expected 3 short stops, got ${JSON.stringify(placed)}`)
  assert.ok(!placed.includes("long"), "the long day-dominating tour should be dropped, not the shorts")
})

test("two genuinely conflicting single-slot trips can only place one", async () => {
  // Both run ONLY at 10:45 — no full-day arrangement fits both, so exactly one
  // is placed and the other dropped with a fit reason (correct, unavoidable).
  const x = candidate({ id: "x", title: "X", durationMin: 120, slots: [slot("10:45", "12:45")] })
  const y = candidate({ id: "y", title: "Y", durationMin: 120, slots: [slot("10:45", "12:45")] })
  const { steps, dropped } = await run([x, y])
  assert.equal(steps.length, 1)
  assert.equal(dropped.length, 1)
})

// Mirror of the scheduler's HH:MM→minutes parse for assertions.
function require_toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1
}
