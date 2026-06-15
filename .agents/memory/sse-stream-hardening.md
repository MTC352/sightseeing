---
name: SSE streaming route hardening
description: How to make ReadableStream SSE routes (blog generator etc.) survive proxy idle-timeouts, client disconnects, AND proxy buffering — without 502s, spurious error logs, or all-at-once delivery.
---

# SSE streaming route hardening

**0. Proxy BUFFERS the whole stream → all events arrive at the end at once.**
   Symptom: progress milestones/streamed text stay pending in the BROWSER until
   generation finishes, then flip done all at once.
   **Two layers, BOTH needed:**
   (a) On the SSE `Response`, set `Cache-Control: "no-cache, no-transform"` AND
   `X-Accel-Buffering: "no"` (nginx/edge proxy + compression buffering).
   (b) **Prime the stream with a ~2KB `:`-comment as the FIRST bytes.** The Replit
   **workspace-preview iframe** proxy (`__replco/workspace_iframe.html`) holds the
   first bytes until an internal ~2KB buffer fills before flushing anything — so
   headers alone are NOT enough for the iframe view. The padding pushes past the
   threshold and forces an immediate flush.
   **Verification gotcha:** `curl` (even through `$REPLIT_DEV_DOMAIN` with the
   browser's `Accept-Encoding`) and a clean Playwright browser BOTH stream fine
   without the padding — only the canvas/workspace **iframe** buffers. So curl
   PASSING does NOT prove the iframe works; the 2KB prime is what fixes the iframe.
   Client parser needs no change — it updates per-event and ignores `:` comments.

Long-running AI SSE endpoints behind Replit's edge/dev proxy fail two ways:

1. **Proxy idle-timeout → mid-generation 502.** If the stream sends NO bytes for
   too long (model "waking up" before first token, or a slow image-gen fetch), the
   proxy drops the connection and the client sees a 502.
   **Fix:** a periodic SSE keepalive comment (`: keepalive\n\n`) on a `setInterval`
   (~15s). The client SSE parser only reads `data:` lines, so a `:`-prefixed comment
   is safely ignored. Clear the interval in `finally`.

2. **Client disconnect → "Invalid state: Controller is already closed".** When the
   browser aborts (tab close, navigate, aborted fetch) the controller closes, but
   any later `controller.enqueue` (an `emit()` or the heartbeat) throws. If `emit`
   is unguarded and inside the stream's `try`, that throw lands in the catch and gets
   logged as a bogus AI error on EVERY disconnect.
   **Fix:** add a `cancel()` handler to the ReadableStream that sets a shared
   `closed=true` and clears the heartbeat; hoist `closed`/`heartbeat` to the outer
   scope so both `start` and `cancel` see them; guard `emit` (`if (closed) return; try{enqueue}catch{closed=true}`).

**Also:** wrap `await req.json()` in try/catch → 400 (an uncaught body SyntaxError
becomes a 502, not a 400). And wrap ALL pre-stream setup awaits (settings load,
provider resolution) in an outer try/catch — a throw there otherwise 500s silently
with no log. Construct the stream + `return new Response(stream)` INSIDE that try so
the setup consts stay in scope.

**Why:** these were the root causes of the admin AI Blog Content Generator 502s.

**How to apply:** any new `ReadableStream`-based SSE AI route — copy this shape
(keepalive + cancel + guarded emit + outer setup try + body-parse try).
