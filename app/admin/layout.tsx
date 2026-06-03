"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { AdminStoreProvider } from "@/components/providers/admin-store-provider"
import {
  LayoutDashboard, Map, FileText, Briefcase, Bot,
  Plug, Code2, LogOut, ChevronLeft, ChevronRight, RefreshCw, Layout, HelpCircle, Ticket, CheckSquare, Archive, Settings, Tag, ExternalLink, BookOpen, Users, FolderOpen, Activity, Menu, X,
} from "lucide-react"
import { FULL_ACCESS_ROLE, type PermissionKey } from "@/lib/admin-permissions"
import { cn } from "@/lib/utils"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  badge?: string
  perm?: PermissionKey
  superadminOnly?: boolean
  children?: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    href: "/admin/trips",
    label: "Trips",
    icon: Map,
    perm: "trips",
    children: [
      { href: "/admin/trips/archived", label: "Archived", icon: Archive },
      { href: "/admin/trip-tags", label: "Trip Tags", icon: Tag },
    ],
  },
  { href: "/admin/blog", label: "Blog", icon: FileText, perm: "blog" },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase, perm: "jobs" },
  { href: "/admin/help", label: "Help & FAQ", icon: HelpCircle, perm: "help" },
  { href: "/admin/tickets", label: "Support Tickets", icon: Ticket, perm: "tickets" },
  { href: "/admin/pages", label: "Pages", icon: Layout, perm: "pages" },
  { href: "/admin/files", label: "Files", icon: FolderOpen, perm: "files" },
  { href: "/admin/ai-systems", label: "AI Systems", icon: Bot, badge: "Experimental", perm: "ai-systems" },
  { href: "/admin/integrations", label: "Admin Settings", icon: Plug, perm: "integrations" },
  { href: "/admin/header-footer", label: "Header / Footer", icon: Code2, perm: "header-footer" },
  { href: "/admin/palisis", label: "Palisis Import", icon: RefreshCw, perm: "palisis" },
  { href: "/admin/implementation", label: "DB Tracker", icon: CheckSquare, perm: "implementation" },
  { href: "/admin/docs", label: "Documentation", icon: BookOpen, perm: "docs" },
  { href: "/admin/activity", label: "Recent Activity", icon: Activity, superadminOnly: true },
  { href: "/admin/users", label: "User Management", icon: Users, superadminOnly: true },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string>("")
  const [permissions, setPermissions] = useState<string[]>([])

  const isLoginPage = pathname === "/admin/login" || pathname.startsWith("/admin/login/")

  useEffect(() => {
    setMounted(true)
    if (isLoginPage) return
    fetch("/api/admin/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const me = await res.json().catch(() => null)
          setRole(me?.role ?? "")
          setPermissions(Array.isArray(me?.permissions) ? me.permissions : [])
          setAuthed(true)
        } else {
          router.replace(`/admin/login?redirect=${encodeURIComponent(pathname)}`)
        }
      })
      .catch(() => {
        router.replace("/admin/login")
      })
  }, [pathname, router, isLoginPage])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // The collapse rail only applies on desktop; on mobile the drawer always
  // renders full labels regardless of the persisted desktop collapse state.
  const effectiveCollapsed = isDesktop && collapsed

  const isSuperadmin = role === FULL_ACCESS_ROLE
  const visibleNav = NAV.filter((item) => {
    if (isSuperadmin) return true
    if (item.superadminOnly) return false
    if (!item.perm) return true // e.g. Dashboard — always visible
    return permissions.includes(item.perm)
  })

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" })
    router.replace("/admin/login")
  }

  // Login page renders without the admin shell
  if (!mounted) return null
  if (isLoginPage) return <>{children}</>
  if (!authed) return null

  return (
    <AdminStoreProvider>
    <div className="fixed inset-0 flex h-screen overflow-hidden bg-background">
      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Sidebar — overlay drawer on mobile, static push column on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 max-w-[82vw] shrink-0 flex-col border-r border-border bg-card transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:max-w-none md:translate-x-0 md:transition-all",
          effectiveCollapsed ? "md:w-14" : "md:w-56",
        )}
      >
        {/* Logo */}
        <div
          className={`flex h-14 items-center gap-2 border-b border-border px-4 ${
            effectiveCollapsed ? "md:justify-center" : ""
          }`}
        >
          {!effectiveCollapsed && (
            <>
              <span className="text-sm font-bold text-foreground">sightseeing.lu</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                  isSuperadmin ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {isSuperadmin ? "Admin" : "Employee"}
              </span>
            </>
          )}
          {effectiveCollapsed && <LayoutDashboard className="hidden h-4 w-4 text-muted-foreground md:block" />}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Visit Site — opens public homepage in the same tab */}
        <div className="border-b border-border p-2">
          <Link
            href="/"
            title={effectiveCollapsed ? "Visit Site" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 ${
              effectiveCollapsed ? "justify-center" : ""
            }`}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {!effectiveCollapsed && <span className="flex-1">Visit Site</span>}
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 py-3">
          {visibleNav.map(({ href, label, icon: Icon, exact, badge, children }) => {
            const isActive = exact
              ? pathname === href
              : href !== "/admin" && pathname.startsWith(href)
            const hasChildren = children && children.length > 0
            const childIsActive = hasChildren && children.some((c) => pathname.startsWith(c.href))
            const isExpanded = isActive || childIsActive

            return (
              <div key={href}>
                <Link
                  href={href}
                  title={effectiveCollapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive || childIsActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  } ${effectiveCollapsed ? "justify-center" : ""}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!effectiveCollapsed && (
                    <>
                      <span className="flex-1">{label}</span>
                      {badge && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>

                {/* Submenu */}
                {hasChildren && !effectiveCollapsed && isExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {children.map(({ href: childHref, label: childLabel, icon: ChildIcon }) => {
                      const childActive = pathname.startsWith(childHref)
                      return (
                        <Link
                          key={childHref}
                          href={childHref}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                            childActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`}
                        >
                          <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                          {childLabel}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="space-y-0.5 border-t border-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className={`hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive ${
              effectiveCollapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-4 w-4" />
            {!effectiveCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar with hamburger */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-foreground">sightseeing.lu</span>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
    </AdminStoreProvider>
  )
}
