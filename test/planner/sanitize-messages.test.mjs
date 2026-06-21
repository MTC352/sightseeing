import test from "node:test"
import assert from "node:assert/strict"

// Transpiled to .test-build by the `pretest` step (see package.json).
const mod = await import("../../.test-build/sanitize-messages.js")
const sanitizePlannerMessages = mod.sanitizePlannerMessages ?? mod.default?.sanitizePlannerMessages

const userText = (text) => ({ role: "user", parts: [{ type: "text", text }] })
const toolPart = (toolCallId, over = {}) => ({
  type: "tool-searchTrips",
  state: "output-available",
  input: { tags: ["museums"] },
  output: { total: 1 },
  toolCallId,
  ...over,
})

test("text-only messages pass through untouched", () => {
  const input = [userText("hi"), { role: "assistant", parts: [{ type: "text", text: "hello" }] }]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 2)
  assert.deepEqual(out, input)
})

test("duplicate toolCallId is deduped — first occurrence kept (OpenAI Responses fc_ 400 fix)", () => {
  const dup = toolPart("fc_dupe")
  const input = [
    { role: "assistant", parts: [dup] },
    { role: "assistant", parts: [toolPart("fc_dupe")] }, // replayed duplicate id
  ]
  const out = sanitizePlannerMessages(input)
  // Only the first message survives; the second's sole part was the duplicate.
  assert.equal(out.length, 1)
  assert.equal(out[0].parts.length, 1)
  assert.equal(out[0].parts[0].toolCallId, "fc_dupe")
})

test("two DISTINCT toolCallIds are both kept", () => {
  const input = [{ role: "assistant", parts: [toolPart("fc_a"), toolPart("fc_b")] }]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 1)
  assert.deepEqual(
    out[0].parts.map((p) => p.toolCallId),
    ["fc_a", "fc_b"],
  )
})

test("unresolved tool part (no output yet) is dropped — prevents Anthropic input:Field required 400", () => {
  const input = [{ role: "assistant", parts: [toolPart("fc_x", { state: "input-streaming" })] }]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 0)
})

test("resolved tool part with missing input is dropped (synthetic/manual cards)", () => {
  const input = [{ role: "assistant", parts: [toolPart("fc_y", { input: undefined })] }]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 0)
})

test("output-error tool parts are retained (they carry a matching tool_result)", () => {
  const input = [{ role: "assistant", parts: [toolPart("fc_err", { state: "output-error" })] }]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 1)
  assert.equal(out[0].parts[0].toolCallId, "fc_err")
})

test("mixed message: a bad tool part is stripped but the sibling text part survives", () => {
  const input = [
    {
      role: "assistant",
      parts: [{ type: "text", text: "here you go" }, toolPart("fc_bad", { input: null })],
    },
  ]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 1)
  assert.equal(out[0].parts.length, 1)
  assert.equal(out[0].parts[0].type, "text")
})

test("dynamic-tool parts are subject to the same resolution + dedupe rules", () => {
  const input = [
    { role: "assistant", parts: [{ type: "dynamic-tool", state: "output-available", input: {}, toolCallId: "fc_d" }] },
    { role: "assistant", parts: [{ type: "dynamic-tool", state: "output-available", input: {}, toolCallId: "fc_d" }] },
  ]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 1)
})

test("messages with no parts array do not throw and are dropped", () => {
  const input = [{ role: "assistant" }, userText("ok")]
  const out = sanitizePlannerMessages(input)
  assert.equal(out.length, 1)
  assert.equal(out[0].parts[0].text, "ok")
})
