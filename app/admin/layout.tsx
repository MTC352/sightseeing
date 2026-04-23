"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Map, FileText, Briefcase, Tag, Bot,
  Plug, Code2, LogOut, ChevronLeft, ChevronRight, RefreshCw, Layout, HelpCircle, Ticket,
} from "lucide-react"

const PIN = "1234"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  exact?: boolean
  badge?: string
  children?: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  {
    href: "/admin/trips",
    label: "Trips",
    icon: Map,
    children: [
      { href: "/admin/taxonomies", label: "Taxonomies", icon: Tag },
    ],
  },
  { href: "/admin/blog", label: "Blog", icon: FileText },
  { href: "/admin/jobs", label: "Jobs", icon: Briefcase },
  { href: "/admin/help", label: "Help & FAQ", icon: HelpCircle },
  { href: "/admin/tickets", label: "Support Tickets", icon: Ticket },
  { href: "/admin/pages", label: "Pages", icon: Layout },
  { href: "/admin/ai-systems", label: "AI Systems", icon: Bot, badge: "Experimental" },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/header-footer", label: "Header / Footer", icon: Code2 },
  { href: "/admin/palisis", label: "Palisis Import", icon: RefreshCw },
]

function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === PIN) {
      sessionStorage.setItem("admin_auth", "true")
      onAuth()
    } else {
      setError(true)
      setPin("")
      setTimeout(() => setError(false), 1800)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={submit} className="w-full max-w-xs rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Admin Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to continue</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          className={`w-full rounded-lg border bg-background px-4 py-3 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 ${
            error ? "border-destructive focus:ring-destructive/20" : "border-border focus:ring-primary/30"
          }`}
          autoFocus
        />
        {error && <p className="mt-2 text-center text-xs text-destructive">Incorrect PIN</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Unlock
        </button>
        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">Default PIN: 1234</p>
      </form>
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    if (sessionStorage.getItem("admin_auth") === "true") setAuthed(true)
  }, [])

  if (!mounted) return null
  if (!authed) return <PinGate onAuth={() => setAuthed(true)} />

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`flex shrink-0 flex-col border-r border-border bg-card transition-all duration-200 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Logo */}
        <div
          className={`flex h-14 items-center gap-2 border-b border-border px-4 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {!collapsed && (
            <>
              <span className="text-sm font-bold text-foreground">sightseeing.lu</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                Admin
              </span>
            </>
          )}
          {collapsed && <LayoutDashboard className="h-4 w-4 text-muted-foreground" />}
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 py-3">
          {NAV.map(({ href, label, icon: Icon, exact, badge, children }) => {
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
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive || childIsActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
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
                {hasChildren && !collapsed && isExpanded && (
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
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${
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
            onClick={() => {
              sessionStorage.removeItem("admin_auth")
              setAuthed(false)
            }}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">{children}</main>
    </div>
  )
}
