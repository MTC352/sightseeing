# SEO Indexing Guide — Staging vs. Live

This project runs the **same codebase** in two places:

| Environment | Where | Should Google index it? |
|---|---|---|
| **Staging / demo** | Replit Publish (`*.replit.app`) | **NO — must stay hidden** |
| **Live** | The real production domain (separate setup) | **YES** |

Our release flow is: build & verify on **staging first**, then push the feature to
**live**. So the published Replit site must always be `noindex`, and only the live
domain is allowed into Google.

---

## How it works

Indexing is **opt-in**. It is OFF everywhere unless a single environment variable is
explicitly turned on:

```
ALLOW_INDEXING=true
```

- **Not set / anything other than `true`** → the site is `noindex` and `robots.txt`
  blocks every crawler. This is the default, so the Replit-published staging site is
  automatically hidden from Google with zero configuration.
- **`ALLOW_INDEXING=true`** → the site is indexable: full `robots.txt` allow-list and
  `index, follow` meta tags.

The logic lives in `lib/seo.ts` (`isIndexingEnabled()`) and feeds two places:

1. **`app/layout.tsx`** — the `robots` metadata block emits
   `<meta name="robots" content="noindex, nofollow">` when indexing is off, or
   `index, follow` when on.
2. **`app/robots.ts`** — serves `Disallow: /` for all user agents when indexing is off,
   or the full crawler allow-list (including AI crawlers) + sitemap when on.

Both must agree, which is why they share the same `isIndexingEnabled()` check.

---

## Staging (Replit Publish) — keep it hidden

**Do nothing.** Because `ALLOW_INDEXING` is not set on the Replit deployment, the
published site is already `noindex` and `robots.txt` returns `Disallow: /`.

> ⚠️ Never set `ALLOW_INDEXING=true` on the Replit deployment. That would expose the
> staging copy to Google and create duplicate-content competition with the live site.

### Verify staging is hidden
After publishing, open these on the `*.replit.app` URL:

- `https://<your-app>.replit.app/robots.txt` → should show:
  ```
  User-Agent: *
  Disallow: /
  ```
- View page source on the homepage → `<head>` should contain:
  ```html
  <meta name="robots" content="noindex, nofollow, nocache">
  ```

---

## Live domain — turn indexing ON

On the **live** hosting setup (the separate production environment, *not* Replit
Publish), set the environment variable:

```
ALLOW_INDEXING=true
```

Also confirm the canonical URL is correct so meta tags, canonical links, and the
sitemap point at the live domain:

```
NEXT_PUBLIC_SITE_URL=https://your-live-domain.com
```

Then rebuild / redeploy the live site for the change to take effect.

### Verify live is indexable
On the live domain:

- `https://your-live-domain.com/robots.txt` → should list `Allow: /`, the AI-crawler
  rules, and `Sitemap: https://your-live-domain.com/sitemap.xml`.
- Homepage source `<head>` → `<meta name="robots" content="index, follow">`.

### After go-live (one-time)
1. Add the live domain to **Google Search Console** and verify ownership.
2. Submit `https://your-live-domain.com/sitemap.xml`.
3. Use **URL Inspection → Request Indexing** on the homepage to speed up first crawl.

---

## Quick reference

| Goal | `ALLOW_INDEXING` | Result |
|---|---|---|
| Hide staging (Replit) | unset (default) | `noindex` + `Disallow: /` |
| Index live domain | `true` | `index, follow` + full `robots.txt` |

> If a page must stay private even on the live site (e.g. `/api/planner`, `/my-trips`),
> add it to the `disallow` list in `app/robots.ts`.
