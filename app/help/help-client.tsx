"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import {
  Search, ChevronDown, ChevronRight, Bot, Send, MessageCircle,
  HelpCircle, CreditCard, Calendar, Smartphone, Bus, MapPin,
  Users, Clock, Globe, Mail, Phone, FileText, ExternalLink,
  X, Ticket, Download
} from "lucide-react"
import { EditableText } from "@/components/editable-text"

/* ─────────────────────────────────────────────────────────────
   FAQ DATA — extracted from sightseeing.lu/help
───────────────────────────────────────────────────────────── */

interface FaqItem { id: string; question: string; answer: string }
interface FaqCategory { id: string; name: string; icon: React.ElementType; description: string; items: FaqItem[] }

const FAQ_DATA: FaqCategory[] = [
  {
    id: "general",
    name: "General",
    icon: HelpCircle,
    description: "About sightseeing.lu and what we offer",
    items: [
      {
        id: "what-is-sightseeing",
        question: "What is sightseeing.lu?",
        answer: "Sightseeing.lu, created in 2019 and part of the SLG group, has quickly positioned itself as the leading online booking platform for activities in Luxembourg. Both locals and tourists can buy tickets, audio guides, city tours, and more with just a few clicks. Via the website you will find all the information you need, and you can book your tour or activity online — the ticket will be sent to your mailbox. Some activities require you to download the sightseeing.lu App to retrieve the tour content on your phone (route, audio, and text content)."
      },
      {
        id: "what-offering",
        question: "What is sightseeing.lu offering?",
        answer: "Sightseeing.lu plays a significant role for tourism in Luxembourg. We have been offering tours, namely City Tour and City Train Tours for nearly 20 years! However, we now have much more to offer than those classic sightseeing tours. We extended our product range with a focus on tours with audio guide, bike tours, day tours and walking tours. This way you can choose whether you want to use your smartphone as guide, or if you prefer a live guide to show you around. Make sure to check our website frequently as we are constantly adding new activities."
      },
      {
        id: "operating-hours",
        question: "What are your operating hours?",
        answer: "Our office in Merl-Luxembourg is open Monday to Friday from 8:30 am to 5:30 pm. All our self-guided tours can be booked throughout the whole year — all you need is a smartphone and our app. Activities that depend on weather (City Tour, City Train) have up-to-date calendars on our website."
      },
      {
        id: "languages",
        question: "Are your activities available in different languages?",
        answer: "Yes! We use country flags to show you in what languages each activity or tour is available. These flags appear on the product cards and on each activity page. The content available in those languages is either the audio guide in our vehicles or the content referring to the points of interest in our app."
      },
      {
        id: "blue-pinpoint",
        question: "What does the blue pinpoint on a product card mean?",
        answer: "The pinpoint represents a key feature of our logo. We use it on product cards to mark our personal recommendations and bestsellers. Products marked with a pinpoint are either recommendations by sightseeing.lu or the most popular activities among travelers in Luxembourg."
      },
    ]
  },
  {
    id: "booking",
    name: "Booking & Payments",
    icon: CreditCard,
    description: "Payments, refunds, and booking issues",
    items: [
      {
        id: "payment-problems",
        question: "I have problems with my payment. What can I do?",
        answer: "Please double check that you've entered your details correctly and try again. If your purchase still can't be completed, please try a different payment method or contact your bank. Feel free to email us at hello@sightseeing.lu if you have any questions about making a payment."
      },
      {
        id: "pay-on-arrival",
        question: "Can I pay on arrival, in cash or by credit card?",
        answer: "It is possible to pay on arrival, but we prefer the payment process to be done on our website sightseeing.lu to avoid any problems or queues at the starting point."
      },
      {
        id: "lost-confirmation",
        question: "I have lost my booking confirmation. What can I do?",
        answer: "Please contact our team directly at hello@sightseeing.lu and we'll send you a new confirmation by email."
      },
      {
        id: "group-discount",
        question: "Is there a group discount on tour tickets?",
        answer: "For our Luxembourg City Bus Tour and for the City Train, you can find group tickets in the booking widget. You can also ask for a discount if you are traveling in a group of min. 10 people. Please send your request including your name, phone number, number of participants, and date & time to hello@sightseeing.lu."
      },
    ]
  },
  {
    id: "cancellation",
    name: "Cancellations & Refunds",
    icon: Calendar,
    description: "Cancellation policies and refund information",
    items: [
      {
        id: "cancellation-policy",
        question: "What is your cancellation policy?",
        answer: "Your booking will either be fully refundable, partially refundable or non-refundable depending on the supplier's policy. All cancelable bookings will display a deadline for cancellation on the product page."
      },
      {
        id: "supplier-cancels",
        question: "What happens if the supplier cancels my booking?",
        answer: "If the supplier cancels your booking, please contact us directly at hello@sightseeing.lu to receive a full refund."
      },
      {
        id: "refund-question",
        question: "I have a question regarding my refund",
        answer: "Refunds can take 3-4 business days to appear in your account. However, some credit card companies have different processing times. Also, refunds within Luxembourg will be faster than abroad. Please contact us at hello@sightseeing.lu if you have any questions regarding refunds."
      },
    ]
  },
  {
    id: "app",
    name: "About the App",
    icon: Smartphone,
    description: "Using the sightseeing.lu mobile app",
    items: [
      {
        id: "why-download-app",
        question: "Why/when do I need to download the APP sightseeing.lu?",
        answer: "For classic tours like the Luxembourg City Bus Tour and City Train, you can book tickets online without the app — tickets are sent via email. However, for new activities like Walking or e-Bike tours, you will need the app to validate your ticket and access the tour contents. After booking, you'll receive a QR code via email. Download the app, scan the QR code, and the content (route, GPS map, audio, texts) will appear on your phone."
      },
      {
        id: "app-login",
        question: "The App asks me to enter a username and password - where do I get that information?",
        answer: "In addition to the QR code, your ticket also contains login credentials. If you booked the tour with your phone and cannot scan the QR code, you can copy and paste the login credentials from your ticket into the dedicated fields inside the app to get access to the contents."
      },
      {
        id: "full-vs-light",
        question: "What is the difference between the 'full' and 'light' version of the app?",
        answer: "Both versions are free to download. The only difference is that the 'light' version requires an internet connection to use, while the 'full' version allows you to access audio, images, and text even when you're offline after downloading your purchased activity."
      },
    ]
  },
  {
    id: "city-tours",
    name: "City Bus Tour & City Train",
    icon: Bus,
    description: "Information about our signature tours",
    items: [
      {
        id: "recognize-bus-stop",
        question: "How do I recognize a City Bus stop?",
        answer: "The City Bus stops look like normal bus stops and contain a sign. The City Bus stop is on the Montée de Clausen, Um Bock (near the entrance to Casemates du Bock) and can be easily recognized. This is also the departure point for the City Train."
      },
      {
        id: "bring-dog",
        question: "Is it allowed to bring a dog?",
        answer: "It depends on the size of the dog. If it's a small dog which can be kept on your lap, it's possible. In any case, please send us an email to hello@sightseeing.lu to confirm."
      },
      {
        id: "wifi-on-buses",
        question: "Is there Wi-Fi on your buses?",
        answer: "Yes, all our Bus Tours have free Wi-Fi."
      },
      {
        id: "48-hour-tickets",
        question: "Can 48-hour tickets be used on two separate days of the week?",
        answer: "No – the 48-hour ticket is valid for 48 consecutive hours from the first validation. This concerns all our combination tickets with the museums of the city of Luxembourg. Please note that the 48-hour validity applies only to the entrance ticket for the 7 museums. The ticket for the Luxembourg City Bus Tour has a validity of only 24 hours, and for the City Train the ticket is valid for a single trip."
      },
    ]
  },
  {
    id: "meeting-points",
    name: "Meeting Points & Locations",
    icon: MapPin,
    description: "Pickup information and meeting points",
    items: [
      {
        id: "pickup-info",
        question: "Where can I find pick-up information?",
        answer: "For most of our products, the location of the meeting point can be found in the product description. It will also appear on the booking confirmation."
      },
      {
        id: "change-meeting-point",
        question: "Can I change the meeting point?",
        answer: "You can only change the meeting point in case of a private tour. Otherwise, it is not possible."
      },
      {
        id: "coach-parking",
        question: "Where can I park my coach?",
        answer: "Coach parking and facilities information is available on our dedicated parking map. Please contact us at hello@sightseeing.lu for the detailed map."
      },
      {
        id: "free-parking",
        question: "Where can I park for free in the city?",
        answer: "There are some free car parks in Luxembourg City. Visit the city's official parking information for more details."
      },
    ]
  },
  {
    id: "other",
    name: "Other Information",
    icon: FileText,
    description: "Additional policies and information",
    items: [
      {
        id: "cleaning-fees",
        question: "Are there additional cleaning fees for private hire?",
        answer: "Any damage to the equipment during service will be charged. Damage to interior equipment or other damage inflicted on the vehicle will be the responsibility of the person who made the booking. In case of extra cleaning (e.g. due to voluntary spraying of liquid, vomiting) a fee of €300.00 will apply."
      },
    ]
  },
]

/* ─────────────────────────────────────────────────────────────
   QUICK LINKS
───────────────────────────────────────────────────────────── */

const QUICK_LINKS = [
  { label: "Download the App", href: "#app", icon: Download },
  { label: "City Train Timetable", href: "/departures", icon: Clock },
  { label: "Contact Us", href: "#contact", icon: Mail },
  { label: "Explore Tours", href: "/explore", icon: Ticket },
]

/* ─────────────────────────────────────────────────────────────
   HELP SUGGESTIONS FOR AI CHAT
───────────────────────────────────────────────────────────── */

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

export function HelpClient() {
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

  // Filter FAQ items based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return FAQ_DATA
    const q = searchQuery.toLowerCase()
    return FAQ_DATA.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.items.length > 0)
  }, [searchQuery])

  const totalResults = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0)

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

      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">

        {/* Search results indicator */}
        {searchQuery && (
          <div className="mb-6">
            <p className="text-sm text-muted-foreground">
              Found <span className="font-semibold text-foreground">{totalResults}</span> result{totalResults !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
            </p>
          </div>
        )}

        {/* Category cards (shown when no search) */}
        {!searchQuery && !activeCategory && (
          <div className="mb-12">
            <h2 className="mb-6 text-xl font-bold text-foreground">Browse by Category</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FAQ_DATA.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <cat.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{cat.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{cat.description}</p>
                    <p className="mt-2 text-xs text-primary">{cat.items.length} articles</p>
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
              const cat = FAQ_DATA.find((c) => c.id === activeCategory)
              if (!cat) return null
              return (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <cat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{cat.name}</h2>
                      <p className="text-sm text-muted-foreground">{cat.items.length} articles</p>
                    </div>
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
                          <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                            {item.answer}
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
                            <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                              {item.answer}
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
        <section className="mt-12">
          <h2 className="mb-6 text-xl font-bold text-foreground">Popular Articles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { cat: "general", id: "what-is-sightseeing" },
              { cat: "app", id: "why-download-app" },
              { cat: "cancellation", id: "cancellation-policy" },
              { cat: "city-tours", id: "48-hour-tickets" },
              { cat: "booking", id: "payment-problems" },
              { cat: "meeting-points", id: "pickup-info" },
            ].map(({ cat, id }) => {
              const category = FAQ_DATA.find((c) => c.id === cat)
              const item = category?.items.find((i) => i.id === id)
              if (!category || !item) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat)
                    setOpenItems(new Set([id]))
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <category.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">{item.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{category.name}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </>
  )
}
