"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Circle, AlertCircle, Database, Shield, Layers, Zap, Globe, Webhook, Link2, RefreshCw } from "lucide-react"

type Status = "done" | "pending" | "partial"

interface CheckItem {
  label: string
  status: Status
  detail?: string
  source?: string
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
    return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Done</span>
  if (status === "partial")
    return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Partial</span>
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Pending</span>
}

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  const isDb = source === "DB"
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
      isDb ? "bg-blue-500/10 text-blue-600" : "bg-violet-500/10 text-violet-600"
    }`}>
      {source}
    </span>
  )
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
  taxonomies: string
  departures: string
}

interface RouteHealth {
  auth: boolean | null
  dashboard: boolean | null
  taxonomies: boolean | null
  pagesApi: boolean | null
  pageContent: boolean | null
  departures: boolean | null
  integrationsApi: boolean | null
}

export default function ImplementationPage() {
  const [dbCounts, setDbCounts] = useState<DbCounts | null>(null)
  const [health, setHealth] = useState<RouteHealth>({
    auth: null, dashboard: null, taxonomies: null, pagesApi: null,
    pageContent: null, departures: null, integrationsApi: null,
  })

  useEffect(() => {
    fetch("/api/admin/impl-check")
      .then((r) => r.json())
      .then((data) => setDbCounts(data))
      .catch(() => {})

    const checks: Array<[keyof RouteHealth, string]> = [
      ["auth", "/api/admin/auth/me"],
      ["dashboard", "/api/admin/dashboard"],
      ["taxonomies", "/api/admin/taxonomies"],
      ["pagesApi", "/api/admin/pages"],
      ["pageContent", "/api/admin/page-content?slug=home"],
      ["departures", "/api/admin/departures"],
      ["integrationsApi", "/api/admin/integrations"],
    ]
    checks.forEach(([key, url]) => {
      fetch(url)
        .then((r) => setHealth((h) => ({ ...h, [key]: r.ok })))
        .catch(() => setHealth((h) => ({ ...h, [key]: false })))
    })
  }, [])

  function countStatus(table: keyof DbCounts, expected: number): Status {
    if (!dbCounts) return "pending"
    const actual = parseInt(dbCounts[table] ?? "0", 10)
    if (actual >= expected) return "done"
    if (actual > 0) return "partial"
    return "pending"
  }

  function apiStatus(key: keyof RouteHealth): Status {
    const v = health[key]
    if (v === null) return "pending"
    return v ? "done" : "partial"
  }

  function apiDetail(key: keyof RouteHealth): string {
    const v = health[key]
    if (v === null) return "checking…"
    return v ? "Responding OK" : "Check failed"
  }

  const sections: Section[] = [
    {
      title: "T001 — Database & Packages",
      icon: Database,
      items: [
        { label: "PostgreSQL database created (DATABASE_URL)", status: "done", source: "DB" },
        { label: "Package: pg + @types/pg", status: "done" },
        { label: "Package: bcryptjs + @types/bcryptjs", status: "done" },
        { label: "Package: jose (JWT)", status: "done" },
      ],
    },
    {
      title: "T002 — Schema (17 tables)",
      icon: Layers,
      items: [
        { label: "admin_users", status: "done", source: "DB" },
        { label: "trips", status: "done", source: "DB" },
        { label: "palisis_sync_log", status: "done", source: "DB" },
        { label: "blog_posts", status: "done", source: "DB" },
        { label: "jobs", status: "done", source: "DB" },
        { label: "job_applications", status: "done", source: "DB" },
        { label: "help_articles", status: "done", source: "DB" },
        { label: "support_tickets", status: "done", source: "DB" },
        { label: "ticket_replies", status: "done", source: "DB" },
        { label: "taxonomies", status: "done", source: "DB" },
        { label: "pages", status: "done", source: "DB" },
        { label: "page_revisions", status: "done", source: "DB" },
        { label: "page_content", status: "done", source: "DB" },
        { label: "ai_system_configs", status: "done", source: "DB" },
        { label: "integrations", status: "done", source: "DB" },
        { label: "header_footer_blocks", status: "done", source: "DB" },
        { label: "departures (new — departure schedule table)", status: "done", source: "DB" },
        { label: "lib/db.ts — Pool singleton + query helpers", status: "done" },
        { label: "lib/db/queries.ts — All CRUD helpers (incl. departures + integrations)", status: "done" },
      ],
    },
    {
      title: "T003 — Seed Data",
      icon: Database,
      items: [
        {
          label: "admin_users (1 row) — admin@sightseeing.lu",
          status: dbCounts ? countStatus("admin_users", 1) : "pending",
          detail: dbCounts ? `${dbCounts.admin_users} rows` : "checking…",
          source: "DB",
        },
        {
          label: "trips (43 rows from lib/data.ts)",
          status: dbCounts ? countStatus("trips", 43) : "pending",
          detail: dbCounts ? `${dbCounts.trips} rows` : "checking…",
          source: "DB",
        },
        {
          label: "blog_posts (2 rows)",
          status: dbCounts ? countStatus("blog_posts", 2) : "pending",
          detail: dbCounts ? `${dbCounts.blog_posts} rows` : "checking…",
          source: "DB",
        },
        {
          label: "jobs (3 rows)",
          status: dbCounts ? countStatus("jobs", 3) : "pending",
          detail: dbCounts ? `${dbCounts.jobs} rows` : "checking…",
          source: "DB",
        },
        {
          label: "help_articles (17 rows)",
          status: dbCounts ? countStatus("help_articles", 17) : "pending",
          detail: dbCounts ? `${dbCounts.help_articles} rows` : "checking…",
          source: "DB",
        },
        {
          label: "ai_system_configs (3 rows)",
          status: dbCounts ? countStatus("ai_configs", 3) : "pending",
          detail: dbCounts ? `${dbCounts.ai_configs} rows` : "checking…",
          source: "DB",
        },
        {
          label: "integrations (8 rows — keys empty until admin saves)",
          status: dbCounts ? countStatus("integrations", 8) : "pending",
          detail: dbCounts ? `${dbCounts.integrations} rows` : "checking…",
          source: "DB",
        },
        {
          label: "header_footer_blocks (5 rows)",
          status: dbCounts ? countStatus("hf_blocks", 5) : "pending",
          detail: dbCounts ? `${dbCounts.hf_blocks} rows` : "checking…",
          source: "DB",
        },
        {
          label: "pages (10 system pages)",
          status: dbCounts ? countStatus("pages", 10) : "pending",
          detail: dbCounts ? `${dbCounts.pages} rows` : "checking…",
          source: "DB",
        },
        {
          label: "taxonomies seeded",
          status: dbCounts ? countStatus("taxonomies", 1) : "pending",
          detail: dbCounts ? `${dbCounts.taxonomies ?? 0} rows` : "checking…",
          source: "DB",
        },
        {
          label: "departures (sample rows from featured trips)",
          status: dbCounts ? countStatus("departures", 1) : "pending",
          detail: dbCounts ? `${dbCounts.departures ?? 0} rows` : "checking…",
          source: "DB",
        },
      ],
    },
    {
      title: "T004 — Authentication",
      icon: Shield,
      items: [
        { label: "POST /api/admin/auth/login (bcrypt verify + JWT cookie)", status: "done" },
        { label: "POST /api/admin/auth/logout (clear cookie)", status: "done" },
        { label: "GET /api/admin/auth/me (verify JWT, return user)", status: apiStatus("auth"), detail: apiDetail("auth") },
        { label: "proxy.ts — protect /admin/* + /api/admin/*", status: "done" },
        { label: "/admin/login page (email + password form)", status: "done" },
        { label: "lib/auth.ts (signSession, verifySession, getSession)", status: "done" },
      ],
    },
    {
      title: "T005 — Core API Routes → DB",
      icon: Zap,
      items: [
        { label: "GET/POST /api/admin/trips + revalidatePath", status: "done", source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/trips/[id] + revalidatePath", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/posts + revalidatePath + auto-slug", status: "done", source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/posts/[id] + revalidatePath", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/jobs + revalidatePath", status: "done", source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/jobs/[id] + revalidatePath", status: "done", source: "DB" },
        { label: "GET/PATCH /api/admin/applications", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/help + revalidatePath", status: "done", source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/help/[id] + revalidatePath", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/tickets", status: "done", source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/tickets/[id]", status: "done", source: "DB" },
        { label: "POST /api/admin/tickets/[id]/replies", status: "done", source: "DB" },
        { label: "GET/PATCH /api/admin/settings (apiKeys, ai, weglot, header, footer)", status: "done", source: "DB" },
        { label: "GET/PUT /api/admin/planner-behavior", status: "done", source: "DB" },
        { label: "GET /api/admin/dashboard (live DB stats)", status: apiStatus("dashboard"), detail: apiDetail("dashboard"), source: "DB" },
      ],
    },
    {
      title: "T007 — Extended API Routes",
      icon: Globe,
      items: [
        { label: "GET/POST/PATCH /api/admin/taxonomies", status: apiStatus("taxonomies"), detail: apiDetail("taxonomies"), source: "DB" },
        { label: "GET/DELETE /api/admin/taxonomies/[key]", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/pages", status: apiStatus("pagesApi"), detail: apiDetail("pagesApi"), source: "DB" },
        { label: "GET/PATCH/DELETE /api/admin/pages/[id]", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/pages/[id]/revisions", status: "done", source: "DB" },
        { label: "POST /api/admin/pages/[id]/revisions/[revisionId]/restore", status: "done", source: "DB" },
        { label: "GET/POST /api/admin/page-content", status: apiStatus("pageContent"), detail: apiDetail("pageContent"), source: "DB" },
        { label: "POST /api/webhooks/palisis (availability + booking events)", status: "done", source: "DB" },
        { label: "GET/POST/PATCH /api/admin/departures → DB (was admin-store)", status: apiStatus("departures"), detail: apiDetail("departures"), source: "DB" },
        { label: "GET/PATCH /api/admin/integrations → integrations table", status: apiStatus("integrationsApi"), detail: apiDetail("integrationsApi"), source: "DB" },
      ],
    },
    {
      title: "T008 — Admin UI → DB (auto-update + error handling)",
      icon: Layers,
      items: [
        { label: "/admin (dashboard) — live DB stats", status: "done", source: "DB" },
        { label: "/admin/trips — force-dynamic + revalidatePath", status: "done", source: "DB" },
        { label: "/admin/trips/[id] — res.ok check + error banner", status: "done", source: "DB" },
        { label: "/admin/blog — force-dynamic + revalidatePath", status: "done", source: "DB" },
        { label: "/admin/blog/[id] — res.ok check + error banner + auto-slug", status: "done", source: "DB" },
        { label: "/admin/jobs — force-dynamic + revalidatePath", status: "done", source: "DB" },
        { label: "/admin/jobs/[id] — res.ok check + error banner", status: "done", source: "DB" },
        { label: "/admin/help — force-dynamic + revalidatePath", status: "done", source: "DB" },
        { label: "/admin/help/[id] — res.ok check + error banner", status: "done", source: "DB" },
        { label: "/admin/ai-systems — DB settings", status: "done", source: "DB" },
        { label: "/admin/taxonomies — DB via API", status: "done", source: "DB" },
        { label: "/admin/tickets — DB via /api/admin/tickets", status: "done", source: "DB" },
        { label: "/admin/departures — DB via /api/admin/departures (re-pointed)", status: "done", source: "DB" },
        { label: "/admin/integrations — DB via /api/admin/integrations", status: "partial", detail: "Saves via settings; integrations route new", source: "DB" },
        { label: "/admin/header-footer — DB via settings (header/footer sections)", status: "done", source: "DB" },
      ],
    },
    {
      title: "T009 — Public Pages → DB",
      icon: Globe,
      items: [
        { label: "/blog — dbListPosts (async server component)", status: "done", source: "DB" },
        { label: "/blog/[slug] — dbGetPostBySlug", status: "done", source: "DB" },
        { label: "/explore — ExploreClient still imports from lib/data.ts", status: "partial", detail: "Needs ExploreClient refactor" },
        { label: "/careers — hardcoded JOBS array (client component)", status: "pending", detail: "Convert to server component + dbListJobs" },
        { label: "/help — HelpClient uses hardcoded articles", status: "pending", detail: "Convert to server component + dbListHelpArticles" },
        { label: "/departures — DeparturesClient still uses admin-store", status: "pending", detail: "Wire to /api/departures → DB" },
        { label: "/trip/[id] — needs DB lookup", status: "pending", detail: "Currently uses lib/data.ts" },
      ],
    },
    {
      title: "T010 — 3rd-Party Integrations",
      icon: Link2,
      items: [
        { label: "OpenWeather key: env var fallback → DB settings (apiKeys.openWeather)", status: "done", source: "DB" },
        { label: "Mapbox token: env var fallback → DB settings (apiKeys.mapbox)", status: "done", source: "DB" },
        { label: "Google Reviews key: reads from DB settings (apiKeys.googleReviews)", status: "done", source: "DB" },
        { label: "Palisis API key: reads from DB settings (apiKeys.palisis)", status: "done", source: "DB" },
        { label: "OpenWeather test button: validates key against real API", status: "pending", detail: "Currently only checks key length" },
        { label: "Google Reviews test button: validates against Places API", status: "pending", detail: "Currently only checks key length" },
        { label: "Palisis test button: validates against Palisis API endpoint", status: "pending", detail: "Currently only checks key length" },
        { label: "Integrations page: save to /api/admin/integrations (DB table)", status: "partial", detail: "Currently saves via settings.apiKeys" },
        { label: "Weglot full settings page at /admin/integrations/weglot", status: "pending" },
      ],
    },
    {
      title: "T011 — Palisis Booking Integration",
      icon: RefreshCw,
      items: [
        { label: "POST /api/webhooks/palisis — webhook endpoint", status: "done", source: "DB" },
        { label: "GET /api/admin/palisis-availability — reads from DB key", status: "done", source: "DB" },
        { label: "POST /api/admin/palisis-import — reads from DB key", status: "done", source: "DB" },
        { label: "/admin/palisis — import panel UI", status: "done" },
        { label: "Live Palisis API calls (currently mock/commented out)", status: "pending", detail: "Needs real Palisis API key + endpoint" },
        { label: "Palisis import: auto-create trips from catalog response", status: "pending", detail: "Mapping Palisis product → trips DB row" },
      ],
    },
    {
      title: "T006 — Implementation Tracker",
      icon: CheckCircle2,
      items: [
        { label: "/admin/implementation page", status: "done" },
        { label: "Live DB row counts (incl. departures)", status: dbCounts ? "done" : "pending", source: "DB" },
        { label: "Live API health checks (auth, dashboard, taxonomies, pages, page-content, departures, integrations)", status: "done" },
        { label: "Data source badges (DB vs Mock)", status: "done" },
        { label: "New task sections: T010 (3rd-party), T011 (Palisis), T009 (public pages)", status: "done" },
        { label: "Added to admin sidebar nav", status: "done" },
      ],
    },
  ]

  const allItems = sections.flatMap((s) => s.items)
  const doneCount = allItems.filter((i) => i.status === "done").length
  const partialCount = allItems.filter((i) => i.status === "partial").length
  const totalCount = allItems.length
  const pct = Math.round((doneCount / totalCount) * 100)

  return (
    <div className="min-h-screen p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Implementation Tracker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full audit: database, auth, seeding, API routes, admin UI, public pages, 3rd-party integrations.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold text-foreground">{doneCount}/{totalCount} ({pct}%)</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {doneCount} done
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> {partialCount} partial
          </span>
          <span className="flex items-center gap-1.5">
            <Circle className="h-3.5 w-3.5 text-muted-foreground/40" /> {totalCount - doneCount - partialCount} pending
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-600">DB</span>
            <span className="text-[10px]">= reads/writes from PostgreSQL</span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon
          const sectionDone = section.items.filter((i) => i.status === "done").length
          const sectionPartial = section.items.filter((i) => i.status === "partial").length
          return (
            <div key={section.title} className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <h2 className="flex-1 text-sm font-semibold text-foreground">{section.title}</h2>
                <span className="text-xs text-muted-foreground">
                  {sectionDone}/{section.items.length}
                  {sectionPartial > 0 && <span className="ml-1 text-amber-500">+{sectionPartial}~</span>}
                </span>
              </div>
              <ul className="divide-y divide-border/50">
                {section.items.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 px-5 py-2.5">
                    <StatusIcon status={item.status} />
                    <span className={`flex-1 text-xs ${item.status === "done" ? "text-foreground" : "text-muted-foreground"}`}>
                      {item.label}
                    </span>
                    {item.source && <SourceBadge source={item.source} />}
                    {item.detail && <span className="text-[10px] text-muted-foreground/70 max-w-[120px] text-right">{item.detail}</span>}
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* Next steps */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-300">Next Implementation Steps</h3>
        <ol className="space-y-1 text-xs text-amber-800 dark:text-amber-400">
          <li><strong>1.</strong> Wire public <code>/explore</code>, <code>/careers</code>, <code>/help</code> pages to DB (refactor ExploreClient / convert to server components)</li>
          <li><strong>2.</strong> Wire public <code>/trip/[id]</code> page to DB (currently reads from lib/data.ts)</li>
          <li><strong>3.</strong> Wire public <code>/departures</code> page to DB departures table via API</li>
          <li><strong>4.</strong> Wire integrations page save to <code>/api/admin/integrations</code> (DB table) instead of settings.apiKeys</li>
          <li><strong>5.</strong> Add real API key validation for OpenWeather, Google Reviews, Palisis</li>
          <li><strong>6.</strong> Implement live Palisis catalog import + trip auto-creation</li>
        </ol>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Admin Credentials</h3>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            ["Email", "admin@sightseeing.lu"],
            ["Password", "Admin1234!"],
            ["Admin UUID", "4102ea5d-fd01-4182-b08b-c751d663cd21"],
            ["Login URL", "/admin/login"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <span className="text-muted-foreground">{label}:</span>
              <code className="font-mono text-[10px] text-foreground break-all">{val}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
