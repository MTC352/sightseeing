import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { FlightEmbedWidget } from "@/components/flight-embed-widget"
import {
  Plane, Clock, MapPin, Star, Shield, Check,
  BadgeCheck, Headphones, CreditCard, ArrowRight,
  Wifi, Zap, Globe, ChevronRight, Luggage,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Flights to Luxembourg | Compare & Book Cheap Airfare | sightseeing.lu",
  description:
    "Find and book the cheapest flights to Luxembourg Airport (LUX). Compare airfare from London, Paris, Amsterdam, Frankfurt & more. Best price guarantee.",
  keywords:
    "flights to Luxembourg, cheap flights Luxembourg, Luxembourg airport, LUX airport, book flights Luxembourg, airfare Luxembourg, Luxair, Ryanair Luxembourg",
  openGraph: {
    title: "Flights to Luxembourg — Compare & Book Cheap Airfare",
    description:
      "Search hundreds of airlines and travel sites to find the best deals on flights to Luxembourg. Compare prices, schedules and book securely.",
    images: ["/images/flights-hero.jpg"],
  },
}

// ─── Data ──────────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: BadgeCheck, label: "Best Price Guarantee", desc: "We match any lower fare" },
  { icon: Shield,     label: "Secure Booking",       desc: "256-bit SSL encrypted" },
  { icon: Headphones, label: "24/7 Support",         desc: "Flight assistance anytime" },
  { icon: CreditCard, label: "Flexible Payment",     desc: "All major cards & PayPal" },
]

const ROUTES = [
  {
    id: "london",
    from: "London Gatwick",
    iata_from: "LGW",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "1h 45min",
    airlines: "Luxair, easyJet",
    priceFrom: 49,
    frequency: "Daily",
    rating: 4.7,
    reviews: 3120,
    features: ["Direct flight", "Hand luggage", "Online check-in"],
    badge: "Most Popular",
  },
  {
    id: "paris",
    from: "Paris Charles de Gaulle",
    iata_from: "CDG",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "1h 15min",
    airlines: "Luxair, Air France",
    priceFrom: 39,
    frequency: "Multiple daily",
    rating: 4.8,
    reviews: 2640,
    features: ["Direct connection", "Business class", "Lounge access"],
    badge: "Best Value",
  },
  {
    id: "amsterdam",
    from: "Amsterdam Schiphol",
    iata_from: "AMS",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "1h 10min",
    airlines: "KLM, Luxair",
    priceFrom: 59,
    frequency: "Twice daily",
    rating: 4.6,
    reviews: 1890,
    features: ["Frequent flyer miles", "Priority boarding", "In-flight meals"],
    badge: null,
  },
  {
    id: "frankfurt",
    from: "Frankfurt Airport",
    iata_from: "FRA",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "1h 05min",
    airlines: "Luxair, Lufthansa",
    priceFrom: 45,
    frequency: "4x daily",
    rating: 4.7,
    reviews: 2210,
    features: ["Hub connections", "Star Alliance", "Connecting flights"],
    badge: null,
  },
  {
    id: "munich",
    from: "Munich Airport",
    iata_from: "MUC",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "1h 20min",
    airlines: "Luxair",
    priceFrom: 55,
    frequency: "Daily",
    rating: 4.5,
    reviews: 980,
    features: ["Direct connection", "Seasonal offers", "Family fares"],
    badge: null,
  },
  {
    id: "madrid",
    from: "Madrid Barajas",
    iata_from: "MAD",
    to: "Luxembourg",
    iata_to: "LUX",
    duration: "2h 40min",
    airlines: "Luxair, Iberia",
    priceFrom: 69,
    frequency: "5x weekly",
    rating: 4.6,
    reviews: 1340,
    features: ["Oneworld Alliance", "Baggage included", "Meal service"],
    badge: "New Route",
  },
]

const AIRLINES = [
  { name: "Luxair", hub: "Luxembourg LUX", type: "Flag carrier", routes: "30+ destinations" },
  { name: "Ryanair", hub: "Luxembourg LUX", type: "Low-cost", routes: "Seasonal routes" },
  { name: "easyJet", hub: "Multiple", type: "Low-cost", routes: "UK & Europe" },
  { name: "Lufthansa", hub: "Frankfurt FRA", type: "Full service", routes: "Via Frankfurt" },
  { name: "KLM", hub: "Amsterdam AMS", type: "Full service", routes: "Via Amsterdam" },
  { name: "Air France", hub: "Paris CDG", type: "Full service", routes: "Via Paris" },
]

const AIRPORT_FACTS = [
  { icon: MapPin,   label: "Location",         value: "Findel, 6 km from city centre" },
  { icon: Clock,    label: "Transfer time",     value: "~20 min by bus or taxi" },
  { icon: Plane,    label: "IATA code",         value: "LUX" },
  { icon: Globe,    label: "Destinations",      value: "70+ direct routes" },
  { icon: Wifi,     label: "Free WiFi",         value: "Throughout all terminals" },
  { icon: Luggage,  label: "Luggage storage",   value: "Available in terminal" },
]

const FAQS = [
  {
    q: "Which airports fly direct to Luxembourg?",
    a: "Luxembourg Airport (LUX) receives direct flights from London (LGW, STN), Paris (CDG, ORY), Amsterdam (AMS), Frankfurt (FRA), Munich (MUC), Madrid (MAD), Lisbon (LIS), Rome (FCO), and many more. Luxair operates the largest network of direct routes.",
  },
  {
    q: "What is the cheapest time to fly to Luxembourg?",
    a: "Flights to Luxembourg are typically cheapest in January, February and November outside of school holiday periods. Mid-week departures (Tuesday and Wednesday) tend to be cheaper than weekend flights. Booking 6–8 weeks in advance usually yields the best fares.",
  },
  {
    q: "How do I get from Luxembourg Airport to the city centre?",
    a: "Bus line 16 runs every 10–15 minutes from the airport to Luxembourg City centre in about 20 minutes. Taxis take 15 minutes and cost approximately €25–35. All public transport in Luxembourg is completely free, so the bus costs nothing once you land.",
  },
  {
    q: "Does Ryanair fly to Luxembourg?",
    a: "Yes, Ryanair operates seasonal and year-round routes to Luxembourg from various UK and European airports. Routes and frequencies vary by season — check the search form above for current availability and prices.",
  },
  {
    q: "Can I book connecting flights through Luxembourg?",
    a: "Luxembourg Airport serves as a connecting hub primarily via Luxair for regional European destinations. For long-haul connections, major hubs like Frankfurt, Amsterdam or Paris are recommended with frequent onward services.",
  },
  {
    q: "Is there a budget airline flying to Luxembourg?",
    a: "Ryanair and easyJet both serve Luxembourg with competitively priced fares. Luxair also offers promotional fares on popular routes. Use the flight search above to compare all airlines and find the lowest available price.",
  },
]

// ─── Components ────────────────────────────────────────────────────────────

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < count ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`}
        />
      ))}
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-foreground">
        {q}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
    </details>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function FlightsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Navbar />

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-foreground">
          <Image
            src="/images/flights-hero.jpg"
            alt="Flights to Luxembourg Airport"
            fill
            className="object-cover opacity-25"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/70 to-foreground/80" />

          <div className="relative mx-auto max-w-5xl px-4 pb-0 pt-14 sm:pt-20">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1">
              <Plane className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Compare hundreds of airlines — all in one search</span>
            </div>

            <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Flights to Luxembourg
              <br />
              <span className="text-primary">Best price, every time</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Search and compare flights from London, Paris, Amsterdam, Frankfurt and 70+ other cities. Find the cheapest fare and book securely in minutes.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {["Free cancellation on select fares", "Price match guarantee", "Instant e-ticket"].map((b) => (
                <span key={b} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                  <Check className="h-3 w-3 text-primary" />{b}
                </span>
              ))}
            </div>

            {/* Search widget */}
            <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-xl">
              <FlightEmbedWidget />
            </div>
          </div>
        </section>

        {/* ── Trust badges ── */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
            {TRUST_BADGES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-3 px-6 py-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Popular routes ── */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Plane className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Top connections</span>
          </div>
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Popular routes to Luxembourg</h2>
            <span className="shrink-0 text-sm text-muted-foreground">{ROUTES.length} routes</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROUTES.map((route) => (
              <article
                key={route.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                {route.badge && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    {route.badge}
                  </span>
                )}

                {/* Route header */}
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-muted-foreground">
                  <span>{route.iata_from}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{route.iata_to}</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground leading-snug">
                  {route.from}
                  <span className="mx-1 font-normal text-muted-foreground">→</span>
                  {route.to}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{route.airlines}</p>

                {/* Meta */}
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{route.duration}</span>
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{route.frequency}</span>
                </div>

                {/* Features */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {route.features.map((f) => (
                    <span key={f} className="flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-foreground">
                      <Check className="h-2.5 w-2.5 text-primary" />{f}
                    </span>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <StarRow count={Math.round(route.rating)} />
                    <span className="text-xs text-muted-foreground">({route.reviews.toLocaleString()})</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">from</p>
                    <p className="text-lg font-bold text-foreground leading-none">
                      &euro;{route.priceFrom}<span className="ml-0.5 text-xs font-normal text-muted-foreground"></span>
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Airport info ── */}
        <section className="border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <MapPin className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">Luxembourg Airport (LUX)</span>
            </div>
            <h2 className="mb-8 text-2xl font-bold text-foreground sm:text-3xl">Getting to &amp; from the airport</h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AIRPORT_FACTS.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Free public transport in Luxembourg</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Once you land, all buses, trams and trains within Luxembourg are completely free — including the direct bus from Findel Airport to Luxembourg City. No ticket needed. Just board and go.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Airlines ── */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Globe className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Carriers</span>
          </div>
          <h2 className="mb-8 text-2xl font-bold text-foreground sm:text-3xl">Airlines flying to Luxembourg</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AIRLINES.map((airline) => (
              <div key={airline.name} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Plane className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{airline.name}</p>
                  <p className="text-xs text-muted-foreground">{airline.type} · {airline.routes}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SEO editorial ── */}
        <section className="border-t border-border bg-secondary/20">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">Why fly to Luxembourg?</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Luxembourg is the heart of Europe — a tiny Grand Duchy with a world-class capital, UNESCO World Heritage fortress, Michelin-starred restaurants, and thriving international culture. Flying in is the fastest way to arrive, with Luxembourg Airport just 6 km from the city centre.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  The country's unique free public transport policy means you can step off your plane and travel anywhere in Luxembourg — by bus, tram or train — at no extra cost. It's one of Europe's best-connected small countries.
                </p>
                <Link
                  href="/explore"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Explore Luxembourg experiences <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">When to book your flight</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Luxembourg's mild climate means it's a year-round destination. Spring (April–June) and autumn (September–October) offer the best weather for exploring castles, vineyards and the Ardennes. Summer brings festivals and open-air events, while Christmas markets light up the capital from late November.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  For the best airfare, book 6–8 weeks ahead and travel mid-week. January and February see the lowest fares, while July and August command peak prices. Use the search form above to compare live prices across all airlines.
                </p>
                <Link
                  href="/planner"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Plan your full trip with AI <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <BadgeCheck className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Common questions</span>
          </div>
          <h2 className="mb-8 text-2xl font-bold text-foreground sm:text-3xl">Frequently asked questions</h2>
          <div className="flex flex-col gap-3">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-border bg-primary/5">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Ready to explore Luxembourg?</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Book your flight above, then let our AI trip planner build your perfect Luxembourg itinerary — tours, hotels, trains and more.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/planner"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90"
              >
                Plan My Trip <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/30"
              >
                Browse Experiences
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
