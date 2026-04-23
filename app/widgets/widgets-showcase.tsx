"use client"

import { useState } from "react"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { SightseeingList } from "@/components/chatgpt-widgets/sightseeing-list"
import { SightseeingCarousel } from "@/components/chatgpt-widgets/sightseeing-carousel"
import { SightseeingMap } from "@/components/chatgpt-widgets/sightseeing-map"
import { SightseeingAlbum } from "@/components/chatgpt-widgets/sightseeing-album"
import { List, Image as ImageIcon, Map, BookOpen, Code2, ExternalLink } from "lucide-react"
import type { Trip } from "@/lib/data"

const WIDGETS = [
  { id: "list", label: "List", icon: List, desc: "Ranked card list with favorites and pricing. Ideal for search results." },
  { id: "carousel", label: "Carousel", icon: ImageIcon, desc: "Horizontal scroller for media-heavy browsing. Perfect for discovery." },
  { id: "map", label: "Map", icon: Map, desc: "Interactive map with price pins and detail inspector. Best for location queries." },
  { id: "album", label: "Album", icon: BookOpen, desc: "Deep-dive gallery view for a single experience. Great for booking decisions." },
] as const

type WidgetId = (typeof WIDGETS)[number]["id"]

interface Props {
  trips: Trip[]
  featureTrip: Trip
}

export function WidgetsShowcase({ trips, featureTrip }: Props) {
  const [active, setActive] = useState<WidgetId>("list")

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">
            ChatGPT Widget Components
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground text-pretty">
            Custom UI components that render sightseeing.lu experiences directly inside ChatGPT conversations.
            Built on the MCP Apps standard for maximum compatibility.
          </p>
          <a
            href="https://developers.openai.com/apps-sdk/build/chatgpt-ui/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            OpenAI Apps SDK Docs <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Widget selector tabs */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {WIDGETS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setActive(w.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                active === w.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              <w.icon className="h-4 w-4" />
              {w.label}
            </button>
          ))}
        </div>

        {/* Active widget description */}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {WIDGETS.find((w) => w.id === active)?.desc}
        </p>

        {/* Preview container -- phone-width mock */}
        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-[420px]">
            {/* Chrome bar */}
            <div className="flex items-center gap-2 rounded-t-2xl border border-b-0 border-border bg-card px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
              </div>
              <div className="flex-1 rounded-md bg-secondary/60 px-3 py-1 text-center text-[10px] text-muted-foreground">
                chatgpt.com
              </div>
            </div>

            {/* Chat context bar */}
            <div className="border-x border-border bg-[#f7f7f8] px-4 py-2 dark:bg-[#1e1e1e]">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">ChatGPT:</span>{" "}
                {active === "album"
                  ? `Here are the details for "${featureTrip.title}":`
                  : "Here are the best experiences I found in Luxembourg:"}
              </p>
            </div>

            {/* Widget render area */}
            <div className="overflow-hidden rounded-b-2xl border border-border bg-card shadow-lg">
              {active === "list" && <SightseeingList trips={trips.slice(0, 5)} />}
              {active === "carousel" && <SightseeingCarousel trips={trips} />}
              {active === "map" && <SightseeingMap trips={trips} />}
              {active === "album" && <SightseeingAlbum trip={featureTrip} />}
            </div>
          </div>
        </div>

        {/* MCP tool response JSON example */}
        <div className="mt-12 mx-auto max-w-2xl">
          <h2 className="text-lg font-bold text-foreground">MCP Tool Response Example</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your MCP server returns <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono">structuredContent</code> with the trip data.
            The widget renders it inline in the conversation.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-[#1e1e2e] p-4 text-xs leading-relaxed text-green-400 font-mono">
{`{
  "jsonrpc": "2.0",
  "method": "ui/notifications/tool-result",
  "params": {
    "structuredContent": {
      "widget": "${active}",
      "trips": [
        {
          "id": "${featureTrip.id}",
          "title": "${featureTrip.title}",
          "image": "${featureTrip.image}",
          "price": ${featureTrip.price},
          "rating": ${featureTrip.rating},
          "duration": "${featureTrip.duration}",
          "category": "${featureTrip.category}",
          "city": "${featureTrip.city ?? "Luxembourg"}"
        }
      ]
    }
  }
}`}
          </pre>
        </div>

        {/* Integration steps */}
        <div className="mt-12 mx-auto max-w-2xl">
          <h2 className="text-lg font-bold text-foreground">Integration Architecture</h2>
          <div className="mt-4 flex flex-col gap-3">
            {[
              { step: "1", title: "MCP Server", desc: "Your server exposes tools like search_trips, get_trip_detail. ChatGPT calls them via the MCP protocol." },
              { step: "2", title: "Structured Content", desc: "Tool responses include structuredContent with trip arrays. The widget type is chosen by the model or server." },
              { step: "3", title: "Widget Iframe", desc: "ChatGPT renders your bundled widget in a sandboxed iframe. It receives data via the MCP Apps bridge (postMessage)." },
              { step: "4", title: "User Interaction", desc: "Clicks in the widget can call tools/call for booking, or ui/message to continue the conversation." },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">{s.step}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
