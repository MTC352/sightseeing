// Instant navigation feedback for every admin route. Without a loading.tsx the
// App Router blocks client-side navigation until the destination server
// component has fully rendered — so a sidebar click appears to do nothing for
// seconds on slow/dynamic pages. This Suspense fallback makes the URL change
// and a skeleton appear immediately; route-specific files (e.g. trips) override it.
export default function AdminLoading() {
  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-24 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}
