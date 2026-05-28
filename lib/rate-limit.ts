/**
 * lib/rate-limit.ts
 * Simple sliding-window in-memory rate limiter for public API endpoints.
 *
 * Usage:
 *   const result = rateLimit(request, { limit: 20, windowMs: 60_000 })
 *   if (!result.allowed) return result.response
 *
 * IP extraction strategy:
 *   Prefer `x-real-ip`, which is set by the trusted reverse-proxy layer and
 *   cannot be injected by the client. Fall back to the RIGHTMOST entry in
 *   `x-forwarded-for` — the hop added by the nearest trusted proxy — which
 *   is also not under attacker control, unlike the leftmost entry that any
 *   client can forge by sending a fake XFF header.
 */

import { type NextRequest, NextResponse } from "next/server"

interface RateLimitOptions {
  limit: number
  windowMs: number
}

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

function getIp(request: NextRequest | Request): string {
  const headers = request.headers

  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const hops = forwarded.split(",").map((s) => s.trim()).filter(Boolean)
    if (hops.length > 0) {
      return hops[hops.length - 1]
    }
  }

  return "unknown"
}

export function rateLimit(
  request: NextRequest | Request,
  options: RateLimitOptions,
): { allowed: true } | { allowed: false; response: NextResponse } {
  const ip = getIp(request)
  const now = Date.now()

  const entry = store.get(ip)

  if (!entry || now >= entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + options.windowMs })
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
