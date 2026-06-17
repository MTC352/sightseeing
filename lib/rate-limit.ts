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
