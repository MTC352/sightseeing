/**
 * Search-engine indexing control.
 *
 * The SAME codebase is deployed to two places:
 *   1. The Replit-published demo / staging site (must stay OUT of Google).
 *   2. The real live domain (should be indexable).
 *
 * Indexing is therefore OPT-IN: it is OFF everywhere unless `ALLOW_INDEXING`
 * is explicitly set to "true". The Replit deployment never sets it, so the
 * staging site is automatically `noindex`. Only the live-domain environment
 * sets `ALLOW_INDEXING=true`, so only it can be crawled.
 *
 * See docs/seo-indexing.md for the full runbook.
 */
export function isIndexingEnabled(): boolean {
  return process.env.ALLOW_INDEXING?.trim().toLowerCase() === "true"
}
