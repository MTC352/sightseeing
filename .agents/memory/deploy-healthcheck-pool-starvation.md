---
name: Autoscale deploy startup-probe timeout on GET /
description: Why publishing this Next.js app to Replit autoscale fails the startup healthcheck, and the verified fix.
---

# Autoscale startup probe fails on cold `GET /`

**Root cause (verified):** the FIRST request to any `next start` process pays a one-time,
**route-independent** Next.js production-pipeline init. On fast hardware it's ~1.6s; on a
cold, **CPU-throttled** 2-vCPU autoscale instance it balloons to multiples of that. The
deploy startup probe's very first `GET /` lands on this init and exceeds the short
per-probe deadline → `context deadline exceeded` repeated → SIGKILL → publish never goes
healthy.

**What it is NOT (ruled out by local prod repro):**
- NOT `/` being slow when warm — warm `/` serves in ~10-40ms.
- NOT DB blocking the render — `withTimeout` makes `/` resilient even to a dead/hanging DB
  (200 in ~1.5s cold). Prod DB does wake (~8s) and `withTimeout(250ms)` caps render reads.
- NOT stale-ISR regen — stale `/` serves the cached page in 5-7ms and regenerates in the
  background (non-blocking). So `force-static` / `revalidate` value does NOT matter here.
- NOT probe cancellation resetting the init — proven: 6 aborted 0.2s probes, then a real
  `GET /` = 73ms. The init completes once in the background and **persists**.
- NOT proxy.ts middleware (it already excludes `/` via matcher) and NOT the heavy `/`
  route module graph (a trivial API route pays the same ~1.6s when it's the first request).

**Fix (two parts, both shipped):**
1. **Self-warm at boot** (`instrumentation.ts`, production-gated): fire an internal
   `GET http://127.0.0.1:5000/` the instant the listener is up (retry every 200ms until it
   responds). This pays the one-time init in the background ~0.7s before the external probe
   and runs to completion regardless of probe cancellation, so the probe's retry hits a warm
   server. Verified locally: server self-warms with NO external request, first external
   `GET /` then = ~10ms.
2. **Skip the pnpm wrapper** in the deploy run command (`deployConfig` →
   `["node_modules/.bin/next","start","-p","5000"]`) to reclaim the ~1.1s
   `starting up → next start` gap seen in deploy logs.

**Why:** the init is the bottleneck and is started lazily by the first request; self-warm
starts it as early as possible and decouples it from the probe's short deadline, while
dropping pnpm widens the budget. Together they give the cold init the best chance to finish
inside the startup window.

**How to apply / keep in lockstep:**
- The self-warm URL port (5000) MUST match the deploy run command's `-p`. If the deploy port
  ever changes, update BOTH the run command and the instrumentation warm URL.
- Self-warm is gated to `NODE_ENV === "production"` so `next dev` doesn't eagerly compile `/`.
- If probe failures STILL persist after this, the remaining lever is **more CPU** (bump
  autoscale vCPUs) or a Reserved VM — the residual cause is cold-start CPU throttling, which
  code cannot fully remove. Confirm via deploy logs: success looks like `self-warm ok ...`
  followed by a passing probe after `Ready` (no repeated `context deadline exceeded`).
