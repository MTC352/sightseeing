import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/rebuild-decision.js")
const decideRebuildAction = mod.decideRebuildAction ?? mod.default?.decideRebuildAction

test("THE BUG: stale-card 'Rebuild for <date>' button always rebuilds, never just-opens", () => {
  // Reproduces the report: after a date change the auto-rebuild can leave a
  // same-set centerItinerary whose visitDate already matches the new date, so
  // the date check would pass and the click would only re-open (canvas date
  // updates, schedule does not). forceRebuild must override that.
  assert.equal(
    decideRebuildAction({
      forceRebuild: true,
      hasExisting: true,
      sameSet: true,
      existingVisitDate: "2026-06-27",
      currentDate: "2026-06-27",
    }),
    "rebuild",
  )
})

test("forceRebuild wins even when nothing is loaded or sets differ", () => {
  assert.equal(
    decideRebuildAction({ forceRebuild: true, hasExisting: false, sameSet: false, currentDate: "2026-06-27" }),
    "rebuild",
  )
  assert.equal(
    decideRebuildAction({ forceRebuild: true, hasExisting: true, sameSet: false, existingVisitDate: "2026-06-27", currentDate: "2026-06-27" }),
    "rebuild",
  )
})

test("non-stale 'View' button: same set + same date opens instantly (no API round-trip)", () => {
  assert.equal(
    decideRebuildAction({
      forceRebuild: false,
      hasExisting: true,
      sameSet: true,
      existingVisitDate: "2026-06-22",
      currentDate: "2026-06-22",
    }),
    "open",
  )
})

test("date drift WITHOUT forceRebuild still rebuilds (defense in depth)", () => {
  // Even if the stale flag somehow weren't passed, a genuine date mismatch must
  // not silently re-open yesterday's plan.
  assert.equal(
    decideRebuildAction({
      forceRebuild: false,
      hasExisting: true,
      sameSet: true,
      existingVisitDate: "2026-06-22",
      currentDate: "2026-06-27",
    }),
    "rebuild",
  )
})

test("trip-set mismatch rebuilds; no plan loaded rebuilds", () => {
  assert.equal(
    decideRebuildAction({ forceRebuild: false, hasExisting: true, sameSet: false, existingVisitDate: "2026-06-22", currentDate: "2026-06-22" }),
    "rebuild",
  )
  assert.equal(
    decideRebuildAction({ forceRebuild: false, hasExisting: false, sameSet: false, currentDate: "2026-06-22" }),
    "rebuild",
  )
})

test("legacy plan with no recorded visitDate opens (preserves prior fast-path)", () => {
  assert.equal(
    decideRebuildAction({ forceRebuild: false, hasExisting: true, sameSet: true, existingVisitDate: null, currentDate: "2026-06-22" }),
    "open",
  )
  assert.equal(
    decideRebuildAction({ forceRebuild: false, hasExisting: true, sameSet: true, existingVisitDate: undefined, currentDate: "2026-06-22" }),
    "open",
  )
})
