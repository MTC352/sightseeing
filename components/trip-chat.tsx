"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import { Send, Bot, Sparkles, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react"

interface TripChatProps {
  tripId: string
  tripTitle: string
  faqs: { question: string; answer: string }[]
}

const SUGGESTIONS = [
  "Good for kids?",
  "How long does it take?",
  "What's nearby?",
  "Best time to visit?",
  "What should I wear?",
  "Can I cancel or reschedule?",
  "Is it wheelchair accessible?",
  "What languages are available?",
]

function getMessageText(msg: UIMessage): string {
  if (!msg.parts || !Array.isArray(msg.parts)) return ""
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

export function TripChat({ tripId, tripTitle, faqs }: TripChatProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [chatActive, setChatActive] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "up" | "down">>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState("")

  const sendFeedback = useCallback(async (messageId: string, vote: "up" | "down") => {
    setFeedbackGiven((prev) => ({ ...prev, [messageId]: vote }))
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, vote, source: "trip-chat", tripId, timestamp: new Date().toISOString() }),
    })
  }, [tripId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/trip-chat",
        prepareSendMessagesRequest: ({ id, messages: msgs }) => ({
          body: { id, messages: msgs, tripId },
        }),
      }),
    [tripId]
  )

  const { messages, sendMessage, status } = useChat({ transport })
  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (chatActive && inputRef.current) inputRef.current.focus()
  }, [chatActive])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    sendMessage({ text })
    setInput("")
    if (!chatActive) setChatActive(true)
  }

  const handleSuggestion = (text: string) => {
    sendMessage({ text })
    setChatActive(true)
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold text-foreground">Good to know</h2>

      {/* FAQ Accordion */}
      <div className="mt-4 flex flex-col gap-2">
        {faqs.map((faq, i) => (
          <div key={i} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-foreground"
            >
              {faq.question}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  openFaq === i ? "rotate-180" : ""
                }`}
              />
            </button>
            {openFaq === i && (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chat section */}
      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border bg-primary/5 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {"Still have questions? Ask our AI"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {"Knows everything about "}{tripTitle}
            </p>
          </div>
        </div>

        {/* Suggestions (always visible when no conversation) */}
        {messages.length === 0 && (
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">Popular questions:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {chatActive && messages.length > 0 && (
          <div
            ref={scrollRef}
            className="max-h-[320px] overflow-y-auto px-4 py-3"
          >
            <div className="space-y-3">
              {messages.map((msg) => {
                const text = getMessageText(msg)
                if (!text) return null
                const isAssistant = msg.role === "assistant"
                const voted = feedbackGiven[msg.id]
                return (
                  <div key={msg.id} className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isAssistant ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"
                    }`}>
                      {text}
                    </div>
                    {isAssistant && !isStreaming && (
                      <div className="mt-1 flex items-center gap-1 pl-1">
                        {voted ? (
                          <span className="text-[10px] text-muted-foreground">Thanks!</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => sendFeedback(msg.id, "up")}
                              className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-primary" aria-label="Helpful">
                              <ThumbsUp className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => sendFeedback(msg.id, "down")}
                              className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-destructive" aria-label="Not helpful">
                              <ThumbsDown className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-secondary px-3.5 py-2.5">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
                    <div
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                      style={{ animationDelay: "75ms" }}
                    />
                    <div
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                      style={{ animationDelay: "150ms" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Follow-up suggestions after AI responds */}
            {messages.length > 0 &&
              messages[messages.length - 1]?.role === "assistant" &&
              !isStreaming && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.filter(
                    (s) =>
                      !messages.some(
                        (m) => m.role === "user" && getMessageText(m) === s
                      )
                  )
                    .slice(0, 3)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSuggestion(s)}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        {s}
                      </button>
                    ))}
                </div>
              )}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask anything about this trip..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isStreaming}
              className="flex-1 rounded-full border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
