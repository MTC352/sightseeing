---
name: Anthropic key resolution order
description: Where every AI route must read the Anthropic key from, and why DB beats env.
---

# Anthropic key resolution (DB-first, env fallback)

- **Rule:** every AI route must resolve the Anthropic key as `integrations.anthropic` (DB, admin-managed) FIRST, then `process.env.ANTHROPIC_API_KEY` as fallback — `(dbKey ?? "").trim() || (envKey ?? "").trim()`.
  - **Why:** the env `ANTHROPIC_API_KEY` secret has been stale/invalid (returns 401 `invalid x-api-key`) while the admin-managed DB key is valid. An env-first route silently uses the bad key and 401s, while DB-first routes on the same request keep working — producing intermittent "sometimes AI key error" reports that depend on which feature ran.
  - **How to apply:** when adding/auditing any route that calls Claude, confirm DB-first. The itinerary route was the lone env-first outlier (caused the bulk of `ai:itinerary` 401s). `outdoor-today` initializes from env then explicitly overrides with the DB key — also fine. The admin "test key" tool tests a pasted key directly, unrelated.
- A shared helper for this resolution does not exist yet; precedence is duplicated per route, so it can drift again. Consider centralizing if touched.
