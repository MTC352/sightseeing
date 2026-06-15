---
name: SSE streaming route hardening
description: How to make ReadableStream SSE routes (blog generator etc.) survive proxy idle-timeouts and client disconnects without 502s or spurious error logs.
---

# SSE streaming route hardening

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
