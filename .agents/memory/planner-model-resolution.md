---
name: Planner model resolution (stale-default shadowing)
description: Why the planner chat ran a weak model despite admin config, and the date-change → AI re-derive sync rule.
---

# Planner model lives in the `model` COLUMN, not `extra_config`

`dbGetSettings()` seeds `plannerBehavior` with a hardcoded default model
(`openai/gpt-4o-mini`) and then merges the planner `ai_system_configs.extra_config`
over it. The planner's real model is stored in the **`model` column**, NOT in
`extra_config` — so the merge never overwrote the default, and the route
(`adminModel = plannerBehavior?.model || settings.ai.planner.model`) used the stale
default, shadowing the admin-selected column value. resolveAi then derived a tier
from that wrong model.

**Rule:** in `dbGetSettings`, after merging the planner `extra_config`, copy the
row's `model` column into `plannerBehavior.model` when it's a non-empty string.
**Why:** the planner-behavior admin page/API only ever read/write `extra_config`
(numeric scheduling + form), never the model; model writes go to the column via
`dbUpdateAiSystem('planner')` / provider-switch remap. So the column is the single
source of truth for the planner model and must win.
**How to apply:** any new default object built inside `dbGetSettings` that is later
merged with DB rows risks the same shadowing — make sure column-owned fields are
re-applied AFTER the merge, not left at their hardcoded default.

# Visit-date change must re-derive via the AI (Option B)

Planner is "AI = single source of truth". A visit-date change is a date-based
search: it must fire a real AI user turn so the AI re-runs searchTrips for the new
date and the Trip Canvas (which mirrors the latest searchTrips output) follows —
NOT a local re-filter of the previous date's canvas trips.
**Why:** the canvas reads the latest AI searchTrips result; re-filtering locally
desyncs chat prose from the canvas.
**How to apply:** the server already scans the whole catalog's dates-and-deals
fresh BEFORE the AI reasons (`ensureAvailFor` in `app/api/planner/route.ts`), so a
lagging client availability snapshot is fine. The send must be QUEUED (handleSend
drops while status is streaming/submitted) and flushed when the chat is sendable
again, cleared once so it can't double-fire. Gate on an active conversation + no
full itinerary built (a built itinerary rebuilds deterministically instead).

# OpenAI TPM forces the planner onto gpt-4.1-mini (balanced), not gpt-4.1 (best)

The planner is a multi-step tool-calling chat (`stopWhen: stepCountIs(5)`): every
step re-sends the FULL detailed system prompt (~21–26K tokens). On a low OpenAI
usage tier, `gpt-4.1` (best tier) has only ~30K TPM — so even 2 steps in one turn
blow the per-minute cap → `rate_limit_exceeded` → "couldn't reach the AI".

**Decision:** the OpenAI `balanced` tier is `gpt-4.1-mini` (not `gpt-4o`), and the
planner runs on balanced. gpt-4.1-mini is same-family (strong tool-calling, 1M ctx)
with ~10× the TPM headroom (200K+ vs 30K) and a SEPARATE per-model quota pool.
**Why:** keeping the strongest model + full prompt under 30K TPM is physically
impossible, and OpenAI prompt caching does NOT relieve TPM — cached input tokens
still count fully toward the rate limit (confirmed in OpenAI docs). Caching only
cuts cost/latency. The only ways to keep `gpt-4.1` are raising the limit
(account-level usage-tier upgrade) — not a code change.
**How to apply:** `tierOf()` must special-case `gpt-4.1-mini → balanced` BEFORE the
generic `mini → fast` rule (else it's misclassified as fast like gpt-4o-mini). The
model is a DB admin setting: `ai_system_configs` rows + the `003-ai-system-configs`
migration snapshot must agree, or a #003 overwrite re-seeds the old model. Do NOT
"fix" planner rate limits by trimming the prompt or dropping to gpt-4o-mini — the
user explicitly wants the detailed prompt + accurate analysis/tool-calling.
