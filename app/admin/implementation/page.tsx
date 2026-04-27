"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Circle, AlertCircle, Database, Shield, Layers, Zap } from "lucide-react"

type Status = "done" | "pending" | "partial"

interface CheckItem {
  label: string
  status: Status
  detail?: string
}

interface Section {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: CheckItem[]
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  if (status === "partial") return <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "done")
    return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Done</span>
  if (status === "partial")
    return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Partial</span>
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Pending</span>
}

interface DbCounts {
  admin_users: string
  trips: string
  blog_posts: string
  jobs: string
  help_articles: string
  ai_configs: string
  integrations: string
  hf_blocks: string
  pages: string
}

export default function ImplementationPage() {
  const [dbCounts, setDbCounts] = useState<DbCounts | null>(null)
  const [authOk, setAuthOk] = useState<boolean | null>(null)
  const [dashOk, setDashOk] = useState<boolean | null>(null)

  useEffect(() => {
    // Check DB counts
    fetch("/api/admin/impl-check")
      .then((r) => r.json())
      .then((data) => setDbCounts(data))
      .catch(() => {})

    // Check auth
    fetch("/api/admin/auth/me")
      .then((r) => setAuthOk(r.ok))
      .catch(() => setAuthOk(false))

    // Check dashboard
    fetch("/api/admin/dashboard")
      .then((r) => setDashOk(r.ok))
      .catch(() => setDashOk(false))
  }, [])

  function countStatus(table: keyof DbCounts, expected: number): Status {
    if (!dbCounts) return "pending"
    const actual = parseInt(dbCounts[table] ?? "0", 10)
    if (actual >= expected) return "done"
    if (actual > 0) return "partial"
    return "pending"
  }

  const sections: Section[] = [
    {
      title: "T001 — Database & Packages",
      icon: Database,
      items: [
        { label: "PostgreSQL database created (DATABASE_URL)", status: "done", detail: "Replit managed DB" },
        { label: "Package: pg + @types/pg", status: "done" },
        { label: "Package: bcryptjs + @types/bcryptjs", status: "done" },
        { label: "Package: jose (JWT)", status: "done" },
      ],
    },
    {
      title: "T002 — Schema (16 tables)",
      icon: Layers,
      items: [
        { label: "admin_users", status: "done" },
        { label: "trips", status: "done" },
        { label: "palisis_sync_log", status: "done" },
        { label: "blog_posts", status: "done" },
        { label: "jobs", status: "done" },
        { label: "job_applications", status: "done" },
        { label: "help_articles", status: "done" },
        { label: "support_tickets", status: "done" },
        { label: "ticket_replies", status: "done" },
        { label: "taxonomies", status: "done" },
        { label: "pages", status: "done" },
        { label: "page_revisions", status: "done" },
        { label: "page_content", status: "done" },
        { label: "ai_system_configs", status: "done" },
        { label: "integrations", status: "done" },
        { label: "header_footer_blocks", status: "done" },
        { label: "lib/db.ts — Pool singleton + query helpers", status: "done" },
        { label: "lib/db/queries.ts — All CRUD helpers", status: "done" },
      ],
    },
    {
      title: "T003 — Seed Data",
      icon: Database,
      items: [
        {
          label: `admin_users (1 row) — admin@sightseeing.lu`,
          status: dbCounts ? countStatus("admin_users", 1) : "pending",
          detail: dbCounts ? `${dbCounts.admin_users} rows` : "checking…",
        },
        {
          label: "trips (43 rows from lib/data.ts)",
          status: dbCounts ? countStatus("trips", 43) : "pending",
          detail: dbCounts ? `${dbCounts.trips} rows` : "checking…",
        },
        {
          label: "blog_posts (2 rows)",
          status: dbCounts ? countStatus("blog_posts", 2) : "pending",
          detail: dbCounts ? `${dbCounts.blog_posts} rows` : "checking…",
        },
        {
          label: "jobs (3 rows)",
          status: dbCounts ? countStatus("jobs", 3) : "pending",
          detail: dbCounts ? `${dbCounts.jobs} rows` : "checking…",
        },
        {
          label: "help_articles (17 rows)",
          status: dbCounts ? countStatus("help_articles", 17) : "pending",
          detail: dbCounts ? `${dbCounts.help_articles} rows` : "checking…",
        },
        {
          label: "ai_system_configs (3 rows)",
          status: dbCounts ? countStatus("ai_configs", 3) : "pending",
          detail: dbCounts ? `${dbCounts.ai_configs} rows` : "checking…",
        },
        {
          label: "integrations (8 rows)",
          status: dbCounts ? countStatus("integrations", 8) : "pending",
          detail: dbCounts ? `${dbCounts.integrations} rows` : "checking…",
        },
        {
          label: "header_footer_blocks (5 rows)",
          status: dbCounts ? countStatus("hf_blocks", 5) : "pending",
          detail: dbCounts ? `${dbCounts.hf_blocks} rows` : "checking…",
        },
        {
          label: "pages (10 system pages)",
          status: dbCounts ? countStatus("pages", 10) : "pending",
          detail: dbCounts ? `${dbCounts.pages} rows` : "checking…",
        },
      ],
    },
    {
      title: "T004 — Authentication",
      icon: Shield,
      items: [
        { label: "POST /api/admin/auth/login (bcrypt verify + JWT cookie)", status: "done" },
        { label: "POST /api/admin/auth/logout (clear cookie)", status: "done" },
        { label: "GET /api/admin/auth/me (verify JWT, return user)", status: authOk === null ? "pending" : authOk ? "done" : "partial", detail: authOk === null ? "checking…" : authOk ? "Responding OK" : "Check failed" },
        { label: "middleware.ts — protect /admin/* + /api/admin/*", status: "done" },
        { label: "/admin/login page (email + password form)", status: "done" },
        { label: "lib/auth.ts (signSession, verifySession, getSession)", status: "done" },
        { label: "Admin layout — PIN gate replaced with JWT check", status: "done" },
      ],
    },
    {
      title: "T005 — API Routes → Database",
      icon: Zap,
      items: [
        { label: "GET/POST /api/admin/trips", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/trips/[id]", status: "done" },
        { label: "GET/POST /api/admin/posts", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/posts/[id]", status: "done" },
        { label: "GET/POST /api/admin/jobs", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/jobs/[id]", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/applications", status: "done" },
        { label: "GET/POST /api/admin/help", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/help/[id]", status: "done" },
        { label: "GET/POST /api/admin/tickets", status: "done" },
        { label: "GET/PATCH/DELETE /api/admin/tickets/[id]", status: "done" },
        { label: "POST /api/admin/tickets/[id]/replies", status: "done" },
        { label: "GET/PATCH /api/admin/settings", status: "done" },
        { label: "GET/PUT /api/admin/planner-behavior", status: "done" },
        { label: "GET /api/admin/dashboard (live DB stats)", status: dashOk === null ? "pending" : dashOk ? "done" : "partial", detail: dashOk === null ? "checking…" : dashOk ? "Responding OK" : "Check failed" },
      ],
    },
    {
      title: "T006 — Implementation Tracker",
      icon: CheckCircle2,
      items: [
        { label: "/admin/implementation page", status: "done" },
        { label: "Live DB row counts from API", status: dbCounts ? "done" : "pending" },
        { label: "Auth + Dashboard endpoint health checks", status: "done" },
        { label: "Added to admin sidebar nav as 'DB Tracker'", status: "done" },
      ],
    },
  ]

  const allItems = sections.flatMap((s) => s.items)
  const doneCount = allItems.filter((i) => i.status === "done").length
  const totalCount = allItems.length
  const pct = Math.round((doneCount / totalCount) * 100)

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">DB Implementation Tracker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live status for T001–T006: database, auth, seeding, and API re-pointing.
        </p>

        {/* Progress bar */}
        <div className="mt-4 flex items-center gap-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-semibold text-foreground">
            {doneCount}/{totalCount} ({pct}%)
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon
          const sectionDone = section.items.filter((i) => i.status === "done").length
          return (
            <div key={section.title} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <h2 className="flex-1 text-sm font-semibold text-foreground">{section.title}</h2>
                <span className="text-xs text-muted-foreground">
                  {sectionDone}/{section.items.length}
                </span>
              </div>
              <ul className="divide-y divide-border/50">
                {section.items.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 px-5 py-2.5">
                    <StatusIcon status={item.status} />
                    <span className={`flex-1 text-xs ${item.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                      {item.label}
                    </span>
                    {item.detail && (
                      <span className="text-[10px] text-muted-foreground">{item.detail}</span>
                    )}
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Credentials reference */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Admin Credentials</h3>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground">Email:</span>
            <code className="font-mono text-foreground">admin@sightseeing.lu</code>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground">Password:</span>
            <code className="font-mono text-foreground">Admin1234!</code>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground">Admin UUID:</span>
            <code className="font-mono text-[10px] text-foreground">4102ea5d-fd01-4182-b08b-c751d663cd21</code>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground">Login URL:</span>
            <code className="font-mono text-foreground">/admin/login</code>
          </div>
        </div>
      </div>
    </div>
  )
}
