/**
 * lib/rate-limit.ts
 * Simple sliding-window in-memory rate limiter for public API endpoints.
 *
 * Usage:
 *   const result = rateLimit(request, { key: "weather", ...RATE_LIMITS.cachedRead })
 *   if (!result.allowed) return result.response
 *
 * Counters are per endpoint AND per IP (`key:ip`). A single page load fans out
 * into several API calls; a shared per-IP counter let cheap calls (departing
 * soon, deals) exhaust the budget of others (reviews, outdoor-today) and
 * blanked those widgets.
 *
 * Limits are deliberately generous: Cloudflare sits in front of the site and is
 * the primary abuse control. These limits only stop a single client hammering
 * one endpoint, and must tolerate many visitors sharing an IP (hotel/office
 * Wi-Fi, carrier NAT). Tune budgets in RATE_LIMITS, not at call sites.
 *
 * IP extraction strategy (see getClientIp):
 *   The "peer" is `x-real-ip` (set by the trusted reverse proxy), else the
 *   RIGHTMOST `x-forwarded-for` hop — never the leftmost, which any client
 *   can forge.
 *   If the peer is a Cloudflare edge, use `cf-connecting-ip` (the real visitor)
 *   — otherwise every visitor routed through one edge would share a bucket.
 *   If the peer is NOT Cloudflare, the request bypassed Cloudflare, so
 *   `cf-connecting-ip` is client-controlled and ignored; the peer is used.
 */

import { type NextRequest, NextResponse } from "next/server"

interface RateLimitOptions {
  /** Endpoint bucket name, e.g. "google-reviews". Each key counts separately. */
  key: string
  limit: number
  windowMs: number
}

/**
 * Per-IP budgets, shared by this in-memory limiter and the cross-instance
 * shared limiter (lib/shared-rate-limit.ts) so both stay in sync.
 * Sized for ~15 active visitors behind one IP, plus 50% headroom.
 */
export const RATE_LIMITS = {
  /** Server-cached reads with no per-request upstream cost. */
  cachedRead: { limit: 180, windowMs: 60_000 },
  /** May call TourCMS/Palisis (behind a short server cache). */
  liveAvailability: { limit: 90, windowMs: 60_000 },
  /** Paid AI model calls (chat, planner, itinerary). */
  ai: { limit: 30, windowMs: 60_000 },
  /** Client error beacons. */
  clientLog: { limit: 30, windowMs: 60_000 },
  /** Brute-force protection for the admin login. */
  adminLogin: { limit: 15, windowMs: 15 * 60_000 },
  /** Job application uploads (spam/storage protection). */
  careersApply: { limit: 8, windowMs: 60 * 60_000 },
} as const

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

// Cloudflare's published edge ranges (https://www.cloudflare.com/ips/).
const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
].map((cidr) => {
  const [addr, bits] = cidr.split("/")
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0
  return { base: (parseIpv4(addr)! & mask) >>> 0, mask }
})

const CLOUDFLARE_V6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
].map((cidr) => {
  const [addr, bits] = cidr.split("/")
  const shift = BigInt(128 - Number(bits))
  return { prefix: parseIpv6(addr)! >> shift, shift }
})

function parseIpv4(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null
    n = n * 256 + Number(p)
  }
  return n
}

function parseIpv6(ip: string): bigint | null {
  const halves = ip.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail]
  let n = BigInt(0)
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
    n = (n << BigInt(16)) + BigInt(parseInt(g, 16))
  }
  return n
}

function isCloudflareIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) → plain IPv4.
  const v4 = parseIpv4(ip.replace(/^::ffff:/i, ""))
  if (v4 !== null) return CLOUDFLARE_V4.some(({ base, mask }) => ((v4 & mask) >>> 0) === base)
  const v6 = parseIpv6(ip.split("%")[0])
  if (v6 === null) return false
  return CLOUDFLARE_V6.some(({ prefix, shift }) => v6 >> shift === prefix)
}

export function getClientIp(request: NextRequest | Request): string {
  const headers = request.headers

  let peer = headers.get("x-real-ip")?.trim()
  if (!peer) {
    const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    peer = hops[hops.length - 1]
  }
  if (!peer) return "unknown"

  const cfIp = headers.get("cf-connecting-ip")?.trim()
  if (cfIp && isCloudflareIp(peer)) return cfIp

  return peer
}

export function rateLimit(
  request: NextRequest | Request,
  options: RateLimitOptions,
): { allowed: true } | { allowed: false; response: NextResponse } {
  // Dev/preview bypass. In the Replit dev environment ALL traffic (the preview
  // pane, HMR, screenshots, curl, and e2e browsers) egresses through ONE shared
  // reverse-proxy IP, so the per-IP sliding window collapses into a single
  // global bucket and a handful of preview requests exhaust the limit for the
  // whole environment. That makes the planner unusable and blocks e2e testing.
  // Rate limiting is a production abuse control, so we only enforce it there;
  // production clients keep distinct real IPs and are unaffected.
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true }
  }

  const bucket = `${options.key}:${getClientIp(request)}`
  const now = Date.now()

  const entry = store.get(bucket)

  if (!entry || now >= entry.resetAt) {
    store.set(bucket, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true }
  }

  if (entry.count >= options.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(options.limit),
            "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
          },
        },
      ),
    }
  }

  entry.count += 1
  return { allowed: true }
}

// ── Chat payload size guards (cost-amplification defense) ───────────────────
// Public AI chat endpoints forward `body.messages` to paid model providers.
// The per-IP request limiter caps request COUNT but not per-request COST, so a
// single request can still smuggle a huge synthetic transcript that is
// expensive to tokenize. These guards bound the size of an individual request
// (message count + serialized characters) BEFORE the model call. They are
// per-request (not per-IP), so unlike `rateLimit` they are safe to enforce in
// every environment without collapsing into a shared dev bucket.

export interface ChatBudget {
  /** Max number of messages allowed in the conversation history. */
  maxMessages: number
  /** Max total serialized characters across all messages. */
  maxChars: number
  /** Max raw request body size in bytes (Content-Length quick reject). */
  maxBytes: number
}

/**
 * Reject obviously oversized request bodies up front using the Content-Length
 * header. Cheap first line of defense; the post-parse `oversizedChat` guard is
 * authoritative because Content-Length can be omitted or chunked.
 */
export function oversizedBody(
  request: NextRequest | Request,
  maxBytes: number,
): NextResponse | null {
  const len = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(len) && len > maxBytes) {
    return NextResponse.json(
      { error: "Request payload too large." },
      { status: 413 },
    )
  }
  return null
}

/**
 * Reject chat payloads whose message count or total serialized size exceeds the
 * supplied budget. Returns a 413 response when over-budget, otherwise null.
 * Serialized length (JSON.stringify per message) is a provider-agnostic proxy
 * for token cost that also accounts for tool-call/result payloads.
 */
export function oversizedChat(
  messages: unknown,
  budget: ChatBudget,
): NextResponse | null {
  if (!Array.isArray(messages)) return null
  if (messages.length > budget.maxMessages) {
    return NextResponse.json(
      { error: "Conversation history is too long. Please start a new chat." },
      { status: 413 },
    )
  }
  let chars = 0
  for (const m of messages) {
    try {
      chars += JSON.stringify(m).length
    } catch {
      // Unserializable entry — count a nominal cost so it can't slip the cap.
      chars += budget.maxChars
    }
    if (chars > budget.maxChars) {
      return NextResponse.json(
        { error: "Conversation history is too large. Please start a new chat." },
        { status: 413 },
      )
    }
  }
  return null
}

// Periodically prune expired entries to prevent unbounded memory growth.
// Runs every 5 minutes, safe to call multiple times (self-throttles).
let pruneScheduled = false
export function schedulePrune(): void {
  if (pruneScheduled) return
  pruneScheduled = true
  setTimeout(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key)
    }
    pruneScheduled = false
  }, 5 * 60 * 1000)
}
