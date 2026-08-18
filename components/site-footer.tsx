import { Link } from "@/components/i18n/link"
import Image from "next/image"
import { MapPin, Mail, Phone } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import { CookieSettingsButton } from "@/components/cookie-banner"
import { dbGetContactInfo } from "@/lib/db/queries"
import { getViewerFooterMenu } from "@/lib/footer-menu"

export async function SiteFooter() {
  const contact = await dbGetContactInfo().catch(() => ({
    address: "430-434 route de Longwy, L-1940 Luxembourg",
    email: "hello@sightseeing.lu",
    phone: "+352 266 51 2200",
  }))
  const menu = await getViewerFooterMenu()

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Image src="/images/logo.png" alt="sightseeing.lu" width={140} height={32} className="h-7 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              <EditableText id="footer:brand:tagline" defaultValue="Handpicked experiences in and around Luxembourg, guided by passionate locals." multiline />
            </p>
            <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> <EditableText id="footer:contact:address" defaultValue={contact.address} /></span>
              <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> <a href={`mailto:${contact.email}`} className="transition-colors hover:text-primary"><EditableText id="footer:contact:email" defaultValue={contact.email} /></a></span>
              <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="transition-colors hover:text-primary"><EditableText id="footer:contact:phone" defaultValue={contact.phone} /></a></span>
            </div>
          </div>
          {menu.groups.map((group) => (
            <nav key={group.id} aria-label={group.title}>
              <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.id}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-primary">{item.label}</a>
                    ) : (
                      <Link href={item.href} className="text-xs text-muted-foreground transition-colors hover:text-primary">{item.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} sightseeing.lu S.à r.l. — All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              <a href="https://www.slg.lu/politique-de-confidentialite/" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-primary">Privacy Policy</a>
              <Link href="/impressum" className="text-xs text-muted-foreground transition-colors hover:text-primary">Legal Notice</Link>
              <CookieSettingsButton />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
