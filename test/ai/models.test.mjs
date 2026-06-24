import test from "node:test"
import assert from "node:assert/strict"

// Transpiled to .test-build/ai by the `pretest` step (see package.json).
const mod = await import("../../.test-build/ai/models.js")
const {
  tierOf,
  modelMeta,
  capabilityFor,
  modelOptions,
  modelOptionsDetailed,
  approxConversationTurns,
  formatTokens,
  TIER_MODELS,
  MODEL_META,
} = mod

test("tierOf classifies the OpenAI tier models correctly", () => {
  assert.equal(tierOf("openai/gpt-4o-mini"), "fast")
  assert.equal(tierOf("openai/gpt-4o"), "balanced")
  assert.equal(tierOf("openai/gpt-4.1"), "best")
  // bare ids too
  assert.equal(tierOf("gpt-4o-mini"), "fast")
})

test("gpt-4.1-mini is the OpenAI balanced tier (not fast, despite 'mini')", () => {
  // gpt-4.1-mini is a 4.1-family model used as the OpenAI balanced slot — the
  // generic "mini -> fast" rule must NOT capture it, and gpt-4o-mini stays fast.
  assert.equal(TIER_MODELS.openai.balanced, "gpt-4.1-mini")
  assert.equal(tierOf("openai/gpt-4.1-mini"), "balanced")
  assert.equal(tierOf("gpt-4.1-mini"), "balanced")
  assert.equal(tierOf("openai/gpt-4o-mini"), "fast")
  // Capable (not under-powered) for the heavy planner-chat use-case.
  assert.equal(capabilityFor("openai/gpt-4.1-mini", "planner-chat").level, "good")
})

test("MODEL_META has an entry for every tier model of every provider", () => {
  for (const provider of ["anthropic", "openai"]) {
    for (const tier of ["fast", "balanced", "best"]) {
      const id = TIER_MODELS[provider][tier]
      assert.ok(MODEL_META[id], `missing MODEL_META for ${id}`)
      assert.equal(MODEL_META[id].tier, tier)
      assert.ok(MODEL_META[id].contextWindow > 0)
      assert.ok(MODEL_META[id].maxOutput > 0)
      assert.ok(MODEL_META[id].blurb.length > 0)
    }
  }
})

test("modelMeta accepts prefixed and bare ids, falls back for unknown ids", () => {
  assert.equal(modelMeta("openai/gpt-4.1").contextWindow, MODEL_META["gpt-4.1"].contextWindow)
  assert.equal(modelMeta("gpt-4.1").contextWindow, MODEL_META["gpt-4.1"].contextWindow)
  // Unknown id still returns a usable estimate (never throws / never null).
  const unknown = modelMeta("openai/some-future-best-o5")
  assert.ok(unknown.contextWindow > 0)
  assert.ok(unknown.maxOutput > 0)
})

test("capabilityFor — planner-chat: fast tier is under-powered, balanced capable, best recommended", () => {
  assert.equal(capabilityFor("openai/gpt-4o-mini", "planner-chat").level, "limited")
  assert.equal(capabilityFor("openai/gpt-4o", "planner-chat").level, "good")
  assert.equal(capabilityFor("openai/gpt-4.1", "planner-chat").level, "great")
})

test("capabilityFor — itinerary mirrors planner-chat thresholds", () => {
  assert.equal(capabilityFor("openai/gpt-4o-mini", "itinerary").level, "limited")
  assert.equal(capabilityFor("openai/gpt-4o", "itinerary").level, "good")
  assert.equal(capabilityFor("openai/gpt-4.1", "itinerary").level, "great")
})

test("capabilityFor — lightweight use-cases accept the fast tier", () => {
  assert.equal(capabilityFor("openai/gpt-4o-mini", "chat").level, "good")
  assert.equal(capabilityFor("openai/gpt-4o-mini", "general").level, "good")
})

test("capabilityFor — every verdict carries a label and note", () => {
  const v = capabilityFor("openai/gpt-4o-mini", "planner-chat")
  assert.ok(v.label.length > 0)
  assert.ok(v.note.length > 0)
})

test("formatTokens renders K and M units", () => {
  assert.equal(formatTokens(128_000), "128K")
  assert.equal(formatTokens(1_000_000), "1M")
  assert.equal(formatTokens(1_047_576), "1.0M")
  assert.equal(formatTokens(512), "512")
})

test("approxConversationTurns scales with context window and is always >= 1", () => {
  const big = approxConversationTurns("openai/gpt-4.1")
  const small = approxConversationTurns("openai/gpt-4o-mini")
  assert.ok(big > small)
  assert.ok(small >= 1)
})

test("modelOptions shape is unchanged — exactly 3 prefixed options per provider", () => {
  for (const provider of ["anthropic", "openai"]) {
    const opts = modelOptions(provider)
    assert.equal(opts.length, 3)
    for (const o of opts) {
      assert.ok(o.value.startsWith(`${provider}/`))
      assert.ok(o.label.length > 0)
    }
  }
})

test("modelOptionsDetailed enriches each option with meta + capability", () => {
  const opts = modelOptionsDetailed("openai", "itinerary")
  assert.equal(opts.length, 3)
  for (const o of opts) {
    assert.ok(o.meta.contextWindow > 0)
    assert.ok(["limited", "good", "great"].includes(o.capability.level))
  }
  // fast → limited, best → great for a heavy use-case
  assert.equal(opts[0].capability.level, "limited")
  assert.equal(opts[2].capability.level, "great")
})
