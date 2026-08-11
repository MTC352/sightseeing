export type AffiliatePageKey = "travel" | "flights" | "trains" | "cars" | "hotels"

export const AFFILIATE_PAGE_KEYS: AffiliatePageKey[] = ["travel", "flights", "trains", "cars", "hotels"]

export interface FooterItem {
  id: string
  label: string
  href: string
  external?: boolean
  hidden?: boolean
  /** Set only on the 5 seeded affiliate items; null everywhere else. Not admin-editable. */
  pageKey?: AffiliatePageKey | null
}

export interface FooterGroup {
  id: string
  title: string
  items: FooterItem[]
}

export interface FooterMenu {
  groups: FooterGroup[]
}
