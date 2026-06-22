import test from "node:test"
import assert from "node:assert/strict"

// The pure planner modules are transpiled to .test-build by the `pretest`
// step (see package.json). Node 20 cannot run .ts directly, so we import the
// compiled CJS output. Use dynamic import + interop-safe lookup so the test is
// robust to default/named CJS interop differences.
const mod = await import("../../.test-build/system-prompt.js")
const buildCanvasCountLine = mod.buildCanvasCountLine ?? mod.default?.buildCanvasCountLine
const buildPlannerSystemPromptParts =
  mod.buildPlannerSystemPromptParts ?? mod.default?.buildPlannerSystemPromptParts

function promptText(overrides = {}) {
  return buildPlannerSystemPromptParts({
    publishedCatalogSize: 18,
    dateContext: "Monday",
    visitDateContext: "today",
    interestVocab: "day-trips, museums, bike-tours",
    ...overrides,
  }).join("\n")
}

test("canvas count line — count>0 & date-matched injects AVAILABILITY GROUND TRUTH that forbids 'nothing available'", () => {
  const line = buildCanvasCountLine({
    canvasCount: 10,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.match(line, /AVAILABILITY GROUND TRUTH/)
  assert.match(line, /EXACTLY 10 trips/)
  assert.match(line, /MUST NOT tell the visitor that no trips/)
  assert.match(line, /MUST NOT suggest switching to another date/)
  // the date appears so the directive is scoped
  assert.match(line, /2026-06-21/)
})

test("canvas count line — count===0 & date-matched is DIRECTIVE: forbids claiming the canvas shows trips for that date", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.match(line, /AVAILABILITY GROUND TRUTH/)
  assert.match(line, /shows 0 trips bookable/)
  // the whole point of the fix: model must NOT announce the canvas shows trips
  assert.match(line, /MUST NOT say or imply the Trip Canvas shows/)
  assert.match(line, /none of their matching trips are bookable on 2026-06-21/)
  // and it must push the model to recommend rather than only ask questions
  assert.match(line, /RECOMMENDER, NOT A QUESTIONER/)
  // must NOT carry the count>0 prohibition (that one is for when trips DO exist)
  assert.doesNotMatch(line, /MUST NOT tell the visitor that no trips/)
})

test("canvas count line — count===0 with otherDateSamples recommends SPECIFIC alternative dates", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
    otherDatesCount: 1,
    otherDateSamples: [{ title: "Museums Mile", dates: ["Wed 24 Jun", "Thu 25 Jun"] }],
  })
  assert.match(line, /OPTION A/)
  assert.match(line, /\*\*Museums Mile\*\* \(Wed 24 Jun, Thu 25 Jun\)/)
  assert.match(line, /Recommend these specific alternative date/)
})

test("canvas count line — count===0 with availableTodaySamples recommends a SIMILAR trip for the same day + syncs canvas", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
    availableTodayCount: 3,
    availableTodaySamples: [{ title: "City Train Tour", tags: ["walking-tours"] }],
  })
  assert.match(line, /OPTION B/)
  assert.match(line, /\*\*City Train Tour\*\*/)
  assert.match(line, /call searchTrips/)
})

test("canvas count line — count===0 with availableTodayCount but no samples still offers other trips", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
    availableTodayCount: 2,
    availableTodaySamples: [],
  })
  assert.match(line, /OTHER trips ARE bookable that day/)
  assert.doesNotMatch(line, /OPTION B/)
})

test("canvas count line — count===0 ignores malformed otherDateSamples (title/date missing)", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
    otherDatesCount: 2,
    otherDateSamples: [{ title: "", dates: ["Wed 24 Jun"] }, { title: "No Dates", dates: [] }],
  })
  // both samples are malformed, so OPTION A must be omitted entirely
  assert.doesNotMatch(line, /OPTION A/)
})

test("canvas count line — not ready returns empty (no premature/stale count injected)", () => {
  const line = buildCanvasCountLine({
    canvasCount: 10,
    canvasReady: false,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.equal(line, "")
})

test("canvas count line — canvas date NOT matching the stored visit date returns empty", () => {
  const line = buildCanvasCountLine({
    canvasCount: 10,
    canvasReady: true,
    canvasDate: "2026-06-27",
    visitDateYMD: "2026-06-21",
  })
  assert.equal(line, "")
})

test("canvas count line — no date on either side injects a count-only line (no GROUND TRUTH)", () => {
  const line = buildCanvasCountLine({
    canvasCount: 7,
    canvasReady: true,
    canvasDate: null,
    visitDateYMD: null,
  })
  assert.match(line, /LIVE TRIP CANVAS COUNT/)
  assert.match(line, /EXACTLY 7 trips/)
  assert.doesNotMatch(line, /GROUND TRUTH/)
})

test("canvas count line — negative count is rejected (returns empty)", () => {
  const line = buildCanvasCountLine({
    canvasCount: -1,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.equal(line, "")
})

test("canvas count line — singular vs plural wording", () => {
  const one = buildCanvasCountLine({
    canvasCount: 1,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.match(one, /EXACTLY 1 trip\b/)
  assert.doesNotMatch(one, /EXACTLY 1 trips/)

  const many = buildCanvasCountLine({
    canvasCount: 3,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.match(many, /EXACTLY 3 trips/)
})

test("prompt — no-interest neutrality rule forbids invented themes and silent updatePreferences", () => {
  const p = promptText()
  assert.match(p, /NO-INTEREST = NEUTRAL NARRATION/)
  assert.match(p, /FORBIDDEN from describing the canvas by specific themes/)
  assert.match(p, /a mix of day trips and museum tours/)
  assert.match(p, /do NOT call updatePreferences to add interests the visitor never stated/)
})

test("prompt — duration accuracy + chat↔canvas title parity rules guard against conflating similar trips", () => {
  const p = promptText()
  assert.match(p, /DURATION ACCURACY/)
  assert.match(p, /never derive a duration from words inside a trip's TITLE/)
  assert.match(p, /SEVERAL near-identical trips/)
  assert.match(p, /CHAT.CANVAS TITLE PARITY/)
  assert.match(p, /do NOT bold ONE specific title/)
})
