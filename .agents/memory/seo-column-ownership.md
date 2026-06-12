---
name: SEO column ownership boundary
description: Which route may write the seo_* trip columns, and why the trip PATCH must strip them.
---

# SEO columns are owned ONLY by the /seo route

The `seo_*` trip columns (keyword, title, meta, body, highlights, slug, score,
optimized_at, optimized_by, source_hashes) are written **exclusively** by
`POST /api/admin/trips/[id]/seo` (the AI optimizer Accept & Save + Quick SEO).

The general trip PATCH (`/api/admin/trips/[id]`) MUST strip every SEO-owned key
from its incoming body before writing.

**Why:** the trip edit form (`trip-edit-form.tsx`) does `payload = { ...form }`,
and `form` is seeded once at mount — so after an "Optimize SEO via AI → Accept &
Save" it still carries the STALE pre-optimize (usually null) seo_* values. If the
PATCH lets them through, saving the trip form clobbers the freshly-persisted SEO
(symptom: list shows "No SEO", trip detail shows old data). `seo_*` are not in
`TRIP_FIELDS`, so `filterByPolicy` did NOT strip them — the explicit strip in the
PATCH handler is the guard.

**How to apply:** if you add a new `seo_*` column, add it to the strip list in the
trip PATCH route. Keep `/seo` as the single SEO write path. The PATCH still
recomputes `seo_score` server-side for already-optimized trips — that's fine.
