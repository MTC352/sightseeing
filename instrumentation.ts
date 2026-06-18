/**
 * Next.js Instrumentation Hook — runs once when the server starts.
 *
 * Warms Departing Soon discovery so the homepage widget has data instead of
 * serving a 503 on cold start.
 *
 * IMPORTANT: the warm-up is DEFERRED, not run synchronously at boot. The deploy
 * healthcheck hits `/`, which renders several DB queries. The discovery bootstrap
 * runs a long (~minutes) TourCMS sweep that writes to PostgreSQL on every call
 * (cache persistence + per-call error logging). Running it immediately on an
 * autoscale cold start saturates the small pg pool right when the healthcheck
 * needs a connection, so `/` exceeds the healthcheck deadline and the deploy
 * fails to become healthy. Delaying the sweep lets the healthcheck acquire a
 * free connection and return 200 first; warming then proceeds in the background.
 */
// Push the CPU/IO-heavy TourCMS discovery sweep well past the autoscale startup
// probe window. On a cold 2-vCPU instance the sweep pegs the CPU and writes to a
// still-waking DB; if it fires while the deploy healthcheck is still retrying
// `GET /`, it starves the probe and the publish fails. 45s clears the typical
// probe window before any heavy work begins.
const DISCOVERY_BOOTSTRAP_DELAY_MS = 45_000

export async function register() {
  // Only run in the Node.js runtime (not edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Wake the (possibly suspended/serverless) database IMMEDIATELY at boot.
    // The managed prod DB cold-starts in ~8s; the deploy healthcheck hits `/`
    // ~0.3s after boot, so without this the first connection races the wake and
    // gets "Connection terminated unexpectedly". This fire-and-forget ping starts
    // the wake in the background while `/` returns 200 from its bounded fallbacks,
    // so the instance survives the healthcheck AND the DB is warm by the time real
    // traffic (and later healthchecks) arrive. A few retries cover the first
    // dropped connection during wake. Non-blocking — never delays server start.
    void (async () => {
      try {
        const { pool } = await import("./lib/db")
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await pool.query("SELECT 1")
            console.log(`[instrumentation] DB warm-up ok (attempt ${attempt})`)
            return
          } catch (e) {
            console.warn(
              `[instrumentation] DB warm-up attempt ${attempt} failed:`,
              e instanceof Error ? e.message : e,
            )
            await new Promise((r) => setTimeout(r, 1500))
          }
        }
      } catch (e) {
        console.warn("[instrumentation] DB warm-up could not start:", e)
      }
    })()

    // Self-warm the HTTP server the instant it starts listening.
    //
    // The FIRST request to a `next start` process pays a one-time, route-independent
    // pipeline initialization (~1.5s on fast hardware, but several times that on a
    // cold, CPU-throttled autoscale instance). The deploy healthcheck's very first
    // `GET /` lands on this init and exceeds the short startup-probe deadline, so the
    // publish never goes healthy. By firing an internal request to `/` ourselves as
    // soon as the listener is up, we pay that init in the background ~0.7s before the
    // external probe arrives. The init completes once and persists (aborted/cancelled
    // probes do NOT reset it), so by the time the probe retries, `/` serves from the
    // warm pipeline in milliseconds. Non-blocking; never delays server start.
    if (process.env.NODE_ENV === "production") {
      // Port is pinned by the deploy run command (`next start -p 5000`), so target
      // 5000 directly rather than trusting PORT (which `-p` overrides and which may
      // not match the bound port).
      void (async () => {
        const url = "http://127.0.0.1:5000/"
        for (let attempt = 1; attempt <= 25; attempt++) {
          try {
            const res = await fetch(url, { headers: { "x-warmup": "1" } })
            await res.arrayBuffer().catch(() => {})
            console.log(`[instrumentation] self-warm ok (attempt ${attempt}, status ${res.status})`)
            return
          } catch {
            // Server not listening yet — retry shortly.
            await new Promise((r) => setTimeout(r, 200))
          }
        }
        console.warn("[instrumentation] self-warm gave up after 25 attempts")
      })()
    }

    setTimeout(() => {
      void (async () => {
        try {
          const { triggerDiscoveryBootstrap } = await import("./lib/departing-soon-cache")
          triggerDiscoveryBootstrap()
          console.log("[instrumentation] Departing Soon discovery bootstrap triggered (deferred)")
        } catch (e) {
          // Non-fatal — public routes will hydrate from DB cache on next hit
          console.warn("[instrumentation] Could not trigger discovery bootstrap:", e)
        }
      })()
    }, DISCOVERY_BOOTSTRAP_DELAY_MS).unref?.()
  }
}
