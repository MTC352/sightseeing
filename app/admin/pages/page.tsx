"use client"

import Link from "next/link"
import { FileText, Edit2, Eye, PenLine } from "lucide-react"

const MANAGED_PAGES = [
  { slug: "home",       label: "Home",            url: "/",            description: "Landing page — hero, featured trips, weather, offers" },
  { slug: "about",      label: "About",           url: "/about",       description: "About sightseeing.lu, team and mission" },
  { slug: "explore",    label: "Explore",         url: "/explore",     description: "Browse all trip categories" },
  { slug: "search",     label: "Search Results",  url: "/search",      description: "Search and filter trips" },
  { slug: "planner",    label: "AI Trip Planner", url: "/planner",     description: "The AI-powered trip planner chat" },
  { slug: "departures", label: "Departures",      url: "/departures",  description: "Upcoming departure listings" },
  { slug: "blog",       label: "Blog",            url: "/blog",        description: "Blog index page" },
  { slug: "careers",    label: "Careers",         url: "/careers",     description: "Job listings and apply CTAs" },
  { slug: "help",       label: "Help & FAQ",      url: "/help",        description: "FAQ accordion and help AI chat" },
  { slug: "checkout",   label: "Checkout",        url: "/checkout",    description: "Cart and Palisis booking iframe" },
]

export default function AdminPagesPage() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Admin</p>
          <h1 className="mt-1 text-xl font-bold text-foreground">Pages</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Open any page in edit mode to update its text content inline.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <PenLine className="h-3.5 w-3.5" />
          {MANAGED_PAGES.length} pages
        </div>
      </div>

      {/* How it works hint */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        <span className="font-semibold">How it works:</span> Click <span className="font-semibold">Edit Content</span> to open the page with an inline editor.
        Hover over any underlined text to reveal the pen icon — click it to edit, then hit <span className="font-semibold">Save all</span> in the top banner to persist your changes.
      </div>

      {/* Page list */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MANAGED_PAGES.map((page) => (
          <div key={page.slug} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{page.label}</p>
                  <p className="text-[11px] text-muted-foreground">{page.url}</p>
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{page.description}</p>
            <div className="flex gap-2 pt-1">
              <Link
                href={`${page.url}?admin_edit=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Content
              </Link>
              <Link
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
