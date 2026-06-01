---
name: Help page data source & duplicate prevention
description: Where /help articles come from, how its UI hides articles, and why duplicates appeared.
---

# /help page

- The public Help Center (`app/help/page.tsx`) reads articles **from the DB** via
  `dbListHelpArticles("public")` and passes them to `HelpClient`. It does NOT use a
  hardcoded `FAQ_DATA` array. (replit.md's "Known Remaining Items" claim that HelpClient
  still uses hardcoded FAQ_DATA is stale/inaccurate — the DB is the live source.)

- `help_articles` rows carry an `audience` column: `public` rows render on `/help`,
  `admin` rows are admin tutorials shown elsewhere. A question may exist once per audience.

## UI layout gotcha (matters for automated testing)
- `/help` default view is a **"Browse by Category" card grid** — individual article
  questions are NOT all on the page at once. They appear only after clicking into a
  category OR typing in the search box.
- **To verify articles via a Playwright test, use the search box** (placeholder
  "Search for answers...") and assert on the "Found N result(s)" indicator. A
  whole-page text scan will miss articles in unopened categories and give false failures.

## Duplicate root cause & prevention
- Duplicates came from **re-running seed scripts** (`scripts/seed-db.mjs`,
  `scripts/seed-admin-help.mjs`) whose help inserts had no guard — each run appended
  another full copy (17 public FAQs went 1→3 copies).
- **Why:** plain `INSERT ... VALUES` with no uniqueness check; seeds are run manually
  more than once.
- **How to apply:** both seed inserts are now `INSERT ... SELECT ... WHERE NOT EXISTS`
  keyed on `(question, category)`. There is **no DB-level unique constraint** on
  help_articles, so prevention relies on script/app behavior. If hardening further, add
  a unique index on `(audience, category, question)` and align any dedup SQL to the same key.
