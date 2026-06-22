import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../../.test-build/visibility-decision.js")
const { decidePlannerHidden } = mod.default ?? mod

test("no hide flag — planner is visible to everyone (session irrelevant)", () => {
  assert.equal(decidePlannerHidden({ hasSession: false }), false)
  assert.equal(decidePlannerHidden({ hasSession: true }), false)
  assert.equal(decidePlannerHidden({ itineraryHide: false, plannerHide: false, hasSession: false }), false)
})

test("hide flag set + no session — public visitor is gated out", () => {
  assert.equal(decidePlannerHidden({ itineraryHide: true, hasSession: false }), true)
  assert.equal(decidePlannerHidden({ plannerHide: true, hasSession: false }), true)
})

test("hide flag set + admin session — admin bypasses the gate (preview)", () => {
  assert.equal(decidePlannerHidden({ itineraryHide: true, hasSession: true }), false)
  assert.equal(decidePlannerHidden({ plannerHide: true, hasSession: true }), false)
})

test("either source flag (migration backward-compat) triggers the gate", () => {
  assert.equal(decidePlannerHidden({ itineraryHide: true, plannerHide: false, hasSession: false }), true)
  assert.equal(decidePlannerHidden({ itineraryHide: false, plannerHide: true, hasSession: false }), true)
})
