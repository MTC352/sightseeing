"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import Link from "next/link"
import {
  BookOpen, Search, LayoutDashboard, Map, FileText, Briefcase,
  Bot, Plug, Code2, RefreshCw, Layout, HelpCircle, Ticket,
  CheckSquare, Tag, ChevronRight, Info, AlertTriangle, Lightbulb,
  ExternalLink, Star, Archive, Globe, Image, Clock, Users,
  BarChart2, Zap, Lock, X,
} from "lucide-react"

/* ─── Types ────────────────────────────────────────────────────────────── */
type CalloutType = "info" | "tip" | "warning"
interface Callout { type: CalloutType; text: string }
interface Step { title: string; body: string }
interface DocSection {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  color: string
  summary: string
  body: string
  callouts?: Callout[]
  steps?: Step[]
  subSections?: { title: string; body: string }[]
}

/* ─── Documentation Content ─────────────────────────────────────────────── */
const DOCS: DocSection[] = [
  {
    id: "overview",
    title: "Getting Started",
    icon: BookOpen,
    color: "text-violet-500",
    summary: "An introduction to the sightseeing.lu admin panel and how to navigate it.",
    body: `The admin panel is your central control room for managing every aspect of the sightseeing.lu platform — from trip listings and blog content to AI assistant configuration and third-party API connections.

Access the admin panel at /admin. You must be logged in with your admin credentials to view any page. Sessions last 8 hours and are secured via an HttpOnly JWT cookie.`,
    callouts: [
      { type: "tip", text: "Bookmark /admin for quick access. The sidebar can be collapsed using the arrow button at the bottom to give you more screen space." },
      { type: "info", text: "Your session expires after 8 hours of inactivity. You will be automatically redirected to the login page when your session ends." },
    ],
    subSections: [
      {
        title: "Sidebar Navigation",
        body: `The left sidebar contains links to every section of the admin panel. Each item shows an icon and label. Click the collapse arrow at the bottom of the sidebar to hide the labels and give yourself more working space — hovering over any icon will show a tooltip with the section name.

The "Visit Site" button at the top of the sidebar opens the public homepage so you can quickly preview changes you have made.`,
      },
      {
        title: "Admin Credentials",
        body: `The default admin account is admin@sightseeing.lu. Change your password immediately after first login via the settings page. Passwords are stored as bcrypt hashes — the plain-text password is never saved anywhere.`,
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/admin",
    color: "text-blue-500",
    summary: "High-level overview of your content with live stats and quick-action shortcuts.",
    body: `The Dashboard is the first page you see after login. It gives you a real-time snapshot of your content library and provides shortcuts to the most common tasks.

The four stat cards at the top show: total trips (with published count), blog posts (with published count), open job listings, and featured trips. Each card is clickable and takes you directly to that section.`,
    subSections: [
      {
        title: "Stats Cards",
        body: `Each stat card pulls live data from the database every time the page loads. The sub-label shows context — for example, "32 published" out of a total trip count tells you how many are live on the site right now.`,
      },
      {
        title: "Quick Actions",
        body: `Below the stats are six quick-action cards that link to the most frequently used admin sections: Trips, Blog, Jobs, AI Systems, Integrations, and Header/Footer. These are purely shortcuts — you can access the same pages from the sidebar.`,
      },
      {
        title: "Recent Trips Table",
        body: `A table at the bottom lists the 8 most recently added trips with their category, price, and publish status. Click any trip title to open its edit page directly.`,
      },
    ],
  },
  {
    id: "trips",
    title: "Trips",
    icon: Map,
    href: "/admin/trips",
    color: "text-emerald-500",
    summary: "Create, edit, publish, and organise all sightseeing experiences.",
    body: `The Trips section is the core of the platform. Every sightseeing experience — walking tours, boat trips, bus tours, and more — is managed here. Trips can be in draft or published status. Only published trips appear on the public site.`,
    callouts: [
      { type: "warning", text: "If a trip is synced from Palisis, the canonical source of truth for prices, descriptions, and schedules is Palisis. Editing those fields here will be overwritten the next time a sync runs." },
      { type: "tip", text: "Use the Featured toggle on a trip to pin it to the homepage carousel. Aim for 3–6 featured trips at a time for the best homepage layout." },
    ],
    steps: [
      { title: "Open Trips", body: "Click Trips in the sidebar to see the full list of all trips including drafts." },
      { title: "Create a new trip", body: "Click the New Trip button in the top-right corner of the list page. Fill in at minimum: title, category, price, and duration. Save as draft until you are ready to publish." },
      { title: "Edit a trip", body: "Click any trip title to open its edit form. All fields auto-save when you click Save. The status toggle (Draft / Published) controls public visibility." },
      { title: "Archive a trip", body: "Trips that are no longer offered but need to be kept for records can be archived. Open the trip, scroll to the bottom, and click Archive. Archived trips are accessible under Trips → Archived." },
    ],
    subSections: [
      {
        title: "Trip Fields",
        body: `Title — the public display name shown on cards and the trip detail page.
Category — used for filtering on the Explore and Search pages (e.g. Walking, Boat, Bus).
Price — adult price in EUR. Child and group prices are separate optional fields.
Duration — human-readable string (e.g. "2 hours", "Half day"). Used for itinerary planning.
Description — rich-text field shown on the trip detail page. Supports basic formatting.
Images — main image URL and up to 4 gallery images. Images are referenced by URL.
Featured — boolean toggle; featured trips appear in the homepage hero carousel.
Tags — multi-select from the Trip Tags catalog. Tags power the AI planner's interest matching.
Status — Draft (hidden from public) or Published (live on the site).`,
      },
      {
        title: "Trip Tags",
        body: `Trip Tags are a canonical catalog of interest labels (e.g. "Family Friendly", "Outdoor", "History"). They are managed under Trips → Trip Tags in the sidebar. Tags assigned to trips are used by the AI Trip Planner to match user interests to relevant experiences.

Go to /admin/trip-tags to add, rename, or delete tags. Deleting a tag removes it from all trips it is currently assigned to.`,
      },
      {
        title: "Archived Trips",
        body: `Archived trips are hidden from the public site and from the main Trips list. They can be found at Trips → Archived. You can un-archive a trip at any time to restore it to draft status.`,
      },
    ],
  },
  {
    id: "blog",
    title: "Blog",
    icon: FileText,
    href: "/admin/blog",
    color: "text-sky-500",
    summary: "Write, edit, and publish blog articles that appear on the /blog section of the site.",
    body: `The Blog section lets you create long-form content articles that appear on the public /blog page. Blog posts support rich formatting, cover images, SEO metadata, and draft/published status.`,
    callouts: [
      { type: "tip", text: "Fill in the SEO fields (meta title, meta description) before publishing. These directly affect how the article appears in Google search results." },
    ],
    steps: [
      { title: "Create a post", body: "Click New Post. Add a title, cover image URL, and body content. Use the formatting toolbar for headings, bold, lists, and links." },
      { title: "Set a slug", body: "The URL slug is auto-generated from the title. Edit it manually if needed — it must be unique and URL-safe (lowercase, hyphens only)." },
      { title: "Add SEO metadata", body: "Scroll to the SEO section and fill in the meta title (60 chars) and meta description (160 chars). These appear in search engine results." },
      { title: "Publish", body: "Toggle the status from Draft to Published. The post will immediately appear on /blog." },
    ],
    subSections: [
      {
        title: "Blog Post Fields",
        body: `Title — shown as the article headline.
Slug — the URL path: /blog/[slug]. Must be unique.
Author — displayed as the byline. Defaults to the admin name.
Cover Image — URL of the hero image shown at the top of the article.
Content — rich-text body. Supports headings, paragraphs, lists, and links.
Tags — optional content tags for filtering.
Status — Draft (hidden) or Published (live on /blog).`,
      },
    ],
  },
  {
    id: "jobs",
    title: "Jobs & Applications",
    icon: Briefcase,
    href: "/admin/jobs",
    color: "text-orange-500",
    summary: "Manage open job listings and review incoming applications from the /careers page.",
    body: `The Jobs section has two areas: job listings (open positions you post publicly) and applications (submissions from candidates who apply via the /careers page).`,
    steps: [
      { title: "Post a job", body: "Click New Job. Fill in title, department, location, type (Full-time / Part-time / Freelance), and a full description of the role and requirements." },
      { title: "Publish the listing", body: "Set status to Open to make it appear on /careers. Closed listings stay in the admin but are hidden from job seekers." },
      { title: "Review applications", body: "Go to Jobs → Applications to see all incoming submissions. Each application shows the applicant name, email, position, cover letter, and CV link." },
      { title: "Update application status", body: "Click an application to open it. Change the status to Reviewed, Shortlisted, or Rejected to track your pipeline." },
    ],
    subSections: [
      {
        title: "Application Statuses",
        body: `New — just submitted, not yet reviewed.
Reviewed — you have looked at the application.
Shortlisted — candidate is being considered for an interview.
Rejected — candidate will not be progressed.`,
      },
    ],
  },
  {
    id: "help",
    title: "Help & FAQ",
    icon: HelpCircle,
    href: "/admin/help",
    color: "text-teal-500",
    summary: "Manage the FAQ articles that power the AI-assisted help chat on the /help page.",
    body: `The Help section manages the knowledge base that populates the /help page. The AI help chat assistant uses these articles to answer visitor questions, so keeping them accurate and up to date directly improves the quality of AI responses.`,
    callouts: [
      { type: "info", text: "The help chat AI reads all published articles as its knowledge base. More detailed and accurate articles lead to better AI answers for visitors." },
    ],
    steps: [
      { title: "Add an article", body: "Click New Article. Set a category (Booking, Getting Here, Cancellation, etc.), title, and body content." },
      { title: "Organise by category", body: "Articles are grouped by category on the /help page. Use consistent category names so articles are easy to navigate." },
      { title: "Publish", body: "Toggle status to Published. Only published articles are shown on the public help page and used by the AI." },
    ],
  },
  {
    id: "tickets",
    title: "Support Tickets",
    icon: Ticket,
    href: "/admin/tickets",
    color: "text-rose-500",
    summary: "View and reply to customer support requests submitted through the site.",
    body: `Support tickets are customer queries submitted via the contact/support form on the public site. Each ticket has a thread of replies shared between the customer and the admin team.`,
    steps: [
      { title: "Open a ticket", body: "Click any ticket from the list to open the thread view. You can see the original message and all replies in chronological order." },
      { title: "Reply", body: "Type your reply in the text area at the bottom of the thread and click Send Reply. The reply is saved in the database." },
      { title: "Update status", body: "Change the ticket status to Open, In Progress, or Resolved using the dropdown in the ticket header." },
    ],
    subSections: [
      {
        title: "Ticket Statuses",
        body: `Open — new ticket awaiting a first response.
In Progress — the admin team is actively handling the request.
Resolved — the issue has been closed.`,
      },
    ],
  },
  {
    id: "pages",
    title: "Pages (CMS)",
    icon: Layout,
    href: "/admin/pages",
    color: "text-indigo-500",
    summary: "Edit the content of static site pages like About Us, Privacy Policy, and Terms.",
    body: `The Pages section is a lightweight CMS for managing the content of fixed pages on the site such as the About page, Privacy Policy, Terms of Service, and Cookie Policy. Each page has a title, body content, and SEO metadata.`,
    callouts: [
      { type: "warning", text: "Changes to pages are published immediately once you save. There is no draft/publish toggle for CMS pages — edits go live right away." },
    ],
    subSections: [
      {
        title: "Page Revisions",
        body: `Every time you save a page, a revision is automatically stored. You can view the full revision history of any page and restore a previous version if needed. Go to the page's edit view and scroll down to the Revisions panel.`,
      },
    ],
  },
  {
    id: "ai-systems",
    title: "AI Systems",
    icon: Bot,
    href: "/admin/ai-systems",
    color: "text-purple-500",
    summary: "Configure the AI assistants that power the Trip Planner, Help Chat, and Itinerary builder.",
    body: `The AI Systems section lets you tune every AI-powered feature on the site. Each assistant has its own system prompt, model selection, and behaviour settings. Changes take effect immediately without a deploy.`,
    callouts: [
      { type: "warning", text: "This section is marked Experimental. Incorrect system prompts or model settings can break AI features for site visitors. Test changes carefully before committing." },
      { type: "tip", text: "Keep system prompts concise and instruction-focused. Very long prompts can hit context window limits and reduce response quality." },
    ],
    subSections: [
      {
        title: "Trip Planner AI",
        body: `Controls the conversational AI on the /planner page. This assistant gathers visitor preferences (interests, date, duration) and recommends personalised trips. The system prompt sets the assistant's persona, tone, and the logic for how it asks questions and presents recommendations.`,
      },
      {
        title: "Help Chat AI",
        body: `Powers the help chat widget on /help. This assistant answers visitor questions by drawing from the published Help & FAQ articles. The system prompt controls how it handles questions that are not covered by the knowledge base.`,
      },
      {
        title: "Trip Chat AI",
        body: `The inline chat on each /trip/[id] page. This assistant knows the details of the specific trip being viewed and can answer questions about it — timings, what to bring, accessibility, and so on.`,
      },
      {
        title: "Itinerary AI",
        body: `Builds day-by-day itineraries from the planner's trip recommendations. The prompt controls how it handles scheduling, time gaps, and meal breaks.`,
      },
      {
        title: "Model Settings",
        body: `Each assistant can be configured to use a different model (Claude, GPT-4o, etc.) and temperature setting. Lower temperature values (0.2–0.5) produce more consistent, factual responses. Higher values (0.7–1.0) produce more creative output. Most assistants should use 0.3–0.6.`,
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    icon: Plug,
    href: "/admin/integrations",
    color: "text-amber-500",
    summary: "Manage API keys for Google, Mapbox, Palisis, Weglot, weather, and AI providers.",
    body: `The Integrations page is a secure store for all third-party API keys and service credentials. Keys stored here are used server-side only — they are never exposed to the browser.`,
    callouts: [
      { type: "info", text: "API keys can also be set as server environment variables (GOOGLE_PLACES_API_KEY, etc.). Keys stored in Admin → Integrations take precedence." },
      { type: "tip", text: "Use the Test button next to each key to verify it is working correctly before saving. A green check means the key is valid and the service is reachable." },
    ],
    subSections: [
      {
        title: "Palisis / TourCMS",
        body: `Channel ID, Marketplace ID (if applicable), and API Key for connecting to the Palisis/TourCMS booking platform. These credentials are used for the catalog import and availability lookups. Palisis is read-only — data flows from Palisis into this site, never the other direction.`,
      },
      {
        title: "Google Reviews",
        body: `Two fields: Google Place ID and Google Places API Key.

Google Place ID — the unique identifier for the business on Google Maps. Find yours at developers.google.com/maps/documentation/places/web-service/place-id by searching for "Sightseeing Luxembourg". Setting this directly is the most reliable way to ensure reviews load correctly.

Google Places API Key — a key with the Places API enabled from console.cloud.google.com. Used to fetch live reviews for the homepage Reviews section.`,
      },
      {
        title: "Mapbox",
        body: `Public access token for the interactive maps shown on trip pages and the /explore page. Mapbox tokens that start with "pk." are safe to use in the browser. This token is delivered to the frontend via a secure server-side route (/api/mapbox-token).`,
      },
      {
        title: "OpenWeatherMap",
        body: `API key for the weather widget shown on the homepage. Displays current Luxembourg weather and drives the "Best outdoor / indoor trips today" section based on conditions.`,
      },
      {
        title: "Weglot",
        body: `API key for the Weglot translation service that adds multi-language support across the site. The full Weglot configuration (languages, excluded paths, etc.) is available at Admin → Integrations → Weglot.`,
      },
      {
        title: "AI Providers",
        body: `Anthropic and OpenAI keys used by the AI assistant features. These can also be set as ANTHROPIC_API_KEY and OPENAI_API_KEY environment variables. Key configured in the Integrations page takes precedence over the environment variable.`,
      },
    ],
  },
  {
    id: "header-footer",
    title: "Header / Footer",
    icon: Code2,
    href: "/admin/header-footer",
    color: "text-slate-500",
    summary: "Inject custom HTML, scripts, or CSS into the global site header and footer.",
    body: `The Header/Footer section lets you add custom HTML code that is injected into every page of the public site. Common uses include tracking pixels, custom CSS overrides, cookie consent scripts, and live chat widgets.`,
    callouts: [
      { type: "warning", text: "Code injected here runs on every public page. Invalid HTML or JavaScript errors will affect all visitors. Always test in a staging environment first if possible, and use browser developer tools to verify after saving." },
      { type: "tip", text: "Wrap <script> tags with async or defer to avoid blocking page rendering. Place analytics scripts in the footer block, not the header, for better performance." },
    ],
    subSections: [
      {
        title: "Header Block",
        body: `Code placed in the header block is injected inside the <head> tag of every public page. Use this for: CSS stylesheets, font imports, meta tags, and scripts that must load early.`,
      },
      {
        title: "Footer Block",
        body: `Code in the footer block is injected just before the closing </body> tag. Use this for: analytics scripts (Google Analytics, Meta Pixel), live chat widgets, and other third-party tools that do not need to block rendering.`,
      },
    ],
  },
  {
    id: "palisis",
    title: "Palisis Import",
    icon: RefreshCw,
    href: "/admin/palisis",
    color: "text-cyan-500",
    summary: "Sync trip catalog and availability data from the Palisis/TourCMS booking platform.",
    body: `Palisis (TourCMS) is the upstream booking system. This page lets you pull the latest trip catalog and availability data from Palisis into the local database.`,
    callouts: [
      { type: "warning", text: "Palisis is the source of truth for synced trips. Running a sync will overwrite local edits to price, description, and schedule fields on any trip that was originally imported from Palisis." },
      { type: "info", text: "Auto-sync can be enabled from this page. When ON, incoming Palisis webhooks automatically refresh trip data. When OFF, webhooks are logged but not applied — manual syncs still work." },
    ],
    steps: [
      { title: "Connect Palisis", body: "Enter your Channel ID, API Key, and optional Marketplace ID in Admin → Integrations → Palisis / TourCMS first." },
      { title: "Run a full import", body: "Click Import All from Palisis on the Palisis page. This fetches the entire trip catalog and upserts each trip into the database." },
      { title: "Sync a single trip", body: "On any trip's edit page, scroll to the Palisis panel and click Sync from Palisis to refresh just that trip." },
      { title: "Enable auto-sync", body: "Toggle the Auto-sync switch to ON so that Palisis webhook events automatically keep trip data current without manual intervention." },
    ],
    subSections: [
      {
        title: "Sync Log",
        body: `Every sync operation — whether manual or webhook-triggered — is logged in the palisis_sync_log table. The Palisis page shows recent sync history including timestamp, operation type, number of records updated, and any errors encountered.`,
      },
      {
        title: "What Palisis Sync Covers",
        body: `Trip name and description, pricing (adult, child, group), tour duration, available departure dates and times, capacity, and availability windows. Fields that are not managed by Palisis (internal notes, featured status, custom tags) are not overwritten by sync.`,
      },
    ],
  },
  {
    id: "db-tracker",
    title: "DB Tracker",
    icon: CheckSquare,
    href: "/admin/implementation",
    color: "text-stone-500",
    summary: "A live health-check dashboard showing database table row counts for all 16 tables.",
    body: `The DB Tracker page (also called the Implementation Tracker) runs a live count of every database table and displays the results in a dashboard. It is used during development and monitoring to verify that data is being written to the database correctly.`,
    callouts: [
      { type: "info", text: "This page is intended for developer and administrator use. It does not modify any data — it is read-only." },
    ],
    subSections: [
      {
        title: "What It Shows",
        body: `Each row in the tracker represents one of the 16 database tables. The columns show: table name, current row count, expected minimum count, and a status indicator (green = healthy, amber = low, red = empty when content is expected).

Tables tracked: admin_users, trips, palisis_sync_log, blog_posts, jobs, job_applications, help_articles, support_tickets, ticket_replies, taxonomies, trip_tags, pages, page_revisions, page_content, ai_system_configs, integrations, header_footer_blocks.`,
      },
    ],
  },
]

/* ─── Callout Component ──────────────────────────────────────────────────── */
function Callout({ type, text }: Callout) {
  const styles: Record<CalloutType, { wrap: string; icon: React.ReactNode; label: string }> = {
    info: {
      wrap: "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200",
      icon: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
      label: "Info",
    },
    tip: {
      wrap: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200",
      icon: <Lightbulb className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
      label: "Tip",
    },
    warning: {
      wrap: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200",
      icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
      label: "Warning",
    },
  }
  const s = styles[type]
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${s.wrap}`}>
      {s.icon}
      <div>
        <span className="font-semibold">{s.label}: </span>
        {text}
      </div>
    </div>
  )
}

/* ─── Step Component ─────────────────────────────────────────────────────── */
function Steps({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {i + 1}
          </div>
          <div className="pt-0.5">
            <p className="text-sm font-semibold text-foreground">{step.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Section Card ───────────────────────────────────────────────────────── */
function SectionCard({ section }: { section: DocSection }) {
  const Icon = section.icon
  return (
    <div id={section.id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <Icon className={`h-5 w-5 ${section.color}`} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
            <p className="text-sm text-muted-foreground">{section.summary}</p>
          </div>
        </div>
        {section.href && (
          <Link
            href={section.href}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            Open page
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="mt-5 space-y-5">
        {/* Main body */}
        <div className="space-y-1">
          {section.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">
              {para}
            </p>
          ))}
        </div>

        {/* Steps */}
        {section.steps && section.steps.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">How To</p>
            <Steps steps={section.steps} />
          </div>
        )}

        {/* Callouts */}
        {section.callouts && section.callouts.length > 0 && (
          <div className="space-y-2">
            {section.callouts.map((c, i) => <Callout key={i} {...c} />)}
          </div>
        )}

        {/* Sub-sections */}
        {section.subSections && section.subSections.length > 0 && (
          <div className="space-y-4 border-t border-border pt-4">
            {section.subSections.map((sub, i) => (
              <div key={i}>
                <p className="mb-1.5 text-sm font-semibold text-foreground">{sub.title}</p>
                <div className="space-y-1">
                  {sub.body.split("\n").map((line, j) => (
                    <p key={j} className="text-sm leading-relaxed text-muted-foreground">{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DocsPage() {
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return DOCS
    const q = query.toLowerCase()
    return DOCS.filter((s) => {
      const haystack = [
        s.title, s.summary, s.body,
        ...(s.callouts?.map((c) => c.text) ?? []),
        ...(s.steps?.flatMap((st) => [st.title, st.body]) ?? []),
        ...(s.subSections?.flatMap((ss) => [ss.title, ss.body]) ?? []),
      ].join(" ").toLowerCase()
      return haystack.includes(q)
    })
  }, [query])

  // Keyboard shortcut: / focuses search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape") {
        setQuery("")
        inputRef.current?.blur()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Highlight active TOC item on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    )
    DOCS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex min-h-full">
      {/* TOC — desktop sidebar */}
      <aside className="hidden w-52 shrink-0 xl:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto py-8 pl-4 pr-2">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Contents
          </p>
          <nav className="space-y-0.5">
            {DOCS.map((s) => {
              const Icon = s.icon
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                    activeId === s.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${activeId === s.id ? "text-primary" : s.color}`} />
                  {s.title}
                </a>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 px-4 py-8 lg:px-10">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
            sightseeing.lu
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Admin Documentation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A complete guide to every section of the admin panel.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search documentation… (press / to focus)`}
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Search meta */}
        {query && (
          <p className="mb-5 text-sm text-muted-foreground">
            {filtered.length === 0
              ? "No sections match your search."
              : `${filtered.length} section${filtered.length === 1 ? "" : "s"} matching "${query}"`}
          </p>
        )}

        {/* Quick-nav chips (shown when no search) */}
        {!query && (
          <div className="mb-8 flex flex-wrap gap-2">
            {DOCS.map((s) => {
              const Icon = s.icon
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  <Icon className={`h-3 w-3 ${s.color}`} />
                  {s.title}
                </a>
              )
            })}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-6">
          {filtered.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
          {filtered.length === 0 && query && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">No results for "{query}"</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different keyword or browse the sections using the table of contents.</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="mt-10 rounded-xl border border-border bg-secondary/40 px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Need more help?</span> Check the technical notes in{" "}
            <Link href="/admin/implementation" className="text-primary hover:underline">DB Tracker</Link> or
            {" "}reach out to the development team.
            This documentation covers the admin panel as of the current build — features listed under Known Remaining Items in the project readme are not yet live.
          </p>
        </div>
      </div>
    </div>
  )
}
