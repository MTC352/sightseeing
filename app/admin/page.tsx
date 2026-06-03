import Link from "next/link"
import { dbListTrips, dbListJobs, dbListPosts } from "@/lib/db/queries"
import { Map, FileText, Briefcase, Bot, Plug, ChevronRight, Star, Code2 } from "lucide-react"
import { requireAdminSession } from "@/lib/auth-server"
import { FULL_ACCESS_ROLE, type PermissionKey } from "@/lib/admin-permissions"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
  // Gate every dashboard widget by the signed-in user's permissions so an
  // employee never sees data (or shortcuts) for sections they can't access.
  let role = ""
  let permissions: PermissionKey[] = []
  try {
    const session = await requireAdminSession()
    role = session.role
    permissions = (session.permissions ?? []) as PermissionKey[]
  } catch {
    // The proxy already guards /admin; if we get here unauthenticated the
    // client layout will redirect to login. Render an empty dashboard.
  }
  const isSuperadmin = role === FULL_ACCESS_ROLE
  const can = (perm: PermissionKey) => isSuperadmin || permissions.includes(perm)

  const canTrips = can("trips")
  const canBlog = can("blog")
  const canJobs = can("jobs")

  const [trips, jobs, posts] = await Promise.all([
    canTrips ? dbListTrips() : Promise.resolve([]),
    canJobs ? dbListJobs() : Promise.resolve([]),
    canBlog ? dbListPosts() : Promise.resolve([]),
  ])

  const publishedTrips = (trips as { status: string }[]).filter((t) => t.status === "published").length
  const openJobs = (jobs as { status: string }[]).filter((j) => j.status === "open").length
  const publishedPosts = (posts as { status: string }[]).filter((p) => p.status === "published").length
  const featuredTrips = (trips as { featured: boolean }[]).filter((t) => t.featured).length

  const stats = [
    canTrips && { label: "Total Trips", value: trips.length, sub: `${publishedTrips} published`, icon: Map, href: "/admin/trips" },
    canBlog && { label: "Blog Posts", value: posts.length, sub: `${publishedPosts} published`, icon: FileText, href: "/admin/blog" },
    canJobs && { label: "Open Jobs", value: openJobs, sub: `${jobs.length} total listings`, icon: Briefcase, href: "/admin/jobs" },
    canTrips && { label: "Featured Trips", value: featuredTrips, sub: "Shown on homepage", icon: Star, href: "/admin/trips" },
  ].filter(Boolean) as { label: string; value: number; sub: string; icon: typeof Map; href: string }[]

  const quickActions = [
    canTrips && { label: "Manage Trips", description: "Edit prices, images, and availability", href: "/admin/trips", icon: Map },
    canBlog && { label: "Write a Blog Post", description: "Create or edit blog content", href: "/admin/blog", icon: FileText },
    canJobs && { label: "Post a Job", description: "Add a new open position", href: "/admin/jobs", icon: Briefcase },
    can("ai-systems") && { label: "AI Systems", description: "Configure prompts and models", href: "/admin/ai-systems", icon: Bot },
    can("integrations") && { label: "Integrations", description: "Manage API keys and third-party services", href: "/admin/integrations", icon: Plug },
    can("header-footer") && { label: "Header / Footer", description: "Edit global header and footer HTML", href: "/admin/header-footer", icon: Code2 },
  ].filter(Boolean) as { label: string; description: string; href: string; icon: typeof Map }[]

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">sightseeing.lu</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back. Here is your content overview.</p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-secondary/50"
          >
            <div className="flex items-center justify-between">
              <s.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </div>
            <p className="mt-4 text-3xl font-bold text-foreground">{s.value}</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{s.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-secondary/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <a.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{a.label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent trips */}
      {canTrips && (
      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Recent Trips</h2>
          <Link href="/admin/trips" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Title</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Category</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(trips as { id: string; title: string; category: string; price: number; status: string }[]).slice(0, 8).map((trip) => (
                <tr key={trip.id} className="group transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/trips/${trip.id}`} className="font-medium text-foreground transition-colors line-clamp-1">
                      {trip.title}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{trip.category}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">€{trip.price}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      trip.status === "published" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
