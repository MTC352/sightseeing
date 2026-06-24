---
name: Planner availability grounding parity
description: AI-grounding signals must use the same availability source the visible canvas renders from, or chat and canvas disagree.
---

# Planner availability grounding parity

`/planner` has two client availability maps: the client's own whole-catalog scan, and
an "effective" map that merges the AI's per-trip `searchTrips` output over it (only when
the AI has pinned trips tagged for the current visit date; otherwise the two are equal).

**Rule:** every signal the AI quotes about the canvas (counts, sample titles, on-date vs
other-date splits, displayed titles) MUST derive from the SAME effective map the visible
grouping uses — never the raw client scan. The one exception is the raw whole-catalog
snapshot sent to the server: merging AI output back into it would be circular
(AI → client → server → AI), so it stays on the plain client scan.

**Why:** the server now does a fresh scan by default, but the client still sends a "what
the visitor sees" count to ground narration. If grounding reads the plain scan while the
canvas renders the effective map, the AI can state a number that diverges from the canvas
in the stale-client/fresh-AI case — breaking the chat↔canvas-agree invariant. The
effective map is a strict superset (only adds same-date AI overrides), so it's safe.

**How to apply:** any new AI-grounding signal derived from per-trip availability keys off
the effective map (and adds it to the deps), not the raw scan.

## Related caveat — module-global per-request tool state
The planner route keeps per-request tool inputs (default visit date/party, the scan
snapshot, and its date) in MODULE globals that the search tool reads at execution time.
Two consequences: (1) any date-gated grounding/annotation must compare against the
EFFECTIVE date for THAT tool call (the explicit date arg when valid, else the stored
date) — gating on the stored date alone silently drops annotation when the AI asks about
a different date mid-turn; (2) it carries a theoretical cross-request contamination risk
under concurrency. The real fix is request-scoped tool factories — a larger refactor not
done as part of availability-sync work.
