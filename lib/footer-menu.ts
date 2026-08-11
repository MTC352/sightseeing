import { dbGetFooterMenu } from "@/lib/db/queries"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"
import type { FooterMenu, AffiliatePageKey } from "@/lib/footer-menu-types"

/** Raw resolved menu (DB doc or code default). Never throws. */
export async function getFooterMenu(): Promise<FooterMenu> {
  try {
    return (await dbGetFooterMenu()) ?? FOOTER_MENU_DEFAULT
  } catch {
    return FOOTER_MENU_DEFAULT
  }
}

/** Menu as it renders in the footer. Hidden items (and any group left empty by
 *  the filter) are stripped for everyone, including logged-in admins, so the
 *  footer always matches what the public sees. */
export async function getViewerFooterMenu(): Promise<FooterMenu> {
  const menu = await getFooterMenu()
  const groups = menu.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) }))
    .filter((g) => g.items.length > 0)
  return { groups }
}

/** True when the affiliate page for `pageKey` is hidden. Applies to everyone,
 *  including logged-in admins — no admin bypass. Fail-open: never hide on a
 *  read error. */
export async function isAffiliatePageHidden(pageKey: AffiliatePageKey): Promise<boolean> {
  try {
    const menu = await getFooterMenu()
    const item = menu.groups.flatMap((g) => g.items).find((i) => i.pageKey === pageKey)
    return !!item?.hidden
  } catch {
    return false
  }
}
