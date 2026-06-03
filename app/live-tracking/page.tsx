import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { Bus, TrainFront, MapPin, Navigation, Radio } from "lucide-react"

export const metadata: Metadata = {
  title: "Live Tracking | sightseeing.lu",
  description:
    "Track our Luxembourg sightseeing bus and train tours in real time. Follow the live position of each tour on the map as it travels its route.",
}

type TourMap = {
  key: string
  title: string
  subtitle: string
  icon: typeof Bus
  routeLabel: string
  accent: string
}

const TOURS: TourMap[] = [
  {
    key: "bus",
    title: "Bus Tour",
    subtitle: "Hop-on hop-off city loop",
    icon: Bus,
    routeLabel: "City Centre → Kirchberg → Grund",
    accent: "from-sky-500/20 to-sky-500/5",
  },
  {
    key: "train",
    title: "Train Tour",
    subtitle: "Petrusse Express scenic line",
    icon: TrainFront,
    routeLabel: "Place de la Constitution → Casemates",
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
]

function DemoTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-950 shadow-sm">
      Demo
    </span>
  )
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Live
    </span>
  )
}

function TrackingMap({ tour }: { tour: TourMap }) {
  const Icon = tour.icon
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{tour.title}</h2>
            <p className="text-xs text-muted-foreground">{tour.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <DemoTag />
        </div>
      </div>

      {/* Map placeholder */}
      <div
        className={`relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br ${tour.accent}`}
      >
        {/* Grid pattern to evoke a map */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklch, var(--border) 60%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--border) 60%, transparent) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Demo route line */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden>
          <path
            d="M40 240 C 120 180, 160 220, 220 140 S 320 60, 360 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="6 8"
            className="text-primary/50"
          />
        </svg>

        {/* Animated vehicle marker */}
        <div className="absolute left-[52%] top-[42%] -translate-x-1/2 -translate-y-1/2">
          <span className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <Icon className="h-5 w-5" />
            </span>
          </span>
        </div>

        {/* Center label */}
        <div className="relative z-10 flex flex-col items-center gap-2 rounded-xl bg-background/80 px-6 py-4 text-center backdrop-blur-sm">
          <div className="flex items-center gap-2 text-foreground">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Map</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Radio className="h-4 w-4" />
            <span className="text-xs font-medium">Live Tracking</span>
          </div>
        </div>
      </div>

      {/* Footer / route info */}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Navigation className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{tour.routeLabel}</span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Updated just now</span>
      </div>
    </div>
  )
}

export default function LiveTrackingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-primary">Live Tracking</p>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">
            Track our tours in real time
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground lg:text-base">
            Follow the live position of our sightseeing bus and train tours as they travel their
            routes around Luxembourg. The maps below are demo placeholders — live vehicle data
            will be connected soon.
          </p>
        </div>
      </section>

      {/* Maps */}
      <main className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {TOURS.map((tour) => (
            <TrackingMap key={tour.key} tour={tour} />
          ))}
        </div>

        <p className="mt-8 rounded-xl border border-dashed border-border bg-secondary/30 px-5 py-4 text-center text-xs text-muted-foreground">
          These maps currently show demo content. Real-time positions for the bus and train tours
          will replace the placeholders once live tracking is connected.
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}
