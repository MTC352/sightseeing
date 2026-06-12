---
name: Markdown link URL protection + blog trip-link slugs
description: Why lib/markdown.ts must shield link hrefs from emphasis, and how blog bodies normalize /trip links to slugs.
---

# Markdown link-URL corruption + blog trip-link slug normalization

**Rule 1 — `lib/markdown.ts` `inline()` must NOT run emphasis/code regexes over link URLs.**
It converts `[text](url)` first, so the emphasis passes (`_x_`→`<em>`, `*x*`, `` `x` ``)
that follow will otherwise rewrite characters *inside* the href. Underscores are the
killer: with two links on one line (e.g. `/trip/tcms_5` … `/trip/tcms_13`) the `_`
markers pair up **across the two anchors**, producing mangled hrefs like
`/trip/tcms<em>5`. Fix in place: stash each URL behind an opaque `\u0000U<n>\u0000`
token before the emphasis/code passes, restore after. Link *text* still flows through
emphasis, so `[**bold**](url)` keeps working.
**Why:** real bug — AI blog posts put 2 trip links per sentence; bodies are stored as
Markdown, so the corruption only happened at render. Any future inline-Markdown change
must preserve URL isolation.

**Rule 2 — public blog bodies normalize in-body trip links to the trip's slug.**
`lib/blog-trip-links.ts` (`buildTripSlugMap` + `rewriteTripLinksToSlugs`) maps
`/trip/<id|palisis_id|slug>` → `/trip/<slug>` at render in `app/blog/[slug]/page.tsx`.
A squashed alphanumeric-only lookup key lets legacy-mangled hrefs be recovered.
**How to apply:** the rewrite must run on the raw HTML **before** `sanitizeRichText`
(sanitize stays the final XSS gate and re-validates the rewritten relative href) — if
it runs after sanitize, a malformed `<em>`-in-attribute href is already destroyed and
can't be recovered. Generation (`app/api/admin/generate-blog/route.ts`) emits
`/trip/<slug>` in the AI catalog so new posts store slug URLs at the source.
