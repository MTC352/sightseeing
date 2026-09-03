import Link from "next/link"
import { dbListTripRedirects, dbListTrip404s } from "@/lib/db/queries"
import { Plus, Pencil, ExternalLink, CornerDownRight, Signpost } from "lucide-react"
import { TripRedirectDeleteButton } from "./trip-redirect-delete-button"
import { Trip404Actions } from "./trip-404-actions"
import { requirePermission } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type RedirectRow = {
  id: string; slug: string; tripId: string; createdAt: string
  tripTitle: string; tripSlug: string; tripStatus: string
}
type Log404Row = {
  id: string; path: string; hits: number; status: string
  firstSeen: string; lastSeen: string
}

export default async function AdminTripRedirectsPage() {
  try {
    await requirePermission("trips")
  } catch {
    redirect("/admin/login")
  }

  const [redirects, open404s] = await Promise.all([
    dbListTripRedirects() as Promise<RedirectRow[]>,
    dbListTrip404s("open") as Promise<Log404Row[]>,
  ])

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Trips</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Trip Redirects</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send old or alternate trip URLs to a trip&apos;s current page. Each rule 308-redirects
            <span className="font-mono"> /trip/&#123;alias&#125; → /trip/&#123;current-slug&#125;</span>. You can also add these
            from a trip&apos;s edit page.
          </p>
        </div>
        <Link
          href="/admin/trip-redirects/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Redirect
        </Link>
      </div>

      {/* Redirects */}
      {redirects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-14 text-center">
          <Signpost className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No trip redirects yet</p>
          <Link href="/admin/trip-redirects/new" className="mt-3 text-sm font-medium text-primary hover:underline">
            Add your first redirect
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Alias URL</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Target trip</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {redirects.map((r) => (
                <tr key={r.id} className="group transition-colors hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <span className="font-mono text-foreground">/trip/{r.slug}</span>
                    <span className="ml-1 text-muted-foreground/60">→ 308</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="truncate font-medium text-foreground max-w-[260px]">
                      {r.tripTitle}
                      {r.tripStatus !== "published" && (
                        <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">{r.tripStatus}</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">/trip/{r.tripSlug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/trip/${r.slug}`} target="_blank"
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="Test alias URL">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <Link href={`/admin/trip-redirects/${r.id}`}
                        className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <TripRedirectDeleteButton redirectId={r.id} slug={r.slug} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unresolved /trip 404s — discovery feed */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Unresolved trip 404s</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Broken <span className="font-mono">/trip/…</span> links visitors hit recently. Create a redirect to fix one, or ignore it.
        </p>
        {open404s.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
            No unresolved trip 404s. 🎉
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Path</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Hits</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Last seen</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {open404s.map((l) => (
                  <tr key={l.id} className="group transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-foreground">
                        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                        {l.path}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{l.hits}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {new Date(l.lastSeen).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/trip-redirects/new?source=${encodeURIComponent(l.path)}`}
                          className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                        >
                          Create redirect
                        </Link>
                        <Trip404Actions logId={l.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
