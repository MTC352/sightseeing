import { logError, requestMeta } from "@/lib/error-log"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Client-side error beacon for the Trip Planner chat.
 *
 * WHY: the planner chat can fail in ways the SERVER never sees — a network
 * blip, a proxy idle/heartbeat timeout that cuts the SSE stream, a client-side
 * abort, or a transport parse error. In all of those the browser shows
 * "couldn't reach the AI assistant", but no server handler ran, so nothing was
 * logged to /admin/logs. This endpoint lets the client report that failure so
 * EVERY planner chat error is visible to admins under source "ai:planner".
 *
 * It is public (the planner is public) and intentionally tiny: it truncates
 * input hard, performs a single fire-and-forget DB insert, never calls any
 * paid/third-party service, and always returns 204 so it can never become an
 * abuse amplifier or break the client.
 */
export async function POST(req: Request) {
  // Abuse control: this is a public unauthenticated write path. Silently drop
  // (still 204 — never surface an error to the fire-and-forget client) once a
  // caller exceeds a generous per-IP budget so it can't be spammed into log /
  // storage churn. No-ops in dev (the helper bypasses non-production).
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 })
  if (!limited.allowed) return new Response(null, { status: 204 })

  try {
    const body = (await req.json().catch(() => null)) as
      | { message?: unknown; kind?: unknown; lastUserText?: unknown }
      | null
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.slice(0, 500)
        : "(no message)"
    const kind = body?.kind === "auth" ? "auth" : "temp"
    const lastUserText =
      typeof body?.lastUserText === "string" && body.lastUserText.trim()
        ? body.lastUserText.slice(0, 300)
        : undefined

    void logError({
      source: "ai:planner",
      level: "error",
      message: `Planner chat unreachable (client-reported, ${kind}): ${message}`,
      context: { phase: "client", kind, lastUserText, ...requestMeta(req) },
    })
  } catch {
    /* a logging beacon must never throw */
  }
  return new Response(null, { status: 204 })
}
