"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import {
  Search, X, ChevronDown, ChevronRight, Bot, Send, MessageCircle,
  HelpCircle, BookOpen, LayoutDashboard, Map as MapIcon, FileText, Briefcase,
  Ticket, Layout, Plug, Code2, RefreshCw, CheckSquare,
  Settings, Sparkles, Shield, type LucideIcon,
} from "lucide-react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"

type HelpArticle = {
  id: string
  question: string
  answer: string
  category: string
  status: string
  order: number
  audience: string
}

type Category = {
  id: string
  name: string
  icon: LucideIcon
  description: string
  items: HelpArticle[]
}

const CATEGORY_META: Record<string, { icon: LucideIcon; description: string }> = {
  "Getting Started":  { icon: BookOpen,        description: "Orientation, login, and sidebar navigation" },
  "Dashboard":        { icon: LayoutDashboard,  description: "Stats, quick actions, and recent trips overview" },
  "Trips":            { icon: MapIcon,           description: "Create, edit, publish, archive, and tag trips" },
  "Blog":             { icon: FileText,         description: "Write, edit, and publish blog posts" },
  "Jobs":             { icon: Briefcase,        description: "Job listings, applications, and statuses" },
  "Help & FAQ":       { icon: HelpCircle,       description: "Managing the public knowledge base" },
  "Support Tickets":  { icon: Ticket,           description: "Handling customer support threads" },
  "Pages (CMS)":      { icon: Layout,           description: "Static site pages and revision history" },
  "AI Systems":       { icon: Bot,              description: "Trip Planner, Help Chat, Itinerary AI config" },
  "Integrations":     { icon: Plug,             description: "API keys for Palisis, Maps, Weather, AI" },
  "Header / Footer":  { icon: Code2,            description: "Custom HTML/script injection for every page" },
  "Palisis Import":   { icon: RefreshCw,        description: "Catalog sync and webhook auto-update" },
  "DB Tracker":       { icon: CheckSquare,      description: "Live row counts for all 17 DB tables" },
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function metaFor(name: string) {
  return CATEGORY_META[name] ?? { icon: Settings, description: "Help articles" }
}

const SUGGESTIONS = [
  "How do I publish a trip?",
  "How do I sync from Palisis?",
  "Where do I configure the AI planner?",
  "How do I manage API keys?",
  "What does the DB Tracker show?",
]

function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return ""
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

function ArticleList({
  items,
  openItems,
  toggleItem,
}: {
  items: HelpArticle[]
  openItems: Set<string>
  toggleItem: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
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
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AdminDocsPage() {
  const [articles, setArticles] = useState<HelpArticle[]>([])
  const [loadingArticles, setLoadingArticles] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [chatActive, setChatActive] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/admin/admin-help-chat" }), [])
  const { messages, sendMessage, status } = useChat({ transport })
  const isStreaming = status === "streaming" || status === "submitted"
  const [input, setInput] = useState("")

  useEffect(() => {
    fetch("/api/admin/help")
      .then((r) => r.json())
      .then((data: unknown) => {
        const adminArticles = Array.isArray(data)
          ? (data as HelpArticle[]).filter((a) => a.audience === "admin" && a.status === "published")
          : []
        setArticles(adminArticles)
      })
      .catch(() => setArticles([]))
      .finally(() => setLoadingArticles(false))
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const categories = useMemo<Category[]>(() => {
    const map = new Map<string, Category>()
    const sorted = [...articles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const a of sorted) {
      const name = a.category || "General"
      const id = slugify(name)
      if (!map.has(id)) {
        const meta = metaFor(name)
        map.set(id, { id, name, icon: meta.icon, description: meta.description, items: [] })
      }
      map.get(id)!.items.push(a)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [articles])

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

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSendMessage = (text: string) => {
    if (!text.trim() || isStreaming) return
    sendMessage({ text })
    setChatActive(true)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    handleSendMessage(text)
    setInput("")
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 dark:border-violet-500/20 dark:bg-violet-500/10">
              <Shield className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Admin Documentation</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Admin Help Center</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything you need to manage sightseeing.lu — search articles or ask the AI assistant below.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-500/20 dark:bg-violet-500/10 sm:flex">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-5 max-w-lg">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search admin documentation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-border bg-background py-2.5 pl-11 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
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
      </div>

      {/* Loading state */}
      {loadingArticles && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-violet-500" />
            <span className="text-sm">Loading documentation...</span>
          </div>
        </div>
      )}

      {/* Search results count */}
      {!loadingArticles && searchQuery && (
        <div className="mb-5">
          <p className="text-sm text-muted-foreground">
            Found <span className="font-semibold text-foreground">{totalResults}</span> result{totalResults !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      {/* Category cards — default view */}
      {!loadingArticles && !searchQuery && !activeCategory && categories.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Browse by Topic</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-violet-200 hover:shadow-md dark:hover:border-violet-500/30"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 transition-colors group-hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:group-hover:bg-violet-500/20">
                  <cat.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{cat.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{cat.description}</p>
                  <p className="mt-1.5 text-xs text-violet-600 dark:text-violet-400">{cat.items.length} article{cat.items.length !== 1 ? "s" : ""}</p>
                </div>
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingArticles && !searchQuery && !activeCategory && categories.length === 0 && (
        <div className="mb-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-14 text-center">
          <BookOpen className="mx-auto mb-3 h-9 w-9 text-muted-foreground/30" />
          <p className="font-medium text-foreground">No admin articles found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add articles via Help &amp; FAQ → New Article (set audience to Admin).
          </p>
        </div>
      )}

      {/* Active category view */}
      {!loadingArticles && activeCategory && !searchQuery && (() => {
        const cat = categories.find((c) => c.id === activeCategory)
        if (!cat) return null
        return (
          <div className="mb-10">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-violet-600 hover:underline dark:text-violet-400"
            >
              <ChevronRight className="h-3 w-3 rotate-180" />
              Back to all topics
            </button>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                <cat.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{cat.name}</h2>
                <p className="text-xs text-muted-foreground">{cat.items.length} article{cat.items.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <ArticleList items={cat.items} openItems={openItems} toggleItem={toggleItem} />
          </div>
        )
      })()}

      {/* Search results */}
      {!loadingArticles && searchQuery && (
        <div className="mb-10">
          {filteredCategories.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <HelpCircle className="mx-auto h-9 w-9 text-muted-foreground/30" />
              <p className="mt-3 font-medium text-foreground">No results found</p>
              <p className="mt-1 text-sm text-muted-foreground">Try different keywords or ask the AI assistant below.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredCategories.map((cat) => (
                <div key={cat.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <cat.icon className="h-4 w-4 text-violet-500" />
                    <h3 className="text-sm font-semibold text-foreground">{cat.name}</h3>
                  </div>
                  <ArticleList items={cat.items} openItems={openItems} toggleItem={toggleItem} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Assistant */}
      <div id="chat" className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-violet-50/60 px-5 py-4 dark:bg-violet-500/5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20">
            <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Admin AI Assistant</p>
            <p className="text-xs text-muted-foreground">Trained on admin panel knowledge — ask anything about managing the site</p>
          </div>
          <MessageCircle className="ml-auto h-5 w-5 text-muted-foreground/30" />
        </div>

        {messages.length === 0 && (
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSendMessage(s)}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-violet-200 hover:bg-violet-50 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10"
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
                          ? "bg-violet-600 text-white"
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
              placeholder="Ask about managing trips, AI config, integrations, Palisis..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isStreaming}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
