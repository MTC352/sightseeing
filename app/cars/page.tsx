import Image from "next/image"
import { EditableHero } from "@/components/editable-hero"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { CarRentalWidget } from "@/components/car-rental-widget"
import {
  Car, Users, Fuel, Settings2, Star, Shield, Check,
  BadgeCheck, Headphones, CreditCard, MapPin, Clock,
  ChevronRight, ArrowRight, Zap, Leaf, Key,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Car Rental Luxembourg | Best Deals from €39/day | sightseeing.lu",
  description:
    "Compare and book car rentals in Luxembourg from €39/day. Airport pickup at LUX Findel, free cancellation, unlimited mileage. Europcar, Hertz, Sixt and more.",
  keywords: "car rental Luxembourg, rent a car Luxembourg, Luxembourg car hire, Findel airport car rental, cheap car rental Luxembourg",
  openGraph: {
    title: "Car Rental Luxembourg — Best Deals from €39/day",
    description: "Compare top car rental companies in Luxembourg. Airport pickup, free cancellation, unlimited mileage.",
    images: ["/images/cars-hero.jpg"],
  },
}

// ─── Data ──────────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: BadgeCheck, label: "Best Price Guarantee", desc: "We compare 500+ suppliers" },
  { icon: Shield, label: "Free Cancellation", desc: "On most bookings up to 48h" },
  { icon: Headphones, label: "24/7 Support", desc: "Local experts always on hand" },
  { icon: CreditCard, label: "No Hidden Fees", desc: "Total price shown upfront" },
]

const CARS = [
  {
    id: "compact",
    name: "Volkswagen Polo",
    category: "Compact",
    image: "/images/cars/compact-car.jpg",
    pricePerDay: 39,
    seats: 5,
    transmission: "Automatic",
    fuel: "Petrol",
    rating: 4.6,
    reviews: 128,
    features: ["Free cancellation", "Unlimited mileage", "GPS included"],
    provider: "Europcar",
    badge: "Best Value",
  },
  {
    id: "suv",
    name: "Peugeot 3008 SUV",
    category: "SUV / Crossover",
    image: "/images/cars/suv.jpg",
    pricePerDay: 62,
    seats: 5,
    transmission: "Automatic",
    fuel: "Diesel",
    rating: 4.8,
    reviews: 89,
    features: ["Free cancellation", "Unlimited mileage", "Child seat available"],
    provider: "Hertz",
    badge: "Most Popular",
  },
  {
    id: "convertible",
    name: "BMW 2 Series Convertible",
    category: "Convertible",
    image: "/images/cars/convertible.jpg",
    pricePerDay: 95,
    seats: 4,
    transmission: "Automatic",
    fuel: "Petrol",
    rating: 4.9,
    reviews: 47,
    features: ["Free cancellation", "Premium insurance"],
    provider: "Sixt",
    badge: "Premium",
  },
]

const DESTINATIONS = [
  { city: "Vianden Castle", distance: "58 km", time: "45 min", highlight: "Medieval fortress — easier by car" },
  { city: "Mullerthal / Little Switzerland", distance: "38 km", time: "35 min", highlight: "Hiking trails in the forest" },
  { city: "Echternach", distance: "36 km", time: "30 min", highlight: "Oldest town in Luxembourg" },
  { city: "Clervaux", distance: "74 km", time: "55 min", highlight: "UNESCO heritage & The Family of Man" },
  { city: "Bourscheid Castle", distance: "52 km", time: "45 min", highlight: "Dramatic hilltop ruins" },
  { city: "Mondorf-les-Bains", distance: "20 km", time: "20 min", highlight: "Spa resort & thermal baths" },
]

const WHY_ITEMS = [
  { icon: Key, title: "Instant Confirmation", desc: "Book in under 2 minutes. Voucher sent straight to your inbox — no waiting." },
  { icon: MapPin, title: "Airport & City Pickup", desc: "Collect your car at Luxembourg Findel (LUX) or any city-center location." },
  { icon: Leaf, title: "Electric Options Available", desc: "Choose an EV or hybrid — Luxembourg has an excellent charging network." },
  { icon: Zap, title: "Skip the Queue", desc: "Priority counter access with select providers. Swipe your voucher and go." },
  { icon: Clock, title: "Flexible Return Times", desc: "24-hour return windows on most bookings. No rigid hour restrictions." },
  { icon: Shield, title: "Full Coverage Available", desc: "CDW, SCDW and theft protection upgrades available at checkout." },
]

const FAQS = [
  { q: "What documents do I need to rent a car in Luxembourg?", a: "A valid driving licence (held for at least 1 year), a passport or national ID, and the credit card used for payment. International drivers may need an International Driving Permit." },
  { q: "Can I pick up at Luxembourg Findel Airport?", a: "Yes. All major suppliers — Europcar, Hertz, Sixt, Avis and Budget — have desks inside LUX Findel terminal. No shuttle required." },
  { q: "Is insurance included in the price?", a: "Basic Collision Damage Waiver (CDW) is typically included. Full coverage (SCDW) and theft protection are available as add-ons during checkout." },
  { q: "What is the minimum age to rent a car in Luxembourg?", a: "You must be at least 21 years old. Drivers aged 21–24 may be subject to a young driver surcharge depending on the supplier." },
  { q: "Can I take the rental car to other countries?", a: "Most suppliers allow travel within the EU/Schengen Area. Cross-border approval must be requested at the time of booking. Some restrictions apply." },
  { q: "How do I cancel or modify my booking?", a: "Most bookings include free cancellation up to 48 hours before pickup. Modifications can be made through the supplier or by contacting our support team." },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function CarsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <EditableHero
              id="cars:hero:image"
              defaultSrc="/images/cars-hero.jpg"
              alt="Car driving through Luxembourg countryside"
              priority
            />
            <div className="absolute inset-0 bg-foreground/55" />
          </div>

          {/* Hero content */}
          <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <Car className="h-3 w-3" /> Car Rentals in Luxembourg
              </span>
              <h1 className="mt-4 text-balance text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                Drive Luxembourg<br />Your Way
              </h1>
              <p className="mt-4 text-base leading-relaxed text-white/80 sm:text-lg">
                Compare prices from Europcar, Hertz, Sixt and 500+ suppliers.
                Airport pickup, free cancellation, and no hidden fees — from just <strong className="text-white">€39/day</strong>.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {["Free cancellation", "Unlimited mileage", "Airport pickup", "No hidden fees"].map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Check className="h-3 w-3 text-primary" /> {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Booking widget card */}
            <div className="mt-10 overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Car className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Find your rental car</p>
                <span className="ml-auto text-[10px] text-muted-foreground">Powered by Travelpayouts</span>
              </div>
              <div className="p-2">
                <CarRentalWidget />
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust badges ───────────────────────────────────────────────── */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {TRUST_BADGES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Featured vehicles ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Featured Vehicles</p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">Popular car categories in Luxembourg</h2>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                From compact city cars perfect for Luxembourg City streets to spacious SUVs for exploring the Ardennes — find the right car for your journey.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4">
            {CARS.map((car) => (
              <article
                key={car.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md sm:flex-row"
              >
                <div className="relative h-52 w-full overflow-hidden sm:h-auto sm:w-56">
                  <Image
                    src={car.image}
                    alt={`${car.name} — ${car.category} car rental in Luxembourg`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width:640px) 100vw, 224px"
                  />
                  {car.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                      {car.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">{car.category}</span>
                    <h3 className="mt-0.5 text-lg font-bold text-foreground">{car.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">via {car.provider}</p>

                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{car.seats} seats</span>
                      <span className="flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" />{car.transmission}</span>
                      <span className="flex items-center gap-1"><Fuel className="h-3.5 w-3.5" />{car.fuel}</span>
                      <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{car.rating} <span className="text-muted-foreground/60">({car.reviews} reviews)</span></span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {car.features.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                          <Check className="h-2.5 w-2.5 text-primary" />{f}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <div>
                      <span className="text-2xl font-bold text-foreground">{car.pricePerDay}€</span>
                      <span className="ml-1 text-xs text-muted-foreground">/ day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                        <Shield className="h-3 w-3" />Full coverage available
                      </span>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Book now <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Why rent with us ───────────────────────────────────────────── */}
        <section className="border-y border-border bg-card py-14">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Why book with sightseeing.lu</p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">Everything you need, nothing you {"don't"}</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                We work with the world{"'"}s leading car rental companies to give you the widest choice, at the best price, with the least hassle.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {WHY_ITEMS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4 rounded-2xl border border-border bg-background p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Destinations worth driving to ──────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Day Trips by Car</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">Where will you drive to?</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Luxembourg is small — the entire Grand Duchy is reachable in under an hour from the capital. A rental car unlocks destinations that public transport {"can't"} easily reach.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map((d) => (
              <div key={d.city} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{d.city}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{d.distance} &bull; ~{d.time} drive</p>
                  <p className="mt-1 text-[11px] text-primary/80">{d.highlight}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SEO Editorial content ──────────────────────────────────────── */}
        <section className="border-t border-border bg-card py-14">
          <div className="mx-auto max-w-4xl px-4 lg:px-8">
            <h2 className="text-xl font-bold text-foreground">Car Rental in Luxembourg — Everything You Need to Know</h2>
            <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">
              <p>
                Luxembourg may be one of {"Europe's"} smallest countries, but it punches well above its weight when it comes to natural beauty, history, and cultural diversity. Renting a car is by far the best way to explore beyond the capital — many of the {"country's"} most spectacular sights, including the Mullerthal {"\"Little Switzerland\""} hiking region, the castle ruins at Bourscheid, and the Moselle wine valley, are difficult or impossible to reach by public transport alone.
              </p>
              <p>
                Pickup is straightforward. Luxembourg Findel International Airport (IATA: LUX) is just 6 km from the city centre and has rental desks from all major suppliers directly inside the terminal — no shuttle, no waiting. If you prefer to pick up in town, several agencies maintain locations along Avenue de la Liberté and around the Gare Centrale.
              </p>
              <p>
                Prices are competitive by European standards. A compact car typically starts from <strong className="text-foreground">€39 per day</strong>, while larger SUVs suited to family trips or luggage-heavy itineraries run from around €60. Electric vehicle options have grown considerably — with {"Luxembourg's"} dense EV charging network, driving green is a genuine option.
              </p>
              <p>
                All bookings made through sightseeing.lu include transparent pricing: the rate you see covers taxes, airport surcharges, and basic CDW insurance. Full protection upgrades are available at checkout. Most bookings can be cancelled for free up to 48 hours before pickup.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-4 py-14 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">Frequently asked questions</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything you need to know before you rent.</p>

          <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="px-6 py-5">
                <h3 className="text-sm font-semibold text-foreground">{q}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <section className="border-t border-border bg-primary/5 py-14">
          <div className="mx-auto max-w-7xl px-4 text-center lg:px-8">
            <h2 className="text-2xl font-bold text-foreground">Ready to explore Luxembourg?</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              Combine your car rental with guided sightseeing experiences, hotel bookings, and an AI-planned itinerary — all in one place.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/planner" className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Plan my trip with AI <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/explore" className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/30">
                Browse experiences <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  )
}
