---
name: SEO score staleness vs recompute
description: Why an optimized trip's SEO score doesn't change on content edits, and where the persisted score is kept honest.
---

# SEO score: two distinct concepts

The 21-check SEO score is computed from the **effective SEO fields** (`seo_*` columns,
falling back to base trip content when a field is empty) — NOT from base content
directly. For an optimized trip the `seo_*` columns are frozen at optimization time, so
**editing base content (title/description/etc.) does NOT move the score number**.

Two separate signals, do not conflate them:
- **Score** = quality of the current effective SEO fields (always recomputable, deterministic).
- **Staleness** = source content drifted from what the SEO text was written for. Tracked
  via `seo_source_hashes` snapshot (`computeStaleness`/`computeSourceHashes` in
  `lib/seo/score.ts`). Surfaced as an amber "Outdated"/"SEO stale" badge in the optimizer
  header and the trips list.

**Why:** users expected the score to "reflect latest content." It can't fully, because
re-writing SEO text requires the AI optimizer. So: auto-recompute the deterministic score,
and clearly mark the optimization as outdated — never silently refresh the hash snapshot
(that would hide that re-optimization is needed).

## How to apply
- Shared pure helpers `liveSeoFieldsFromTrip(trip)` + `liveScoreForTrip(trip)` in
  `lib/seo/score.ts` are the single source of truth for the effective-field precedence
  (prefer `seo_*`, fall back to base; empty `seoHighlights` only falls back when null).
  Use them anywhere the score is recomputed server-side so it matches the optimizer widget.
- `PATCH /api/admin/trips/[id]` recomputes & persists `seo_score` (via `liveScoreForTrip`)
  after any update to an optimized trip (catches image/highlights/slug changes). It must
  NOT touch `seo_source_hashes` — that preserves staleness detection.
- Only the `/api/admin/trips/[id]/seo` (AI optimize) path refreshes the hash snapshot.
- UI copy must say the SEO **text** is stale ("re-run AI to refresh"), not that the score
  is wrong — the displayed score is always current.
