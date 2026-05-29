import Image from "next/image"
import { EditableHero } from "@/components/editable-hero"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import {
  Plane, Car, Building2, Star, MapPin, Shield, Clock,
  Check, Users, Fuel, Settings2, Wifi, Coffee, ArrowRight,
  BadgeCheck, Headphones, CreditCard, Zap, TrainFront,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Vacation Agregator — Flights, Trains, Hotels & Car Rentals | sightseeing.lu",
  description: "Compare and book flights, trains, hotels and car rentals to Luxembourg — all in one place. Best price guarantee with sightseeing.lu.",
  openGraph: {
    title: "Vacation Agregator — Flights, Trains, Hotels & Cars in Luxembourg",
    description: "Your complete vacation booking hub for Luxembourg. Flights, trains, hotels, and car rentals in one place.",
    images: ["/images/travel-hero.jpg"],
  },
}

// ─── Data ──────────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: BadgeCheck, label: "Best Price Guarantee", desc: "We compare hundreds of providers" },
  { icon: Shield, label: "Secure Payments", desc: "256-bit SSL encryption" },
  { icon: Headphones, label: "24/7 Support", desc: "Local experts always available" },
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

const HOTELS = [
  {
    id: "le-royal",
    name: "Le Royal Luxembourg",
    area: "City Center",
    image: "/images/hotels/city-center.jpg",
    pricePerNight: 189,
    originalPrice: 229,
    rating: 4.8,
    reviews: 342,
    stars: 5,
    amenities: ["Free WiFi", "Breakfast included", "Spa & Pool"],
    badge: "Top Rated",
  },
  {
    id: "ardennes",
    name: "Auberge des Ardennes",
    area: "Clervaux, Ardennes",
    image: "/images/hotels/countryside.jpg",
    pricePerNight: 109,
    rating: 4.7,
    reviews: 186,
    stars: 3,
    amenities: ["Free WiFi", "Garden terrace", "Free parking"],
    badge: "Best for Nature",
  },
  {
    id: "vianden",
    name: "Hotel Heintz",
    area: "Vianden",
    image: "/images/hotels/vianden.jpg",
    pricePerNight: 129,
    rating: 4.6,
    reviews: 218,
    stars: 3,
    amenities: ["Free WiFi", "Castle view", "Free parking"],
    badge: null,
  },
]

const EDITORIAL = [
  {
    title: "Best time to visit Luxembourg",
    category: "Travel Guide",
    excerpt: "Spring and early autumn offer mild weather and thinner crowds. May brings the Echternach procession; September turns the Moselle valley gold.",
    readMins: 5,
    image: "/images/travel-hero.jpg",
  },
  {
    title: "Getting around without a car",
    category: "Transport",
    excerpt: "Since 2020, all public transport in Luxembourg is completely free. Buses, trains and trams connect the capital to nearly every town in the Grand Duchy.",
    readMins: 3,
    image: "/images/travel-hero.jpg",
  },
  {
    title: "Weekend in the Mullerthal",
    category: "Itinerary",
    excerpt: "Luxembourg's 'Little Switzerland' rewards slow travel. Hike the rocky gorges in the morning, visit the Echternach basilica, and end the day in a riverside restaurant.",
    readMins: 7,
    image: "/images/travel-hero.jpg",
  },
]

const DESTINATIONS = [
  { name: "Luxembourg City", tagline: "Gorges, Grund & Grand Ducal Palace", trips: 34 },
  { name: "Vianden", tagline: "Fairytale castle above the Our valley", trips: 12 },
  { name: "Echternach", tagline: "Mullerthal trail & Benedictine abbey", trips: 18 },
  { name: "Moselle Valley", tagline: "Wine routes & riverside villages", trips: 9 },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-px">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
      ))}
    </span>
  )
}

const amenityIcons: Record<string, React.ReactNode> = {
  "Free WiFi": <Wifi className="h-3 w-3" />,
  "Breakfast included": <Coffee className="h-3 w-3" />,
  "Free parking": <Car className="h-3 w-3" />,
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TravelPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-foreground">
          {/* Background image */}
          <EditableHero
            id="travel:hero:image"
            defaultSrc="/images/travel-hero.jpg"
            alt="Luxembourg aerial view"
            imageClassName="object-cover opacity-30"
            priority
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-foreground/60" />

          <div className="relative mx-auto max-w-5xl px-4 pb-0 pt-14 sm:pt-20">
            {/* Badge */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1">
              <Plane className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Flights · Trains · Hotels · Car Rentals</span>
            </div>

            <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Vacation Agregator
              <br />
              <span className="text-primary">for Luxembourg</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Compare flights, trains, hotels, and car rentals to Luxembourg — all in one place. Select a category below to start booking.
            </p>

            {/* Stats row */}
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {[
                { label: "Airlines compared", value: "600+" },
                { label: "Hotels available", value: "1,200+" },
                { label: "Car rental suppliers", value: "40+" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-primary">{s.value}</span>
                  <span className="text-xs text-white/50">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Category link cards */}
            <div className="relative z-10 mt-8 mb-0 grid grid-cols-2 gap-3 pb-10 sm:grid-cols-4">
              {[
                { href: "/travel/flights", icon: Plane, label: "Flights", desc: "600+ airlines" },
                { href: "/trains", icon: TrainFront, label: "Trains", desc: "Direct routes to LU" },
                { href: "/hotels", icon: Building2, label: "Hotels", desc: "1,200+ properties" },
                { href: "/cars", icon: Car, label: "Car Rentals", desc: "40+ suppliers" },
              ].map(({ href, icon: Icon, label, desc }) => (
                <Link
                  key={label}
                  href={href}
                  className="group flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm transition-all hover:border-primary/60 hover:bg-white/20"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{label}</p>
                    <p className="text-[11px] text-white/60">{desc}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust badges ── */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {TRUST_BADGES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Flights & Trains ── */}
        <section className="mx-auto max-w-5xl px-4 py-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Getting to Luxembourg</p>
          <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Flights &amp; trains</h2>
          <p className="mt-1 text-sm text-muted-foreground">Luxembourg is well connected by air and rail. Choose the option that suits your departure point.</p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {/* Flights card */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative aspect-[16/7] overflow-hidden">
                <Image src="/images/travel-hero.jpg" alt="Luxembourg Findel Airport" fill className="object-cover" sizes="(max-width:640px) 100vw, 50vw" />
                <div className="absolute inset-0 bg-foreground/40" />
                <div className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/90">
                  <Plane className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="text-base font-bold text-foreground">Fly to Luxembourg</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Luxembourg Findel Airport (LUX) is served by Luxair, Ryanair, easyJet, and over 30 airlines. Direct connections from London, Paris, Amsterdam, Frankfurt, and many other European cities. Flight time from London is under 90 minutes.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {["Direct flights from 30+ European cities", "LUX Airport is 6 km from city centre", "Airport bus takes 20 min to Luxembourg station", "Luxair offers frequent daily departures"].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/travel/flights"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Search flights <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Trains card */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative aspect-[16/7] overflow-hidden">
                <Image src="/images/trains-hero.jpg" alt="Train to Luxembourg" fill className="object-cover" sizes="(max-width:640px) 100vw, 50vw" />
                <div className="absolute inset-0 bg-foreground/40" />
                <div className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/90">
                  <TrainFront className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="text-base font-bold text-foreground">Train to Luxembourg</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Luxembourg Central Station is a major European rail hub. High-speed Thalys and TGV services connect Paris in just 2 hours, while IC trains run hourly from Brussels. Once in the country, all public transport — including trains — is completely free.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {["Paris in ~2 h via TGV", "Brussels in ~3 h, frequent departures", "Frankfurt in ~3.5 h via ICE", "Free domestic rail travel once in Luxembourg"].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/trains"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Search trains <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Popular destinations ── */}
        <section className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Where to go</p>
              <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Popular destinations</h2>
            </div>
            <Link href="/explore" className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              All experiences <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.name}
                href={`/search?q=${encodeURIComponent(d.name)}`}
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-foreground">{d.name}</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{d.tagline}</p>
                <p className="mt-2 text-[11px] font-medium text-primary">{d.trips} experiences</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Car rentals ── */}
        <section className="border-t border-border bg-secondary/30 py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Explore freely</p>
                <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Car rentals in Luxembourg</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pick up at Findel Airport or city center. Free cancellation on most bookings.</p>
              </div>
              <Link href="/cars" className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex flex-col gap-3">
              {CARS.map((car) => (
                <div key={car.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-md sm:flex-row">
                  <div className="relative aspect-[16/10] w-full overflow-hidden sm:aspect-auto sm:w-44">
                    <Image
                      src={car.image}
                      alt={car.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width:640px) 100vw, 176px"
                    />
                    {car.badge && (
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {car.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-4 p-4">
                    <div className="flex-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{car.category}</span>
                      <h3 className="text-sm font-bold text-foreground">{car.name}</h3>
                      <p className="text-[11px] text-muted-foreground">{car.provider}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{car.seats} seats</span>
                        <span className="flex items-center gap-1"><Settings2 className="h-3 w-3" />{car.transmission}</span>
                        <span className="flex items-center gap-1"><Fuel className="h-3 w-3" />{car.fuel}</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{car.rating}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {car.features.map((f) => (
                          <span key={f} className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
                            <Check className="h-2.5 w-2.5 text-emerald-500" />{f}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-3">
                      <div className="text-right">
                        <span className="text-xl font-bold text-foreground">{car.pricePerDay}&euro;</span>
                        <span className="ml-1 text-xs text-muted-foreground">/ day</span>
                      </div>
                      <Link
                        href="/cars"
                        className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Book now
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Info strip */}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Zap, title: "Instant confirmation", desc: "Booking confirmed in under 60 seconds" },
                { icon: Shield, title: "Full insurance available", desc: "Zero-excess options on all vehicles" },
                { icon: Clock, title: "Flexible pickup times", desc: "24/7 collection at Findel Airport" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{title}</p>
                    <p className="text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Hotels ── */}
        <section className="py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Where to sleep</p>
                <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Recommended hotels</h2>
                <p className="mt-1 text-sm text-muted-foreground">From city boutique hotels to countryside retreats in the Ardennes.</p>
              </div>
              <Link href="/hotels" className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {HOTELS.map((hotel) => (
                <div key={hotel.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-md">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={hotel.image}
                      alt={hotel.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width:640px) 100vw, 33vw"
                    />
                    {hotel.badge && (
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                        {hotel.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Stars count={hotel.stars} />
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />{hotel.area}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-foreground">{hotel.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {hotel.amenities.map((a) => (
                          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
                            {amenityIcons[a] ?? <Check className="h-2.5 w-2.5 text-emerald-500" />}{a}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {hotel.rating}
                        <span>({hotel.reviews})</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        {hotel.originalPrice && (
                          <span className="text-[11px] text-muted-foreground line-through">{hotel.originalPrice}&euro;</span>
                        )}
                        <span className="text-base font-bold text-foreground">{hotel.pricePerNight}&euro;</span>
                        <span className="text-[10px] text-muted-foreground">/ night</span>
                      </div>
                    </div>
                    <Link
                      href="/hotels"
                      className="mt-3 flex w-full items-center justify-center rounded-lg border border-border py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      Check availability
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Editorial / travel guides ── */}
        <section className="border-t border-border bg-secondary/30 py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Know before you go</p>
              <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Luxembourg travel guides</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {EDITORIAL.map((article) => (
                <Link
                  key={article.title}
                  href="/blog"
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <Image
                      src={article.image}
                      alt={article.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width:640px) 100vw, 33vw"
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-primary/90 px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {article.category}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <h3 className="text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-3 text-[11px] text-muted-foreground leading-relaxed">
                      {article.excerpt}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {article.readMins} min read
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA strip ── */}
        <section className="border-t border-border bg-primary/10 py-12">
          <div className="mx-auto max-w-2xl px-4 text-center">
            <h2 className="text-balance text-2xl font-bold text-foreground sm:text-3xl">
              Let AI plan your perfect day in Luxembourg
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground leading-relaxed">
              Add experiences to your wishlist, then ask our AI trip planner to sequence them into a full-day itinerary — with transit times, food breaks, and hotel suggestions included.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/planner"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Zap className="h-4 w-4" />
                Open AI Planner
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Browse experiences
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter />
    </div>
  )
}
