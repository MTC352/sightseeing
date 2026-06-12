---
name: Planner prompt storage location
description: Where the Trip Planner's AI system-prompt override lives and how it is read/written
---

# Planner prompt override storage

The Trip Planner's **base** system prompt is built in code at request time
(`lib/planner/system-prompt.ts` → `buildPlannerSystemPromptParts`; read-only
preview = `PLANNER_PROMPT_STATIC_PREVIEW`). It is a runtime-interpolated template
with tool contracts and is intentionally NOT DB-editable.

The admin **override** (appended as "CUSTOM INSTRUCTIONS FROM ADMIN") lives on the
`planner` row of `ai_system_configs` in its own `system_prompt` column —
consolidated with every other AI System. It used to live (historical accident) in
`chat.extra_config.planner.systemPrompt`.

**Rule:** read precedence everywhere is `planner.system_prompt` FIRST, then a
back-compat fallback to legacy `chat.extra_config.planner.systemPrompt`. This dual
read exists in BOTH `dbGetChatPlannerConfig` (admin UI) and
`app/api/planner/route.ts` (runtime) — keep them in lockstep.

**Why:** the planner row's `system_prompt` was blank because saves went to the
chat row; this confused admins into thinking the planner wasn't DB-backed. Data
migration `006-planner-prompt-relocation` copies any legacy value across
(idempotent, DATA-only, non-destructive — legacy value left in place).

**How to apply:**
- Writes go through `dbUpdateAiSystem('planner', { systemPrompt })` (records a
  revision under `('planner','systemPrompt')`). Do NOT write the override back to
  `chat.extra_config` — only the onboarding FORM still lives there
  (`chat.extra_config.planner.form`).
- The planner row ALSO stores behavior settings in `extra_config` — never clobber
  it; the migration's `ON CONFLICT` touches only `system_prompt`.
- PromptRevisions widget on the planner-chat page uses
  `systemKey="planner" promptKind="systemPrompt"`. Pre-migration revisions under
  `('chat','plannerSystemPrompt')` remain in the DB but are no longer surfaced.
