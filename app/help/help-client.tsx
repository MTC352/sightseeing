"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import {
  Search, ChevronDown, ChevronRight, Bot, Send, MessageCircle,
  HelpCircle, CreditCard, Calendar, Smartphone, Bus, MapPin,
  Mail, Phone, FileText, Clock, Ticket, Download, Users, Globe,
  Accessibility as AccessibilityIcon, X,
} from "lucide-react"
import { EditableText } from "@/components/editable-text"

/* ─────────────────────────────────────────────────────────────
   TYPES — articles come from the DB (admin panel)
───────────────────────────────────────────────────────────── */

export interface HelpAttachment {
  id: string
  filename: string
  title?: string | null
  url: string
  mimeType?: string | null
  sizeBytes?: number | null
}

export interface HelpArticle {
  id: string
  question: string
  answer: string
  category: string
  status?: string | null
  order?: number | null
  attachments?: HelpAttachment[] | null
}

function formatBytes(n?: number | null): string {
  if (!n) return ""
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function AttachmentList({ attachments }: { attachments?: HelpAttachment[] | null }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Attachments</p>
      {attachments.map((a) => {
        const size = formatBytes(a.sizeBytes)
        return (
          <a
            key={a.id || a.url}
            href={a.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40"
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium">{a.title || a.filename}</span>
            {size && <span className="shrink-0 text-[11px] text-muted-foreground">{size}</span>}
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        )
      })}
    </div>
  )
}

interface FaqCategory {
  id: string
  name: string
  icon: React.ElementType
  description: string
  items: HelpArticle[]
}

/* ─────────────────────────────────────────────────────────────
   CATEGORY ICON / DESCRIPTION MAP
   Falls back to a generic icon for any category the admin adds.
───────────────────────────────────────────────────────────── */

const CATEGORY_META: Record<string, { icon: React.ElementType; description: string }> = {
  general:        { icon: HelpCircle,         description: "About sightseeing.lu and what we offer" },
  booking:        { icon: CreditCard,         description: "Payments, refunds, and booking issues" },
  payments:       { icon: CreditCard,         description: "Payment methods, refunds, and billing" },
  cancellation:   { icon: Calendar,           description: "Cancellation policies and refund information" },
  cancellations:  { icon: Calendar,           description: "Cancellation policies and refund information" },
  app:            { icon: Smartphone,         description: "Using the sightseeing.lu mobile app" },
  "city-tours":   { icon: Bus,                description: "Information about our signature tours" },
  tours:          { icon: Bus,                description: "Information about our tours" },
  "meeting-points": { icon: MapPin,           description: "Pickup information and meeting points" },
  locations:      { icon: MapPin,             description: "Locations and meeting points" },
  accessibility:  { icon: AccessibilityIcon,  description: "Accessibility information and accommodations" },
  groups:         { icon: Users,              description: "Group bookings and special arrangements" },
  languages:      { icon: Globe,              description: "Available languages and translations" },
  other:          { icon: FileText,           description: "Additional policies and information" },
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

function metaForCategory(name: string): { icon: React.ElementType; description: string } {
  const slug = slugify(name)
  return CATEGORY_META[slug] ?? { icon: FileText, description: `Articles about ${name}` }
}

/* ─────────────────────────────────────────────────────────────
   QUICK LINKS & SUGGESTIONS
───────────────────────────────────────────────────────────── */

const QUICK_LINKS = [
  { label: "Download the App", href: "#app", icon: Download },
  { label: "City Train Timetable", href: "/departures", icon: Clock },
  { label: "Contact Us", href: "#contact", icon: Mail },
  { label: "Explore Tours", href: "/explore", icon: Ticket },
]

const HELP_SUGGESTIONS = [
  "How do I cancel my booking?",
  "What payment methods are accepted?",
  "Do I need the app for City Bus Tour?",
  "How long before can I cancel?",
  "Is there Wi-Fi on the bus?",
]

/* ─────────────────────────────────────────────────────────────
   HELPER — extract text from AI SDK UIMessage
───────────────────────────────────────────────────────────── */

function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return ""
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/* ─────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────── */

interface Props {
  articles: HelpArticle[]
}

export function HelpClient({ articles }: Props) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [chatActive, setChatActive] = useState(false)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/help-chat" }), [])
  const { messages, sendMessage, status } = useChat({ transport })
  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // ── Build categories dynamically from DB articles ────────────────────────
  const categories: FaqCategory[] = useMemo(() => {
    const map = new Map<string, FaqCategory>()
    const sorted = [...articles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const a of sorted) {
      const name = a.category || "Other"
      const id = slugify(name)
      if (!map.has(id)) {
        const meta = metaForCategory(name)
        map.set(id, { id, name, icon: meta.icon, description: meta.description, items: [] })
      }
      map.get(id)!.items.push(a)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [articles])

  // ── Filter by search ─────────────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories
    const q = searchQuery.toLowerCase()
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) ||
            item.answer.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [searchQuery, categories])

  const totalResults = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0)

  const popularArticles = useMemo(() => {
    // First article from each category, capped at 6
    const out: { article: HelpArticle; category: FaqCategory }[] = []
    for (const cat of categories) {
      if (cat.items[0]) out.push({ article: cat.items[0], category: cat })
      if (out.length >= 6) break
    }
    return out
  }, [categories])

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput("")
    setChatActive(true)
  }

  const handleSuggestion = (text: string) => {
    sendMessage({ text })
    setChatActive(true)
  }

  return (
    <>
      {/* Hero with search */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center lg:py-20">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Help Center</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground lg:text-4xl">
            <EditableText id="help:hero:heading" defaultValue="How can we help you?" />
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            <EditableText
              id="help:hero:subheading"
              defaultValue="Search our knowledge base or browse categories below. Can't find what you need? Chat with our AI assistant or contact us directly."
              multiline
            />
          </p>

          {/* Search bar */}
          <div className="relative mx-auto mt-8 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-border bg-card py-3.5 pl-12 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick links */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <link.icon className="h-3 w-3" />
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8" data-testid="help-content">

        {/* Search results indicator */}
        {searchQuery && (
          <div className="mb-6">
            <p className="text-sm text-muted-foreground">
              Found <span className="font-semibold text-foreground">{totalResults}</span> result{totalResults !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
            </p>
          </div>
        )}

        {/* Empty state — no published articles in DB */}
        {categories.length === 0 && !searchQuery && (
          <div className="mb-12 rounded-xl border border-border bg-card p-8 text-center">
            <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-foreground">No help articles yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Our team is still preparing the knowledge base. In the meantime, chat with our AI assistant below.
            </p>
          </div>
        )}

        {/* Category cards (shown when no search, no active category, and there are articles) */}
        {!searchQuery && !activeCategory && categories.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-6 text-xl font-bold text-foreground">Browse by Category</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="help-categories">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  data-testid={`help-category-${cat.id}`}
                  className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <cat.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{cat.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{cat.description}</p>
                    <p className="mt-2 text-xs text-primary">{cat.items.length} article{cat.items.length !== 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active category view */}
        {activeCategory && !searchQuery && (
          <div className="mb-12">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ChevronRight className="h-3 w-3 rotate-180" />
              Back to all categories
            </button>
            {(() => {
              const cat = categories.find((c) => c.id === activeCategory)
              if (!cat) return null
              return (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <cat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{cat.name}</h2>
                      <p className="text-sm text-muted-foreground">{cat.items.length} article{cat.items.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {cat.items.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          data-testid={`help-article-${item.id}`}
                          className="flex w-full items-center justify-between p-4 text-left"
                        >
                          <span className="text-sm font-medium text-foreground">{item.question}</span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                              openItems.has(item.id) ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {openItems.has(item.id) && (
                          <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                            {item.answer}
                            <AttachmentList attachments={item.attachments} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* Search results */}
        {searchQuery && (
          <div className="mb-12">
            {filteredCategories.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 font-medium text-foreground">No results found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try different keywords or ask our AI assistant below.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredCategories.map((cat) => (
                  <div key={cat.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <cat.icon className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-foreground">{cat.name}</h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      {cat.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className="flex w-full items-center justify-between p-4 text-left"
                          >
                            <span className="text-sm font-medium text-foreground">{item.question}</span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                openItems.has(item.id) ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {openItems.has(item.id) && (
                            <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                              {item.answer}
                              <AttachmentList attachments={item.attachments} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Help chat */}
        <div id="chat" className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Can&apos;t find an answer? Ask our AI</p>
              <p className="text-xs text-muted-foreground">Trained on our full knowledge base — available 24/7</p>
            </div>
            <MessageCircle className="ml-auto h-5 w-5 text-muted-foreground/40" />
          </div>

          {messages.length === 0 && (
            <div className="px-5 py-4">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {HELP_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatActive && messages.length > 0 && (
            <div ref={scrollRef} className="max-h-80 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {messages.map((msg) => {
                  const text = getMessageText(msg)
                  if (!text) return null
                  return (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {text}
                      </div>
                    </div>
                  )
                })}
                {isStreaming && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl bg-secondary px-4 py-3">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: "75ms" }} />
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Ask a question about booking, payments, the app..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={isStreaming}
                className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Contact section */}
        <section id="contact" className="mt-12 rounded-2xl border border-border bg-card p-6 lg:p-8">
          <h2 className="text-xl font-bold text-foreground">Still need help?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Our team typically responds within 24 hours. We&apos;re here to help with any questions about your booking or experience.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <a
              href="mailto:hello@sightseeing.lu"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Email</p>
                <p className="text-xs text-primary">hello@sightseeing.lu</p>
              </div>
            </a>
            <a
              href="tel:+3522665122002250"
              className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Phone</p>
                <p className="text-xs text-muted-foreground">+352 266 51-2200</p>
              </div>
            </a>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Address</p>
                <p className="text-xs text-muted-foreground">430-434 Route de Longwy, L-1940</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Office hours: Monday – Friday, 8:30 am – 5:30 pm
          </p>
        </section>

        {/* Popular articles */}
        {popularArticles.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-6 text-xl font-bold text-foreground">Popular Articles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popularArticles.map(({ article, category }) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.id)
                    setOpenItems(new Set([article.id]))
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <category.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">{article.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{category.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
