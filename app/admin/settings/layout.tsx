"use client"

/**
 * /admin/settings — tabbed settings hub.
 *
 * Each child route is a tab. Add a new tab by:
 *  1. creating `app/admin/settings/<slug>/page.tsx`
 *  2. adding an entry to TABS below
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings as SettingsIcon, Sliders } from "lucide-react"

const TABS = [
  { href: "/admin/settings/trips", label: "Trip Field Editability", icon: Sliders },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto max-w-5xl">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-secondary p-2">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Configure how the back-office and trip data behave.</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1" aria-label="Settings tabs">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/")
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>{children}</div>
    </div>
  )
}
