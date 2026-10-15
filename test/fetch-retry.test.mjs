import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/fetch-retry.js")
const { fetchWithRetry, retryDelayMs } = mod.default ?? mod

const NOW = Date.parse("2026-10-15T12:00:00Z")

test("retryDelayMs honours Retry-After seconds", () => {
  assert.equal(retryDelayMs("5", 0, 30_000, NOW), 5_000)
})

test("retryDelayMs honours Retry-After HTTP date", () => {
  const date = new Date(NOW + 8_000).toUTCString()
  assert.equal(retryDelayMs(date, 0, 30_000, NOW), 8_000)
})

test("retryDelayMs caps long waits and floors tiny ones", () => {
  assert.equal(retryDelayMs("600", 0, 30_000, NOW), 30_000)
  assert.equal(retryDelayMs("0", 0, 30_000, NOW), 500)
})

test("retryDelayMs falls back to exponential backoff without a header", () => {
  assert.equal(retryDelayMs(null, 0, 30_000, NOW), 2_000)
  assert.equal(retryDelayMs(null, 1, 30_000, NOW), 4_000)
  assert.equal(retryDelayMs("garbage", 2, 30_000, NOW), 8_000)
})

function withMockFetch(responses, fn) {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init })
    const next = responses.shift()
    return typeof next === "function" ? next() : next
  }
  return fn(calls).finally(() => { globalThis.fetch = original })
}

const r429 = () => new Response("{}", { status: 429, headers: { "Retry-After": "0" } })
const r200 = () => new Response('{"ok":true}', { status: 200 })

test("fetchWithRetry retries a 429 and returns the eventual success", async () => {
  await withMockFetch([r429, r200], async (calls) => {
    const res = await fetchWithRetry("/api/x", {}, { retries: 2, jitterMs: 0 })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 2)
  })
})

test("fetchWithRetry gives up after `retries` and returns the last 429", async () => {
  await withMockFetch([r429, r429, r429, r200], async (calls) => {
    const res = await fetchWithRetry("/api/x", {}, { retries: 2, jitterMs: 0 })
    assert.equal(res.status, 429)
    assert.equal(calls.length, 3)
  })
})

test("fetchWithRetry does not retry other errors", async () => {
  await withMockFetch([() => new Response("", { status: 500 }), r200], async (calls) => {
    const res = await fetchWithRetry("/api/x", {}, { retries: 2, jitterMs: 0 })
    assert.equal(res.status, 500)
    assert.equal(calls.length, 1)
  })
})

test("fetchWithRetry stops waiting when the signal aborts", async () => {
  const slow429 = () => new Response("{}", { status: 429, headers: { "Retry-After": "20" } })
  await withMockFetch([slow429, r200], async (calls) => {
    const ctrl = new AbortController()
    const p = fetchWithRetry("/api/x", { signal: ctrl.signal }, { retries: 2, jitterMs: 0 })
    setTimeout(() => ctrl.abort(), 20)
    await assert.rejects(p, (err) => err.name === "AbortError")
    assert.equal(calls.length, 1)
  })
})
