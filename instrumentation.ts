/**
 * Next.js Instrumentation Hook — runs once when the server starts.
 *
 * Eagerly kicks off Departing Soon discovery so the homepage widget
 * has warm data immediately instead of serving a 503 on cold start.
 */
export async function register() {
  // Only run in the Node.js runtime (not edge), and only on the server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { triggerDiscoveryBootstrap } = await import("./lib/departing-soon-cache")
      triggerDiscoveryBootstrap()
      console.log("[instrumentation] Departing Soon discovery bootstrap triggered on startup")
    } catch (e) {
      // Non-fatal — the route handler will retry on first request
      console.warn("[instrumentation] Could not trigger discovery bootstrap:", e)
    }
  }
}
