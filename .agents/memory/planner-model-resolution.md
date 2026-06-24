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
