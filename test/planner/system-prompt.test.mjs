import test from "node:test"
import assert from "node:assert/strict"

// The pure planner modules are transpiled to .test-build by the `pretest`
// step (see package.json). Node 20 cannot run .ts directly, so we import the
// compiled CJS output. Use dynamic import + interop-safe lookup so the test is
// robust to default/named CJS interop differences.
const mod = await import("../../.test-build/system-prompt.js")
const buildCanvasCountLine = mod.buildCanvasCountLine ?? mod.default?.buildCanvasCountLine

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

test("canvas count line — count===0 & date-matched is PERMISSIVE (may say nothing matches, try another date)", () => {
  const line = buildCanvasCountLine({
    canvasCount: 0,
    canvasReady: true,
    canvasDate: "2026-06-21",
    visitDateYMD: "2026-06-21",
  })
  assert.match(line, /AVAILABILITY GROUND TRUTH/)
  assert.match(line, /shows 0 trips bookable/)
  assert.match(line, /try another date/)
  // must NOT carry the count>0 prohibition
  assert.doesNotMatch(line, /MUST NOT tell the visitor that no trips/)
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
