import { Link } from "@/components/i18n/link"
import { Track404 } from "./track-404"

// Friendly global 404 UI, shown for unmatched routes and for notFound() calls
// (e.g. a missing blog post). NOTE: this server component is evaluated as part
// of every request's segment tree — even on successful 200 renders — so it must
// have NO server-side side effects. 404 logging is done by <Track404/>, a client
// component that only mounts when this UI is actually displayed in the browser.
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-20 text-center">
      <Track404 />
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
        This page couldn&apos;t be found
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The link may be outdated or the page may have moved. Try our blog or head back home.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to home
        </Link>
        <Link
          href="/blog"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Read the blog
        </Link>
      </div>
    </div>
  )
}
