import { getSession } from "@/lib/auth"
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

async function viewerIsAdmin(): Promise<boolean> {
  const session = await getSession().catch(() => null)
  return !!session
}

/** Menu as the current viewer should see it. Admins see hidden items (preview);
 *  the public has hidden items (and emptied groups) stripped. */
export async function getViewerFooterMenu(): Promise<FooterMenu> {
  const menu = await getFooterMenu()
  if (await viewerIsAdmin()) return menu
  const groups = menu.groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) }))
    .filter((g) => g.items.length > 0)
  return { groups }
}

/** True when the affiliate page for `pageKey` is hidden from the public. Admins
 *  bypass (preview). Fail-open: never hide on a read error. */
export async function isAffiliatePageHidden(pageKey: AffiliatePageKey): Promise<boolean> {
  try {
    const menu = await getFooterMenu()
    const item = menu.groups.flatMap((g) => g.items).find((i) => i.pageKey === pageKey)
    if (!item?.hidden) return false
    return !(await viewerIsAdmin())
  } catch {
    return false
  }
}
