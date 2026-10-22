"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileText, Edit2, Eye, EyeOff, PenLine, Code2 } from "lucide-react"
import { DEVELOPMENT_PAGES, DEVELOPMENT_PAGE_SLUGS } from "@/lib/development-pages"

type ManagedPage = {
  slug: string
  label: string
  url: string
  description: string
  /** Optional dedicated management screen (e.g. script embeds). */
  manageHref?: string
  manageLabel?: string
}

const MANAGED_PAGES: ManagedPage[] = [
  { slug: "home",       label: "Home",            url: "/",            description: "Landing page — hero, featured trips, weather, offers" },
  { slug: "about",      label: "About",           url: "/about",       description: "About sightseeing.lu, team and mission" },
  { slug: "explore",    label: "Explore",         url: "/explore",     description: "Browse all trip categories" },
  { slug: "search",     label: "Search Results",  url: "/search",      description: "Search and filter trips" },
  { slug: "planner",    label: "AI Trip Planner", url: "/planner",     description: "The AI-powered trip planner chat" },
  { slug: "departures", label: "Departures",      url: "/departures",  description: "Upcoming departure listings" },
  { slug: "departing-soon", label: "Departing Soon",  url: "/departing-soon",  description: "Today's departures (from snapshot). Only the hero copy is editable; trip cards are live data." },
  { slug: "filling-up-fast", label: "Filling Up Fast", url: "/filling-up-fast", description: "Today's experiences ranked by seats left. Only the hero copy is editable; trip cards are live data." },
  { slug: "blog",       label: "Blog",            url: "/blog",        description: "Blog index page" },
  { slug: "careers",    label: "Careers",         url: "/careers",     description: "Job listings and apply CTAs" },
  { slug: "dmc",        label: "DMC & Tour Operator", url: "/dmc",     description: "DMC landing page — all text, images and button links (e.g. brochure PDF) are editable; the request form emails hello@sightseeing.lu" },
  { slug: "help",       label: "Help & FAQ",      url: "/help",        description: "FAQ accordion and help AI chat" },
  { slug: "impressum",  label: "Legal Notice",    url: "/impressum",   description: "Impressum — company details, RCS/VAT numbers, disclaimer. Address, email and phone come from Header & Footer → Contact Info" },
  { slug: "checkout",   label: "My Trips",        url: "/my-trips",    description: "Saved trips and Palisis booking iframe" },
  { slug: "cfl-sightseeing", label: "CFL Sightseeing", url: "/cfl-sightseeing", description: "CFL self-guided walking tours — hero + audio-guide iframe" },
  { slug: "live-tracking", label: "Live Tracking",   url: "/live-tracking", description: "Live bus & train tour maps — GreatGuideMagic widget embeds", manageHref: "/admin/pages/live-tracking", manageLabel: "Manage Scripts" },
  // Pages that can also be switched off (404 for visitors) — see lib/development-pages.ts.
  ...DEVELOPMENT_PAGES.map(({ slug, label, url, description }) => ({ slug, label, url, description })),
]

/** Enabled/Disabled switch for the governed pages. Saves immediately. */
function useDisabledPages() {
  const [disabled, setDisabled] = useState<string[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/admin/pages/visibility")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { disabled?: string[] }) => setDisabled(Array.isArray(d.disabled) ? d.disabled : []))
      .catch(() => setError("Could not load page visibility."))
  }, [])

  async function toggle(slug: string) {
    if (!disabled) return
    const prev = disabled
    const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    setDisabled(next)
    setError("")
    try {
      const r = await fetch("/api/admin/pages/visibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      })
      if (!r.ok) throw new Error("save failed")
      setDisabled(((await r.json()) as { disabled: string[] }).disabled)
    } catch {
      setDisabled(prev)
      setError("Could not save page visibility — please try again.")
    }
  }

  return { disabled, error, toggle }
}

function VisibilityToggle({ enabled, loading, onToggle }: { enabled: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onToggle}
      title={enabled ? "Public — click to disable (404 for visitors)" : "Hidden from visitors — click to enable"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${enabled ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
    >
      {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {loading ? "…" : enabled ? "Enabled" : "Disabled"}
    </button>
  )
}

export default function AdminPagesPage() {
  const visibility = useDisabledPages()

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
        Pages with an <span className="font-semibold">Enabled / Disabled</span> switch can be hidden: disabled pages return a 404 to visitors (admins can still preview them). The switch saves immediately.
      </div>

      {visibility.error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{visibility.error}</div>
      )}

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
              {DEVELOPMENT_PAGE_SLUGS.has(page.slug) && (
                <VisibilityToggle
                  enabled={!visibility.disabled?.includes(page.slug)}
                  loading={visibility.disabled === null}
                  onToggle={() => visibility.toggle(page.slug)}
                />
              )}
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
              {"manageHref" in page && page.manageHref && (
                <Link
                  href={page.manageHref}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  {page.manageLabel ?? "Manage"}
                </Link>
              )}
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
