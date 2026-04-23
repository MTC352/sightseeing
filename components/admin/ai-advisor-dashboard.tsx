"use client"

import { useRef, useEffect, useState, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import useSWR from "swr"
import {
  Send,
  Bot,
  Sparkles,
  TrendingUp,
  Newspaper,
  Target,
  Zap,
  Globe,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  RefreshCw,
  X,
  DollarSign,
  Trophy,
  Lightbulb,
  Calendar,
  Ticket,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AppState {
  stats: {
    totalTrips: number
    publishedTrips: number
    draftTrips: number
    featuredTrips: number
    tripsWithGoogleReviews: number
    totalPosts: number
    publishedPosts: number
    draftPosts: number
  }
  integrations: {
    weglot: boolean
    googlePlaces: boolean
    mapbox: boolean
    openWeather: boolean
    blob: boolean
  }
  aiSystems: {
    planner: { model: string; configured: boolean }
    chat: { model: string; configured: boolean }
    help: { model: string; configured: boolean }
  }
  categories: string[]
  cities: string[]
}

interface RoadmapItem {
  id: string
  title: string
  description: string
  priority: "high" | "medium" | "low"
  effort: "low" | "medium" | "high"
  category: string
  budgetRange: string
  wins: string[]
  details: string
}

interface NewsItem {
  id: string
  title: string
  source: string
  category: string
  date: string
  updatedAt: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return ""
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

// Rich markdown renderer for AI responses
function RichMarkdownContent({ content }: { content: string }) {
  // Parse numbered lists into cards
  const parseNumberedList = (text: string) => {
    const lines = text.split("\n")
    const items: { number: number; title: string; bullets: string[] }[] = []
    let currentItem: { number: number; title: string; bullets: string[] } | null = null
    let introText = ""
    let outroText = ""
    let foundFirstItem = false
    let doneWithItems = false

    for (const line of lines) {
      const numberedMatch = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*:?\s*$/)
      const bulletMatch = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*(.+)$/)
      const simpleBulletMatch = line.match(/^\s*-\s+(.+)$/)

      if (numberedMatch) {
        foundFirstItem = true
        if (currentItem) items.push(currentItem)
        currentItem = { number: parseInt(numberedMatch[1]), title: numberedMatch[2], bullets: [] }
      } else if (currentItem && (bulletMatch || simpleBulletMatch)) {
        if (bulletMatch) {
          currentItem.bullets.push(`**${bulletMatch[1]}:** ${bulletMatch[2]}`)
        } else if (simpleBulletMatch) {
          currentItem.bullets.push(simpleBulletMatch[1])
        }
      } else if (line.trim() && !foundFirstItem) {
        introText += line + "\n"
      } else if (line.trim() && foundFirstItem && !line.match(/^\d+\./) && !line.match(/^\s*-/)) {
        doneWithItems = true
        outroText += line + "\n"
      }
    }
    if (currentItem) items.push(currentItem)
    
    return { introText: introText.trim(), items, outroText: outroText.trim() }
  }

  // Format inline markdown
  const formatInlineMarkdown = (text: string) => {
    const parts: React.ReactNode[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>)
        }
        parts.push(<strong key={key++} className="font-semibold text-foreground">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else {
        parts.push(<span key={key++}>{remaining}</span>)
        break
      }
    }
    return parts
  }

  const { introText, items, outroText } = parseNumberedList(content)

  // If we found numbered items, render them as cards
  if (items.length > 0) {
    return (
      <div className="space-y-3">
        {introText && <p className="text-sm leading-relaxed">{formatInlineMarkdown(introText)}</p>}
        
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-border/50 bg-card/50 p-3">
              <div className="mb-2 flex items-start gap-2">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {item.number}
                </span>
                <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
              </div>
              {item.bullets.length > 0 && (
                <div className="ml-7 space-y-1.5">
                  {item.bullets.map((bullet, bIdx) => (
                    <div key={bIdx} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                      <p className="text-xs leading-relaxed text-muted-foreground">{formatInlineMarkdown(bullet)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {outroText && <p className="text-sm leading-relaxed text-muted-foreground">{formatInlineMarkdown(outroText)}</p>}
      </div>
    )
  }

  // Fallback: render with basic markdown formatting
  const paragraphs = content.split("\n\n").filter(p => p.trim())
  
  return (
    <div className="space-y-2">
      {paragraphs.map((para, idx) => {
        // Check if it's a bullet list
        if (para.includes("\n- ") || para.startsWith("- ")) {
          const bullets = para.split("\n").filter(l => l.startsWith("- "))
          return (
            <div key={idx} className="space-y-1">
              {bullets.map((bullet, bIdx) => (
                <div key={bIdx} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed">{formatInlineMarkdown(bullet.replace(/^-\s+/, ""))}</p>
                </div>
              ))}
            </div>
          )
        }
        return <p key={idx} className="text-sm leading-relaxed">{formatInlineMarkdown(para)}</p>
      })}
    </div>
  )
}

const CHAT_STARTERS = [
  {
    label: "Quick wins",
    prompt: "What are the top 3 quick wins I can implement this week to improve conversions?",
    icon: Zap,
  },
  {
    label: "AI roadmap",
    prompt: "What AI features should I prioritize for the next quarter based on my current setup?",
    icon: Sparkles,
  },
  {
    label: "Growth strategy",
    prompt: "Analyze my current state and suggest a 90-day growth plan with measurable goals.",
    icon: TrendingUp,
  },
  {
    label: "Industry trends",
    prompt: "What travel industry trends should I be aware of and how can I capitalize on them?",
    icon: Globe,
  },
]

const priorityColors = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
}

const categoryIcons: Record<string, typeof Zap> = {
  "social-proof": CheckCircle2,
  content: Newspaper,
  growth: TrendingUp,
  automation: RefreshCw,
  ai: Sparkles,
}

export function AIAdvisorDashboard() {
  const { data, isLoading: isLoadingState, mutate } = useSWR<{
    appState: AppState
    roadmapItems: RoadmapItem[]
    industryNews: NewsItem[]
    lastUpdated: string
  }>("/api/admin/ai-advisor", fetcher)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin/ai-advisor",
        prepareSendMessagesRequest: ({ id, messages: msgs }) => ({
          body: { id, messages: msgs },
        }),
      }),
    []
  )

  const { messages, sendMessage, setMessages, status } = useChat({ transport })
  const isLoading = status === "streaming" || status === "submitted"
  
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [selectedRoadmapItem, setSelectedRoadmapItem] = useState<RoadmapItem | null>(null)
  const [ticketFormData, setTicketFormData] = useState<{ subject: string; description: string } | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleStarterClick = (prompt: string) => {
    sendMessage({ text: prompt })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    sendMessage({ text })
    setInput("")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const roadmapItems = data?.roadmapItems || []
  const industryNews = data?.industryNews || []
  const lastUpdated = data?.lastUpdated

  return (
    <div className="space-y-6">
      {/* Top row: Roadmap Suggestions | Industry News */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Col 1: Roadmap Suggestions */}
        <div className="flex flex-col rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Roadmap Suggestions</h3>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => mutate()}
                disabled={isLoadingState}
                title="Regenerate suggestions"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", isLoadingState && "animate-spin")} />
                Regenerate
              </button>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {roadmapItems.length} items
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingState ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {roadmapItems.map((item) => {
                  const Icon = categoryIcons[item.category] || Target
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedRoadmapItem(item)}
                      className="group w-full rounded-xl border border-border bg-secondary/30 p-3 text-left transition-all hover:border-primary/30 hover:bg-secondary/50"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-3 w-3 text-primary" />
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase",
                              priorityColors[item.priority]
                            )}
                          >
                            {item.priority}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {item.effort} effort
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          <DollarSign className="h-2.5 w-2.5" />
                          {item.budgetRange || "TBD"}
                        </span>
                        <span className="text-[9px] text-primary">Click for details</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Col 2: Industry News */}
        <div className="flex flex-col rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Newspaper className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Industry News</h3>
            <div className="ml-auto flex items-center gap-2">
              {lastUpdated && (
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5" />
                  Updated {new Date(lastUpdated).toLocaleDateString()}
                </span>
              )}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {industryNews.length} items
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingState ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {industryNews.map((news) => (
                  <div
                    key={news.id}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Newspaper className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium leading-snug text-foreground">{news.title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {news.category}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{news.source}</span>
                        <span className="text-[9px] text-muted-foreground/60">{news.date}</span>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Full-width AI Strategy Chat */}
      <div className="flex h-[620px] flex-col rounded-2xl border border-border bg-card">
        {/* Chat Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">AI Strategy Advisor</h3>
            <p className="text-[11px] text-muted-foreground">Get personalized recommendations for growth and automation</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setInput("") }}
              title="Reset conversation"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Reset chat
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h4 className="mb-2 text-lg font-semibold text-foreground">How can I help you grow?</h4>
              <p className="mb-8 max-w-lg text-center text-sm text-muted-foreground">
                I analyze your platform state and provide actionable recommendations for AI features, automation, and
                growth strategies tailored to sightseeing.lu.
              </p>

              {/* Chat Starters */}
              <div className="grid w-full max-w-2xl grid-cols-2 gap-3 lg:grid-cols-4">
                {CHAT_STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    onClick={() => handleStarterClick(starter.prompt)}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-secondary/30 p-4 text-left transition-all hover:border-primary/30 hover:bg-secondary/50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <starter.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{starter.label}</p>
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{starter.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[75%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
                      <p className="text-sm leading-relaxed">{getMessageText(message)}</p>
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-2xl border border-border/50 bg-card px-5 py-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-xs font-semibold text-primary">AI Advisor</span>
                      </div>
                      <RichMarkdownContent content={getMessageText(message)} />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <form id="advisor-chat-form" onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about AI features, growth strategies, automation opportunities, or industry trends..."
              className="flex-1 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>

      {/* Roadmap Detail Modal */}
      {selectedRoadmapItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedRoadmapItem(null)}>
          <div 
            className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  {(() => {
                    const Icon = categoryIcons[selectedRoadmapItem.category] || Target
                    return <Icon className="h-5 w-5 text-primary" />
                  })()}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{selectedRoadmapItem.title}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase", priorityColors[selectedRoadmapItem.priority])}>
                      {selectedRoadmapItem.priority} priority
                    </span>
                    <span className="text-[10px] text-muted-foreground">{selectedRoadmapItem.effort} effort</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedRoadmapItem(null)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-5 p-5">
              {/* Description */}
              <div>
                <p className="text-sm leading-relaxed text-muted-foreground">{selectedRoadmapItem.details || selectedRoadmapItem.description}</p>
              </div>

              {/* Budget Scale */}
              <div className="rounded-xl bg-secondary/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Budget Estimate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all",
                          selectedRoadmapItem.budgetRange === "$0 - $100" ? "w-1/4 bg-emerald-500" :
                          selectedRoadmapItem.budgetRange === "$100 - $500" ? "w-1/2 bg-amber-500" :
                          selectedRoadmapItem.budgetRange === "$500 - $2000" ? "w-3/4 bg-orange-500" :
                          "w-full bg-red-500"
                        )}
                      />
                    </div>
                  </div>
                  <span className="min-w-[80px] rounded-lg bg-primary/10 px-3 py-1.5 text-center text-xs font-semibold text-primary">
                    {selectedRoadmapItem.budgetRange || "TBD"}
                  </span>
                </div>
              </div>

              {/* Expected Wins */}
              <div className="rounded-xl bg-secondary/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-foreground">Expected Wins</span>
                </div>
                <div className="space-y-2">
                  {(selectedRoadmapItem.wins || []).length > 0 ? (
                    selectedRoadmapItem.wins.map((win, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                        <span className="text-xs text-muted-foreground">{win}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No specific wins documented yet.</p>
                  )}
                </div>
              </div>

              {/* Implementation Hint */}
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ask the AI Strategy Advisor below for detailed implementation steps and best practices for this feature.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col gap-3 border-t border-border p-5">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const title = selectedRoadmapItem.title
                    setSelectedRoadmapItem(null)
                    // Send the message to AI chat
                    sendMessage({ text: `How do I implement "${title}"? Give me a step-by-step plan with timeline and resource requirements.` })
                    // Scroll to chat section after a short delay to allow rendering
                    setTimeout(() => {
                      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
                    }, 100)
                  }}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Ask AI for Implementation Plan
                </button>
                <button onClick={() => setSelectedRoadmapItem(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary">
                  Close
                </button>
              </div>
              <button
                onClick={() => {
                  const subject = `Feature Request: ${selectedRoadmapItem.title}`
                  const description = `I would like to request an offer for implementing this feature:\n\n**Feature:** ${selectedRoadmapItem.title}\n**Description:** ${selectedRoadmapItem.details || selectedRoadmapItem.description}\n**Priority:** ${selectedRoadmapItem.priority}\n**Estimated Effort:** ${selectedRoadmapItem.effort}\n**Budget Range:** ${selectedRoadmapItem.budgetRange || "TBD"}\n\n**Expected Wins:**\n${(selectedRoadmapItem.wins || []).map(w => `- ${w}`).join("\n") || "- TBD"}\n\nPlease provide a detailed quote and timeline for implementation.`
                  setTicketFormData({ subject, description })
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Ticket className="h-4 w-4" />
                Request Offer via Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Creation Modal */}
      {ticketFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTicketFormData(null)}>
          <div 
            className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Ticket className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Request Feature Offer</h3>
                  <p className="text-xs text-muted-foreground">Submit a ticket to request implementation</p>
                </div>
              </div>
              <button onClick={() => setTicketFormData(null)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setTicketLoading(true)
                try {
                  const res = await fetch("/api/admin/tickets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subject: ticketFormData.subject,
                      description: ticketFormData.description,
                      category: "feature",
                      priority: "medium",
                    }),
                  })
                  if (!res.ok) throw new Error("Failed to create ticket")
                  setTicketFormData(null)
                  setSelectedRoadmapItem(null)
                  alert("Ticket created successfully! Check the Support Tickets page to track its status.")
                } catch (error) {
                  console.error("Error creating ticket:", error)
                  alert("Failed to create ticket. Please try again.")
                } finally {
                  setTicketLoading(false)
                }
              }}
              className="space-y-4 p-5"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Subject</label>
                <input
                  type="text"
                  value={ticketFormData.subject}
                  onChange={(e) => setTicketFormData({ ...ticketFormData, subject: e.target.value })}
                  className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Description</label>
                <textarea
                  value={ticketFormData.description}
                  onChange={(e) => setTicketFormData({ ...ticketFormData, description: e.target.value })}
                  rows={10}
                  className="w-full resize-none rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={ticketLoading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {ticketLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                  Submit Ticket
                </button>
                <button
                  type="button"
                  onClick={() => setTicketFormData(null)}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
