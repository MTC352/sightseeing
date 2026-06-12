---
name: Blog publish scheduling & draft visibility
description: How blog draft/scheduled posts are hidden publicly while admins can preview; the shared visibility gate.
---

Blog posts are publicly live ONLY when `status='published' AND (published_at IS NULL OR published_at <= NOW())`. Drafts and future-scheduled posts (published with future `published_at`) are hidden from the public list, the sitemap, AND direct URLs. A logged-in admin (any valid `admin_session`) can preview non-live posts via the direct `/blog/[slug]` URL and sees an amber "Admin preview" banner.

**Why:** product requirement — schedule posts for the future and never leak drafts to the public, but let admins preview via a shareable link.

**How to apply:**
- The gate lives in ONE place at the DB layer: `POST_PUBLIC_GATE` in `lib/db/queries.ts`. Every public post read MUST route through `dbListPublicPosts()` (list/sitemap) or `dbGetPostBySlug()` (single). `dbListPosts()` (all rows) is admin/internal only; `dbGetPostBySlugAny()` bypasses the gate and is ONLY for the admin-preview path after an auth check.
- `app/blog/[slug]/page.tsx` mirrors the SQL gate as `isPostLive(post)`. If you change the gate semantics, change BOTH the SQL predicate and `isPostLive` or they drift.
- Non-live single page: JSON-LD + canonical are emitted only when live; non-live metadata is `noindex` (admin preview) or generic not-found (anon).
- Admin edit form (`post-edit-form.tsx`): `publishedAt` is a `datetime-local` input normalized to ISO via `new Date(value).toISOString()` on save (the timestamptz column needs a real instant, not a naive local string). Top bar has "Copy link" + "View on site" buttons shown only when the post exists/has a slug.

**Gotcha:** `notFound()` on these `force-dynamic` streamed routes renders the correct 404 *content* but can return HTTP 200 in dev (Next streaming can't set status after the stream starts — same family as the redirect-streaming issue). Content is still hidden, so test by asserting page content (absence of body text), not the status code.
