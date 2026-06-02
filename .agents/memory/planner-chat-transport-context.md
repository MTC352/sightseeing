---
name: Planner chat transport context
description: Why planner chat prefs + My Trip list must be ref-backed, and how manual changes get mirrored into chat.
---

# Planner chat transport context (page.tsx + api/planner/route.ts)

The planner chat uses a single `DefaultChatTransport` (Vercel AI SDK `useChat`).
The transport is created ONCE with `useMemo(..., [])` — recreating it
mid-conversation breaks the in-flight stream.

**Rule:** every value the chat must send per-turn (`preferences`, `cartItems` =
the working "My Trip" list summary, itinerary summary) MUST be read from refs
inside `prepareSendMessagesRequest`, never from closure values.

**Why:** with `[prefs, cartSummary]` deps the transport recreated on every change
(breaking streams) AND/OR captured stale closure values — so the AI saw an empty
cart / old date even after the user manually added trips or changed the date. The
classic symptom was the AI replying "your cart is empty" while trips were listed,
or inventing a new trip on a different date and silently overwriting the itinerary.

**How to apply:**
- Keep `prefsForApiRef` / `cartSummaryForApiRef` / `itineraryForApiRef` mirrored
  via `useEffect`, AND update them synchronously at mutation time (in
  `applyDirectPref` and `handleManualAddTrip`) so a send in the same tick as a
  click already carries the change.
- Server side, the system prompt labels the cart as **MY TRIP LIST** (with an
  explicit empty state) and RULE 11 makes MY TRIP LIST + VISIT DATE authoritative:
  build from exactly those trips/date, never invent trips, never silently
  overwrite an open Day Itinerary (confirm first), always trust the latest values.

**Manual-change chat notes:** `notifyChat(text, idPrefix)` (declared before
`applyDirectPref` to avoid TDZ; uses `setMessagesRef`) pushes concise assistant
notes for MANUAL actions only — pref/date changes via `applyDirectPref`, and adds
via `handleManualAddTrip` (canvas card `onAdd` + detail modal `onBook`). AI-driven
adds keep using raw `addItem` so they don't double-announce. De-dupes identical
back-to-back notes.
