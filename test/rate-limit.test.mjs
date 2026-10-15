import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/rate-limit.js")
const { rateLimit, getClientIp, RATE_LIMITS } = mod.default ?? mod

// The limiter is a no-op outside production (dev proxy shares one IP).
process.env.NODE_ENV = "production"

let ipSeq = 0
function req(headers = {}) {
  return new Request("https://sightseeing.lu/api/x", { headers })
}
function freshIp() {
  ipSeq += 1
  return `203.0.113.${ipSeq}`
}

test("each endpoint key has its own counter for the same IP", () => {
  const ip = freshIp()
  const opts = { limit: 3, windowMs: 60_000 }
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit(req({ "x-real-ip": ip }), { key: "a", ...opts }).allowed, true)
  }
  // Endpoint "a" is now exhausted…
  assert.equal(rateLimit(req({ "x-real-ip": ip }), { key: "a", ...opts }).allowed, false)
  // …but endpoint "b" from the same IP is untouched.
  assert.equal(rateLimit(req({ "x-real-ip": ip }), { key: "b", ...opts }).allowed, true)
})

test("different IPs on the same endpoint do not share a counter", () => {
  const a = freshIp()
  const b = freshIp()
  const opts = { key: "same", limit: 1, windowMs: 60_000 }
  assert.equal(rateLimit(req({ "x-real-ip": a }), opts).allowed, true)
  assert.equal(rateLimit(req({ "x-real-ip": a }), opts).allowed, false)
  assert.equal(rateLimit(req({ "x-real-ip": b }), opts).allowed, true)
})

test("429 response carries Retry-After", () => {
  const ip = freshIp()
  const opts = { key: "retry-after", limit: 1, windowMs: 30_000 }
  rateLimit(req({ "x-real-ip": ip }), opts)
  const blocked = rateLimit(req({ "x-real-ip": ip }), opts)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.response.status, 429)
  const retryAfter = Number(blocked.response.headers.get("retry-after"))
  assert.ok(retryAfter > 0 && retryAfter <= 30, `retry-after was ${retryAfter}`)
})

test("getClientIp prefers Cloudflare's CF-Connecting-IP", () => {
  const r = req({
    "cf-connecting-ip": "198.51.100.7",
    "x-real-ip": "172.70.1.1",
    "x-forwarded-for": "198.51.100.7, 172.70.1.1",
  })
  assert.equal(getClientIp(r), "198.51.100.7")
})

test("getClientIp trusts CF-Connecting-IP via XFF peer and IPv6 Cloudflare edges", () => {
  assert.equal(getClientIp(req({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.7, 104.16.5.5" })), "198.51.100.7")
  assert.equal(getClientIp(req({ "cf-connecting-ip": "198.51.100.7", "x-real-ip": "2606:4700:10::ac43:1" })), "198.51.100.7")
  assert.equal(getClientIp(req({ "cf-connecting-ip": "198.51.100.7", "x-real-ip": "::ffff:162.158.1.1" })), "198.51.100.7")
})

test("getClientIp ignores a forged CF-Connecting-IP when the peer is not Cloudflare", () => {
  // Client bypassed Cloudflare and hit the origin directly with a fake header.
  assert.equal(getClientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-real-ip": "203.0.113.50" })), "203.0.113.50")
  assert.equal(getClientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-real-ip": "2001:db8::1" })), "2001:db8::1")
  assert.equal(getClientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "9.9.9.9")
  assert.equal(getClientIp(req({ "cf-connecting-ip": "1.2.3.4" })), "unknown")
})

test("getClientIp falls back to x-real-ip, then rightmost x-forwarded-for", () => {
  assert.equal(getClientIp(req({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "10.0.0.1")
  assert.equal(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "2.2.2.2")
  assert.equal(getClientIp(req({})), "unknown")
})

test("RATE_LIMITS presets match the agreed per-minute budgets", () => {
  assert.deepEqual(RATE_LIMITS.cachedRead, { limit: 180, windowMs: 60_000 })
  assert.deepEqual(RATE_LIMITS.liveAvailability, { limit: 90, windowMs: 60_000 })
  assert.deepEqual(RATE_LIMITS.ai, { limit: 30, windowMs: 60_000 })
})
