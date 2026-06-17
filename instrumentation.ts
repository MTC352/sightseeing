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
const DISCOVERY_BOOTSTRAP_DELAY_MS = 15_000

export async function register() {
  // Only run in the Node.js runtime (not edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    setTimeout(() => {
      void (async () => {
        try {
          const { triggerDiscoveryBootstrap } = await import("./lib/departing-soon-cache")
          triggerDiscoveryBootstrap()
          console.log("[instrumentation] Departing Soon discovery bootstrap triggered (deferred)")
        } catch (e) {
          // Non-fatal — the route handler will retry on first request
          console.warn("[instrumentation] Could not trigger discovery bootstrap:", e)
        }
      })()
    }, DISCOVERY_BOOTSTRAP_DELAY_MS).unref?.()
  }
}
