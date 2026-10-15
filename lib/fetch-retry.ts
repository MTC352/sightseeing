/**
 * lib/fetch-retry.ts
 * Browser-side `fetch` wrapper that transparently retries HTTP 429 responses.
 *
 * Public API routes are rate-limited per IP (lib/rate-limit.ts). Visitors that
 * share an IP (hotel/office Wi-Fi, carrier NAT) can occasionally trip a limit;
 * instead of rendering an empty widget we wait for the server's `Retry-After`
 * and try again. Only 429 is retried — other statuses are returned unchanged so
 * callers keep their existing `res.ok` / error handling.
 *
 * After `retries` attempts the final 429 response is returned (not thrown), so
 * callers decide whether to keep showing their previous data.
 */

export interface RetryOptions {
  /** Extra attempts after the first 429. Default 2. */
  retries?: number
  /** Upper bound for a single wait, regardless of Retry-After. Default 30s. */
  maxDelayMs?: number
  /** Random extra delay so clients behind one IP don't retry in lockstep. Default 1s. */
  jitterMs?: number
}

const MIN_DELAY_MS = 500

/**
 * How long to wait before retry number `attempt` (0-based). Uses the
 * `Retry-After` header (seconds or HTTP date) when present, otherwise
 * exponential backoff (2s, 4s, 8s…). Clamped to [500ms, maxDelayMs].
 */
export function retryDelayMs(
  retryAfter: string | null,
  attempt: number,
  maxDelayMs: number,
  now: number = Date.now(),
): number {
  let ms = NaN
  if (retryAfter) {
    const trimmed = retryAfter.trim()
    if (/^\d+$/.test(trimmed)) {
      ms = Number(trimmed) * 1000
    } else {
      const at = Date.parse(trimmed)
      if (!Number.isNaN(at)) ms = at - now
    }
  }
  if (Number.isNaN(ms)) ms = 2000 * 2 ** attempt
  return Math.min(maxDelayMs, Math.max(MIN_DELAY_MS, ms))
}

function abortError(): Error {
  return typeof DOMException !== "undefined"
    ? new DOMException("The operation was aborted.", "AbortError")
    : Object.assign(new Error("The operation was aborted."), { name: "AbortError" })
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  { retries = 2, maxDelayMs = 30_000, jitterMs = 1000 }: RetryOptions = {},
): Promise<Response> {
  // RTK Query passes a Request carrying its own signal rather than init.signal.
  const signal = init.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined)
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init)
    if (res.status !== 429 || attempt >= retries) return res
    // Release the discarded 429 body before waiting.
    res.body?.cancel().catch(() => {})
    const delay = retryDelayMs(res.headers.get("retry-after"), attempt, maxDelayMs)
    await sleep(delay + Math.random() * jitterMs, signal)
  }
}
