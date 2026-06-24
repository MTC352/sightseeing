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

## Relative-date resolution is DETERMINISTIC client-side, not the model's job
The planner model (gpt-4o-mini) reliably mis-computes calendar dates from natural
language (e.g. "friday" → the wrong day). **Fix pattern:** the model only passes a
semantic TOKEN (`updatePreferences.relativeDate` enum: today/tomorrow/weekday/
this-weekend/next-weekend) and the CLIENT resolves it to a concrete YYYY-MM-DD via
`resolveRelativeDate()` in `lib/planner/relative-date.ts` (Intl `en-CA`,
TZ=Europe/Luxembourg so it never drifts with the visitor's browser; weekday = next
occurrence, today counts). The resolved token WINS over any `startDate` the model also
sends, on every write path (onToolCall + chat-history recovery merge).

**Why:** removing the model from date arithmetic is the only thing that makes dates
correct across model swaps; prompt instructions to "compute the date" do not hold.

**How to apply:** keep `lib/planner/relative-date.ts` in lockstep with the server's
`nextWeekday` logic in `app/api/planner/route.ts` (same next-occurrence + weekend
semantics). The resolver takes an injectable `now` purely for unit tests
(`test/planner/relative-date.test.mjs`).

## Loaders: ONE stable chat indicator, no per-tool transient loaders
The chat must show a single "thinking dots" bubble (rendered when the streaming
assistant message has no visible text yet) plus the separate Trip Canvas overlay.
Per-tool transient text loaders ("Updating results…", etc. on searchTrips/
getTripDetails/timeslots/datesAndDeals/cart) flash on/off as each tool resolves and
must NOT be reintroduced. Keep tool OUTPUT cards and the buildItinerary loader.

## Related caveat — module-global per-request tool state
The planner route keeps per-request tool inputs (default visit date/party, the scan
snapshot, and its date) in MODULE globals that the search tool reads at execution time.
Two consequences: (1) any date-gated grounding/annotation must compare against the
EFFECTIVE date for THAT tool call (the explicit date arg when valid, else the stored
date) — gating on the stored date alone silently drops annotation when the AI asks about
a different date mid-turn; (2) it carries a theoretical cross-request contamination risk
under concurrency. The real fix is request-scoped tool factories — a larger refactor not
done as part of availability-sync work.
