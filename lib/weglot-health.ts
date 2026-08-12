/**
 * lib/weglot-health.ts
 * Server-side validation of the configured Weglot API key against Weglot's own
 * settings API, so we never inject the Weglot loader for a dead/rotated/deleted
 * project (which makes weglot.min.js log
 * `[Weglot] Cannot load Weglot because the project has been deleted` in every
 * visitor's console).
 *
 * `checkWeglotKey` performs the live lookup; `getWeglotHealth` wraps it in a
 * process-level cache (with a shared in-flight promise so concurrent page
 * renders trigger at most one upstream call) — the key changes rarely, so a
 * long TTL keeps the per-request cost to a fast in-memory read.
 */

export type WeglotStatus = "ok" | "invalid" | "unconfigured" | "unknown"

export interface WeglotHealth {
  status: WeglotStatus
  message: string
  /** Weglot project slug, when the lookup resolved a project. */
  projectSlug?: string
  /** The project's CURRENT key, surfaced when the configured key is stale/rotated. */
  canonicalKey?: string
}

const WG_RE = /^wg_[a-zA-Z0-9]+$/
const TIMEOUT_MS = 6000

/** Live, uncached validation. Never throws — network/parse failures map to
 *  `unknown` so callers can fail-open (keep translation working) rather than
 *  disabling Weglot because our validator hiccuped. */
export async function checkWeglotKey(key: string): Promise<WeglotHealth> {
  const k = (key ?? "").trim()
  if (!WG_RE.test(k)) {
    return { status: "unconfigured", message: "No valid Weglot key is configured." }
  }
  try {
    const r = await fetch(
      `https://api.weglot.com/projects/settings?api_key=${encodeURIComponent(k)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (r.status === 401 || r.status === 403) {
      return { status: "invalid", message: `Weglot rejected this key (HTTP ${r.status}).` }
    }
    if (!r.ok) {
      return { status: "unknown", message: `Weglot API returned HTTP ${r.status}.` }
    }
    const data = (await r.json().catch(() => ({}))) as {
      deleted_at?: unknown
      api_key?: string
      project_slug?: string
    }
    if (data.deleted_at != null) {
      return {
        status: "invalid",
        message: "This Weglot project has been deleted.",
        projectSlug: data.project_slug,
      }
    }
    // The settings API resolves stale/rotated keys to their project but returns
    // the project's CURRENT key. If it differs, the configured key is the old
    // one — the CDN loader will report the project as deleted.
    if (typeof data.api_key === "string" && data.api_key && data.api_key !== k) {
      return {
        status: "invalid",
        message: "This key has been rotated — use the project's current key.",
        projectSlug: data.project_slug,
        canonicalKey: data.api_key,
      }
    }
    return {
      status: "ok",
      message: `Connected to Weglot project${data.project_slug ? ` "${data.project_slug}"` : ""}.`,
      projectSlug: data.project_slug,
    }
  } catch {
    return { status: "unknown", message: "Could not reach Weglot to validate the key." }
  }
}

// ── Process-level cache (stale-tolerant) ────────────────────────────────────
const TTL_OK_MS = 30 * 60 * 1000 // healthy keys rarely change
const TTL_BAD_MS = 5 * 60 * 1000 // re-check a bad key sooner so a fix is picked up

let cached: { key: string; health: WeglotHealth; at: number } | null = null
let inflight: Promise<WeglotHealth> | null = null

/** Cached validation. Returns the fresh cached result instantly, otherwise
 *  runs (or joins) a single in-flight check. Callers should still wrap this in
 *  a short `withTimeout(..., fallback={status:"unknown"})` so a cold cache miss
 *  never blocks rendering — the check completes in the background and populates
 *  the cache for the next request. */
export async function getWeglotHealth(key: string): Promise<WeglotHealth> {
  const k = (key ?? "").trim()
  const now = Date.now()
  const ttl = cached?.health.status === "ok" ? TTL_OK_MS : TTL_BAD_MS
  if (cached && cached.key === k && now - cached.at < ttl) return cached.health
  if (!inflight) {
    inflight = checkWeglotKey(k)
      .then((h) => {
        cached = { key: k, health: h, at: Date.now() }
        return h
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}
