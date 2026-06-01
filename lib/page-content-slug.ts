/**
 * Single bucket slug under which all inline ("?admin_edit=1") page edits are
 * stored in the `page_content` table. The keys themselves (e.g.
 * "home:hero:headline" or "auto:/careers:div:0>h1:0") are globally unique and
 * already encode their page, so one bucket keeps reads to a single query.
 */
export const INLINE_CONTENT_SLUG = "__inline__"
