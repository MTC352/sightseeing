---
name: Planner auto-pick + recommend-and-ask
description: How the deterministic auto-pick tool works and the request-scoping rule that keeps its conflict logic correct under concurrency.
---

# Planner auto-pick + recommend-and-ask

The planner AI must RECOMMEND-and-ASK, not act: a casual preference / filter
change shows ALL matching+available trips on the canvas and asks which to add.
`addToCart` fires ONLY on an explicit specific-trip request. Auto-pick is a
SEPARATE explicit action ("add the best" / "fill my day").

## autoPickTrips server tool
- Deterministic: AI only picks WHICH (mode 'one'=single best non-conflicting,
  'day'=fill day); the pure selector `lib/planner/auto-pick.ts` locks times.
- Checks REAL TourCMS timeslots (bounded fan-out) and avoids conflicts among
  picks AND with the visitor's pre-selected My Trip list.
- `keepTripIds` are locked first. If the existing list blocks all picks it
  returns `needsClear:true` → AI ASKS to clear; on yes it re-calls with
  `replaceList:true` and the client clears+re-adds.
- Server-executed tool, so the CLIENT has NO onToolCall — `app/planner/page.tsx`
  processes the tool's `output-available` part (dedupe by toolCallId) and
  addItem(addedIds) / clearList+addItem for replaceList / no-op on needsClear.
- HONESTY invariant: AI confirms ONLY `addedIds`, never claims a trip added
  unless it's in the tool result.

## Request-scoping rule (concurrency)
**The auto-pick tool is built per-request via `makeAutoPickTripsTool(ctx)`** and
closes over an immutable snapshot of THIS request's cart list / visit date /
party size. The module-level `const autoPickTripsTool` exists ONLY for
`typeof tools` inference; the real one is spread into `requestTools` at the
streamText call.

**Why:** the rest of the planner route reads module globals (`_defaultVisitDate`,
`_defaultPartySize`, `_cartItems`) at tool-execute time. Since tool executions
run async mid-stream, a concurrent planner request can overwrite those globals
before this request's tool runs — which would silently make auto-pick check
conflicts against the WRONG visitor's My Trip list. Other tools share this same
pre-existing risk; only auto-pick was scoped because its correctness/privacy
depends on the cart snapshot. A whole-route request-scoping refactor is the
proper but larger fix (out of scope when this was written).

**How to apply:** any future tool whose correctness depends on per-request cart
state should follow the same factory-closure pattern rather than reading the
`_cart*`/`_default*` globals at execute time.
