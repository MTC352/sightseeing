import Link from "next/link"
import { getSettings } from "@/lib/admin-store"
import { Bot, ChevronRight, MessageSquare, HelpCircle, Map, Sparkles, TriangleAlert, FlaskConical } from "lucide-react"
import { AIAdvisorDashboard } from "@/components/admin/ai-advisor-dashboard"

const SYSTEM_META: Record<string, { label: string; description: string; icon: typeof Bot; href: string }> = {
  planner: {
    label: "Trip Planner",
    description: "Conversational AI that recommends and builds itineraries. Shown on /planner.",
    icon: Map,
    href: "/admin/ai-systems/planner",
  },
  chat: {
    label: "Trip Chat",
    description: "Per-trip AI assistant on experience detail pages. Answers trip-specific questions.",
    icon: MessageSquare,
    href: "/admin/ai-systems/chat",
  },
  help: {
    label: "Help & FAQ Chat",
    description: "Customer support bot on /help. Handles bookings, payments, and cancellations.",
    icon: HelpCircle,
    href: "/admin/ai-systems/help",
  },
}

export default function AiSystemsPage() {
  const settings = getSettings()

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Settings</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">AI Systems</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure AI assistants and get strategic advice for platform growth.
        </p>
      </div>

      {/* AI Advisor Section */}
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">AI Strategy Advisor</h2>
            <p className="text-xs text-muted-foreground">Get personalized recommendations based on your platform state</p>
          </div>
        </div>
        <AIAdvisorDashboard />
      </div>

      {/* Divider */}
      <div className="mb-8 border-t border-border" />

      {/* AI Systems Grid */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Configure AI Assistants</h2>
        <p className="text-xs text-muted-foreground">Customize system prompts, models, and parameters for each assistant.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(SYSTEM_META).map(([key, meta]) => {
          const config = settings.ai[key]
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
                      {config.model.split("/").pop()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/60">Temperature</span>
                    <span className="text-[11px] text-muted-foreground">{config.temperature}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground/60">Max tokens</span>
                    <span className="text-[11px] text-muted-foreground">{config.maxTokens.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {/* Vercel AI Gateway Info */}
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

      {/* Experimental Features Disclaimer */}
      <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
            <FlaskConical className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Experimental Features</h3>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600">
              Experimental
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Use at your own risk.</span> AI features on this page are experimental and may behave unexpectedly. They are provided as-is without guarantees of accuracy, completeness, or fitness for a particular purpose.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">AI can and does make mistakes.</span> Recommendations, roadmap suggestions, and strategic advice generated by the AI Strategy Advisor are based on available data and statistical patterns. Always apply your own judgement before acting on AI-generated content.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">No liability for automated decisions.</span> Any business, financial, or technical decisions made based on AI output are solely the responsibility of the operator. Review all AI suggestions with a qualified human before implementation.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Data is contextual, not real-time.</span> The AI advisor analyses a snapshot of your platform state at request time. Industry news and trends shown are curated examples and do not represent a live feed.
            </p>
          </div>
        </div>

        <p className="mt-4 border-t border-amber-500/15 pt-4 text-[11px] text-muted-foreground/60">
          By using these features you acknowledge that you understand the experimental nature of AI and accept the associated risks. Features will be promoted out of experimental status as they mature and are validated in production.
        </p>
      </div>
    </div>
  )
}
