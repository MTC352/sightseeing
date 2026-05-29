import Image from "next/image"
import { EditableHero } from "@/components/editable-hero"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { TrainSearchWidget } from "@/components/train-search-widget"
import {
  Train, Clock, MapPin, Star, Shield, Check,
  BadgeCheck, Headphones, CreditCard, Ticket,
  ChevronRight, ArrowRight, Zap, Leaf, Globe,
  Users, Wifi, Coffee,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Trains to Luxembourg | Compare & Book Rail Tickets | sightseeing.lu",
  description:
    "Book train tickets to Luxembourg from Paris, Brussels, Frankfurt & Amsterdam. High-speed Thalys, TGV & ICE connections. Compare prices and travel times.",
  keywords: "train to Luxembourg, Luxembourg train tickets, TGV Luxembourg, Thalys Luxembourg, ICE Luxembourg, rail travel Luxembourg",
  openGraph: {
    title: "Trains to Luxembourg — Compare & Book Rail Tickets",
    description: "High-speed rail connections from major European cities. Compare Thalys, TGV & ICE schedules and prices.",
    images: ["/images/trains-hero.jpg"],
  },
}

// ─── Data ──────────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: BadgeCheck, label: "Official Tickets", desc: "Direct from rail operators" },
  { icon: Shield, label: "Flexible Booking", desc: "Free changes on many fares" },
  { icon: Headphones, label: "24/7 Support", desc: "Travel assistance anytime" },
  { icon: CreditCard, label: "Secure Payment", desc: "All major cards accepted" },
]

const ROUTES = [
  {
    id: "paris",
    from: "Paris Gare de l'Est",
    to: "Luxembourg",
    duration: "2h 05min",
    operator: "TGV INOUI",
    priceFrom: 29,
    frequency: "15 daily",
    rating: 4.8,
    reviews: 2340,
    features: ["1st & 2nd class", "WiFi", "Café car"],
    badge: "Most Popular",
  },
  {
    id: "brussels",
    from: "Brussels Midi",
    to: "Luxembourg",
    duration: "2h 50min",
    operator: "IC / Thalys",
    priceFrom: 19,
    frequency: "Hourly",
    rating: 4.7,
    reviews: 1820,
    features: ["Direct connection", "WiFi", "Power outlets"],
    badge: "Best Value",
  },
  {
    id: "frankfurt",
    from: "Frankfurt Hbf",
    to: "Luxembourg",
    duration: "3h 20min",
    operator: "ICE / IC",
    priceFrom: 39,
    frequency: "8 daily",
    rating: 4.6,
    reviews: 945,
    features: ["1st & 2nd class", "Restaurant car", "WiFi"],
    badge: null,
  },
  {
    id: "amsterdam",
    from: "Amsterdam Centraal",
    to: "Luxembourg",
    duration: "5h 10min",
    operator: "Thalys + IC",
    priceFrom: 49,
    frequency: "6 daily",
    rating: 4.5,
    reviews: 620,
    features: ["Change in Brussels", "Through tickets", "WiFi"],
    badge: null,
  },
]

const WHY_ITEMS = [
  { icon: Zap, title: "High-Speed Connections", desc: "TGV, Thalys & ICE services bring you to Luxembourg in comfort at up to 320 km/h." },
  { icon: MapPin, title: "Central Station Arrival", desc: "Luxembourg Gare is in the heart of the city — walk to the Old Town in 10 minutes." },
  { icon: Leaf, title: "Eco-Friendly Travel", desc: "Rail emits up to 90% less CO₂ than flying. Travel green without compromise." },
  { icon: Wifi, title: "Stay Connected", desc: "Free WiFi on most high-speed services. Work or relax during your journey." },
  { icon: Coffee, title: "Onboard Amenities", desc: "Café cars, power outlets at every seat, and generous luggage space included." },
  { icon: Globe, title: "Seamless Connections", desc: "Luxembourg connects to the entire European rail network. Add stopovers easily." },
]

const NEARBY_STATIONS = [
  { city: "Metz", country: "France", time: "50 min", highlight: "Gateway to Lorraine" },
  { city: "Trier", country: "Germany", time: "45 min", highlight: "Roman heritage city" },
  { city: "Thionville", country: "France", time: "25 min", highlight: "Cross-border commuter hub" },
  { city: "Arlon", country: "Belgium", time: "20 min", highlight: "Closest Belgian city" },
  { city: "Liège", country: "Belgium", time: "1h 40min", highlight: "Via Namur connection" },
  { city: "Strasbourg", country: "France", time: "1h 30min", highlight: "European Parliament seat" },
]

const FAQS = [
  {
    q: "How do I get from Luxembourg Station to the city centre?",
    a: "Luxembourg Gare is already in the city centre! The Old Town (Ville Haute) is a 10-minute walk or a short bus ride. All public transport in Luxembourg is free, so just hop on any bus heading to Hamilius or Place d'Armes.",
  },
  {
    q: "Can I bring luggage on the train?",
    a: "Yes, you can bring 2 pieces of luggage plus a small bag for free on TGV, Thalys, and ICE services. Overhead racks and luggage areas are available in every carriage.",
  },
  {
    q: "Do I need to print my ticket?",
    a: "No, e-tickets on your phone are accepted on all services. Simply show the QR code to the conductor when asked. We recommend downloading tickets in advance for offline access.",
  },
  {
    q: "What is the cheapest way to travel by train to Luxembourg?",
    a: "Book early! TGV and Thalys release discounted 'Prems' fares 3 months in advance. Brussels–Luxembourg IC trains offer fixed low fares year-round. Travelling midweek is usually cheaper than weekends.",
  },
  {
    q: "Is there free WiFi on trains?",
    a: "Yes, TGV INOUI, Thalys, and ICE all offer free WiFi. Speed varies depending on the route and number of passengers, but it is sufficient for emails, browsing, and streaming.",
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function TrainsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative flex min-h-[520px] items-end justify-center overflow-hidden bg-foreground pb-12 pt-28 text-center md:min-h-[560px] md:pb-16">
        <EditableHero
          id="trains:hero:image"
          defaultSrc="/images/trains-hero.jpg"
          alt="High-speed train at Luxembourg Central Station"
          imageClassName="object-cover opacity-40"
          priority
        />
        <div className="relative z-10 mx-auto w-full max-w-4xl px-4">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary backdrop-blur-sm">
            <Train className="h-3.5 w-3.5" /> Rail Travel
          </span>
          <h1 className="text-balance text-3xl font-extrabold tracking-tight text-background md:text-5xl">
            Trains to Luxembourg
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-background/80 md:text-lg">
            High-speed rail connections from Paris, Brussels, Frankfurt &amp; beyond. Compare schedules, book e-tickets, and travel sustainably.
          </p>

          {/* Search widget */}
          <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl bg-card p-1 shadow-xl">
            <TrainSearchWidget />
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-border bg-card py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-6 px-4 md:gap-10">
          {TRUST_BADGES.map((b) => (
            <div key={b.label} className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <b.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-foreground">{b.label}</p>
                <p className="text-[11px] text-muted-foreground">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popular routes */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Popular routes</span>
              <h2 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Direct trains to Luxembourg</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                High-speed connections from major European cities. Prices shown are for one-way 2nd class tickets booked in advance.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROUTES.map((route) => (
              <div
                key={route.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                {route.badge && (
                  <span className="absolute right-3 top-3 z-10 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {route.badge}
                  </span>
                )}
                <div className="flex flex-1 flex-col p-5">
                  {/* Operator */}
                  <span className="mb-3 text-xs font-medium text-primary">{route.operator}</span>

                  {/* Route */}
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{route.from}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 text-right">
                      <p className="text-sm font-semibold text-foreground">{route.to}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{route.duration}</span>
                    <span className="flex items-center gap-1"><Train className="h-3.5 w-3.5" />{route.frequency}</span>
                  </div>

                  {/* Features */}
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {route.features.map((f) => (
                      <span key={f} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{f}</span>
                    ))}
                  </div>

                  {/* Rating */}
                  <div className="mb-4 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-semibold text-foreground">{route.rating}</span>
                    <span className="text-xs text-muted-foreground">({route.reviews.toLocaleString()})</span>
                  </div>

                  {/* Price + CTA */}
                  <div className="mt-auto flex items-end justify-between">
                    <div>
                      <span className="text-lg font-bold text-foreground">&euro;{route.priceFrom}</span>
                      <span className="ml-1 text-xs text-muted-foreground">from</span>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Book <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why book section */}
      <section className="bg-secondary/40 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Why travel by train</span>
            <h2 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">The smart way to reach Luxembourg</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_ITEMS.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nearby stations */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Regional connections</span>
            <h2 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Explore the Greater Region by rail</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Luxembourg is a rail hub connecting France, Belgium, and Germany. These nearby cities are perfect for day trips.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NEARBY_STATIONS.map((s) => (
              <div key={s.city} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{s.city}, {s.country}</p>
                  <p className="text-xs text-muted-foreground">{s.time} · {s.highlight}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEO content */}
      <section className="border-t border-border bg-card py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-foreground md:text-2xl">Why travel by train to Luxembourg?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Luxembourg is one of the best-connected capitals in Europe, with high-speed rail services from Paris, Brussels, Frankfurt, and Amsterdam. The TGV INOUI from Paris Gare de l'Est takes just over two hours, while Thalys and ICE services link the Grand Duchy to the Benelux and German rail networks.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Train travel is comfortable, sustainable, and stress-free. Skip airport security, enjoy generous luggage allowances, and arrive directly in the city centre at Luxembourg Gare — a short walk from the Old Town, museums, and major attractions.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground md:text-2xl">Getting around Luxembourg by rail</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Once you arrive, all public transport in Luxembourg is completely free — buses, trams, and regional trains included. Use the CFL network to explore the Moselle Valley, Vianden, Echternach, and more without spending a cent on fares.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Book your international train tickets in advance for the best prices. Early-bird "Prems" fares from Paris start at €29, while Brussels IC trains offer flat-rate tickets year-round. Remember to download your e-ticket for offline access before boarding.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</span>
            <h2 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">Common questions about trains to Luxembourg</h2>
          </div>
          <div className="flex flex-col gap-4">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group rounded-2xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-foreground">
                  {faq.q}
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-12">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center md:flex-row md:text-left">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-primary-foreground md:text-2xl">Need help planning your trip?</h2>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Our AI Trip Planner can build a full Luxembourg itinerary in seconds — including how to get there.
            </p>
          </div>
          <Link
            href="/planner"
            className="inline-flex items-center gap-2 rounded-xl bg-background px-6 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-background/90"
          >
            Try the AI Planner <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
