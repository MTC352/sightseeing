import type { FooterMenu, FooterGroup, FooterItem, AffiliatePageKey } from "./footer-menu-types"
import { AFFILIATE_PAGE_KEYS } from "./footer-menu-types"
import { FOOTER_MENU_DEFAULT } from "./footer-menu-default"

/** Mint a new id for admin-created groups/items. NOT used by normalize (which
 *  fills missing ids deterministically so it stays pure + testable). */
export function newId(prefix = "item"): string {
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `${prefix}-${uuid}`
}

const MAX_GROUPS = 24
const MAX_ITEMS_PER_GROUP = 60
const MAX_TEXT = 300   // label / title / id
const MAX_HREF = 2048  // href

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function normalizeItem(raw: unknown, gi: number, ii: number): FooterItem | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const label = clamp(str(r.label).trim(), MAX_TEXT)
  const href = clamp(str(r.href).trim(), MAX_HREF)
  if (!label || !href) return null
  const pageKey = AFFILIATE_PAGE_KEYS.includes(r.pageKey as AffiliatePageKey)
    ? (r.pageKey as AffiliatePageKey)
    : null
  const id = clamp(str(r.id).trim(), MAX_TEXT) || `item-${gi}-${ii}`
  const item: FooterItem = { id, label, href, pageKey }
  if (r.external != null) item.external = !!r.external
  if (r.hidden != null) item.hidden = !!r.hidden
  return item
}

function normalizeGroup(raw: unknown, gi: number): FooterGroup | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const title = clamp(str(r.title).trim(), MAX_TEXT)
  const rawItems = Array.isArray(r.items) ? r.items : []
  const items = rawItems
    .slice(0, MAX_ITEMS_PER_GROUP)
    .map((it, ii) => normalizeItem(it, gi, ii))
    .filter((it): it is FooterItem => it !== null)
  if (items.length === 0) return null // drop empty groups
  const id = clamp(str(r.id).trim(), MAX_TEXT) || `group-${gi}`
  return { id, title: title || `Group ${gi + 1}`, items }
}

/** Coerce any untrusted value into a valid FooterMenu. Unusable → default. */
export function normalizeFooterMenu(raw: unknown): FooterMenu {
  if (!raw || typeof raw !== "object") return FOOTER_MENU_DEFAULT
  const groupsRaw = (raw as Record<string, unknown>).groups
  if (!Array.isArray(groupsRaw)) return FOOTER_MENU_DEFAULT
  const groups = groupsRaw
    .slice(0, MAX_GROUPS)
    .map((g, gi) => normalizeGroup(g, gi))
    .filter((g): g is FooterGroup => g !== null)
  if (groups.length === 0) return FOOTER_MENU_DEFAULT
  return { groups }
}
