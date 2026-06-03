import Link from "next/link"
import { dbGetSettings } from "@/lib/db/queries"
import { Bot, ChevronRight, MessageSquare, HelpCircle, TriangleAlert, FlaskConical, PenLine, Route, Sun } from "lucide-react"
import { PROVIDER_LABELS, type AiProvider } from "@/lib/ai/models"

export const dynamic = "force-dynamic"

// The legacy "Trip Planner" (planner) card was removed — its DB row stays
// because /api/planner still reads behaviour-knob defaults from there, but
// the user-facing day-plan settings now live under "Manage Trip Planner"
// (the renamed itinerary card) and the chat conversation settings live
// under "Trip Chat".
const SYSTEM_META: Record<string, { label: string; description: string; icon: typeof Bot; href: string }> = {
  blog: {
    label: "Blog Content Generator",
    description: "Generates SEO & AEO optimised articles and DALL-E 2 cover images from a topic prompt. Used on the blog edit page.",
    icon: PenLine,
    href: "/admin/ai-systems/blog",
  },
  itinerary: {
    label: "Manage Trip Planner",
    description: "Prompt, model, tips text, cross-sell widgets and multi-day max-days cap for the Smart Itinerary on /planner. Uses live Palisis timeslots.",
    icon: Route,
    href: "/admin/ai-systems/itinerary",
  },
  chat: {
    label: "Trip Chat",
    description: "Per-trip AI assistant on experience detail pages. Answers trip-specific questions.",
    icon: MessageSquare,
    href: "/admin/ai-systems/chat",
  },
  "planner-chat": {
    label: "Trip Planner Chat",
    description: "Conversational planner on /planner — admin prompt overrides plus the onboarding form options (groups, interests, durations, budgets, multi-day cap).",
    icon: Bot,
    href: "/admin/ai-systems/planner-chat",
  },
  help: {
    label: "Help & FAQ Chat",
    description: "Customer support bot on /help. Handles bookings, payments, and cancellations.",
    icon: HelpCircle,
    href: "/admin/ai-systems/help",
  },
  outdoor_today: {
    label: "Best Outdoor Experiences",
    description: "AI-powered homepage recommendation engine — selects and ranks trips based on today's weather, live timeslots, and trip descriptions.",
    icon: Sun,
    href: "/admin/ai-systems/outdoor_today",
  },
}

export default async function AiSystemsPage() {
  const settings = await dbGetSettings()
  const activeProvider = (settings.aiProvider as AiProvider) ?? "anthropic"

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Settings</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">AI Systems</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
            <Bot className="h-3 w-3" />
            Active provider: {PROVIDER_LABELS[activeProvider]}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure AI assistants and get strategic advice for platform growth.
        </p>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Configure AI Assistants</h2>
        <p className="text-xs text-muted-foreground">Customize system prompts, models, and parameters for each assistant.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(SYSTEM_META).map(([key, meta]) => {
          const config = (settings.ai as Record<string, { model: string; temperature: number; maxTokens: number }>)[key]
          return (
            <Link
              key={key}
              href={meta.href}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-secondary/40"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <meta.icon className="h-5 w-5 text-primary" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </div>
              <h2 className="text-base font-semibold text-foreground">{meta.label}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>

              {config && (
                <div className="mt-4 space-y-1.5 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/60">Model</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {String(config.model).split("/").pop()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/60">Temperature</span>
                    <span className="text-[11px] text-muted-foreground">{config.temperature}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/60">Max tokens</span>
                    <span className="text-[11px] text-muted-foreground">{Number(config.maxTokens).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">Vercel AI Gateway</p>
            <p className="text-xs text-muted-foreground">
              Models are served via the Vercel AI Gateway. Zero-config for OpenAI, Anthropic, Google, AWS Bedrock, and Fireworks AI.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
            <FlaskConical className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Experimental Features</h3>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">Experimental</span>
          </div>
        </div>
        <div className="space-y-3">
          {[
            ["Use at your own risk.", "AI features on this page are experimental and may behave unexpectedly."],
            ["AI can and does make mistakes.", "Recommendations and strategic advice are based on available data and statistical patterns. Always apply your own judgement."],
            ["No liability for automated decisions.", "Any business or technical decisions made based on AI output are solely the operator's responsibility."],
            ["Data is contextual, not real-time.", "The AI advisor analyses a snapshot of your platform state at request time."],
          ].map(([bold, rest]) => (
            <div key={bold} className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{bold}</span> {rest}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-amber-500/15 pt-4 text-[11px] text-muted-foreground/60">
          By using these features you acknowledge the experimental nature of AI and accept the associated risks.
        </p>
      </div>
    </div>
  )
}
