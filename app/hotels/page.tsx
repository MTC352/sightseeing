import Link from "next/link"
import Image from "next/image"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { HotelBookingWidget } from "@/components/hotel-booking-widget"
import {
  Building2, Star, MapPin, Wifi, Coffee, Car, Utensils, Check,
  Shield, Award, Clock, HeartHandshake, ChevronDown, ArrowRight, Sparkles,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Hotels in Luxembourg | Best Rates – sightseeing.lu",
  description:
    "Find the best hotels in Luxembourg. Compare luxury city hotels, boutique stays, countryside retreats and budget hostels. Book with confidence — best price guarantee.",
  keywords: [
    "hotels Luxembourg", "Luxembourg City hotel", "cheap hotels Luxembourg",
    "boutique hotel Luxembourg", "hotel Vianden", "hotel Echternach",
    "Ardennes hotel Luxembourg", "accommodation Luxembourg",
  ],
  openGraph: {
    title: "Hotels in Luxembourg | Best Rates – sightseeing.lu",
    description: "Discover hand-picked hotels across the Grand Duchy. Book city centre stays, countryside retreats, and everything in between.",
    images: [{ url: "/images/hotels-hero.jpg" }],
  },
}

/* ── Data ── */
const TRUST_BADGES = [
  { icon: Shield, label: "Secure booking", sub: "256-bit SSL encrypted" },
  { icon: Award, label: "Best price guarantee", sub: "We match any lower rate" },
  { icon: Clock, label: "Free cancellation", sub: "On most rooms" },
  { icon: HeartHandshake, label: "24/7 support", sub: "Dedicated travel desk" },
]

const HOTELS = [
  {
    name: "Le Royal Luxembourg",
    area: "City Centre",
    image: "/images/hotels/city-center.jpg",
    pricePerNight: 189,
    originalPrice: 229,
    rating: 4.8,
    reviews: 342,
    stars: 5,
    amenities: ["Free WiFi", "Breakfast", "Spa & Pool", "City view"],
    description: "Elegant 5-star in the heart of the capital, steps from the Grand Ducal Palace and Place Guillaume II.",
    badge: "Top Rated",
  },
  {
    name: "Auberge des Ardennes",
    area: "Clervaux, Ardennes",
    image: "/images/hotels/countryside.jpg",
    pricePerNight: 109,
    rating: 4.7,
    reviews: 186,
    stars: 3,
    amenities: ["Free WiFi", "Garden terrace", "Free parking", "Restaurant"],
    description: "Charming countryside guesthouse surrounded by the rolling hills and forests of the Luxembourg Ardennes.",
    badge: "Best for Nature",
  },
  {
    name: "Hotel Heintz",
    area: "Vianden",
    image: "/images/hotels/vianden.jpg",
    pricePerNight: 129,
    rating: 4.6,
    reviews: 218,
    stars: 3,
    amenities: ["Free WiFi", "Castle view", "Free parking", "Breakfast"],
    description: "Cosy hotel with stunning views of Vianden Castle — ideal base for the Our Valley and Mullerthal Trail.",
    badge: null,
  },
  {
    name: "Melia Luxembourg",
    area: "Kirchberg / European Quarter",
    image: "/images/hotels/city-center.jpg",
    pricePerNight: 159,
    originalPrice: 199,
    rating: 4.5,
    reviews: 264,
    stars: 4,
    amenities: ["Free WiFi", "Fitness center", "Restaurant", "Near Mudam"],
    description: "Modern 4-star in Kirchberg, close to the Philharmonie, Mudam, and European institutions.",
    badge: "Great Location",
  },
  {
    name: "Eden au Lac",
    area: "Echternach",
    image: "/images/hotels/countryside.jpg",
    pricePerNight: 99,
    rating: 4.4,
    reviews: 152,
    stars: 3,
    amenities: ["Free WiFi", "Lake view", "Free parking", "Terrace"],
    description: "Lakeside hotel in Luxembourg's oldest town — gateway to the Mullerthal Trail and Benedictine abbey.",
    badge: "Budget Pick",
  },
]

const AREAS = [
  { name: "Luxembourg City Centre", desc: "Walking distance to the Chemin de la Corniche, Place d'Armes, and the Grand Ducal Palace.", from: 89 },
  { name: "Kirchberg European Quarter", desc: "Modern district home to the Philharmonie, Mudam museum, and EU institutions.", from: 119 },
  { name: "Grund & Clausen", desc: "Stay in the picturesque valley below the old city walls — bars, restaurants, and nature.", from: 79 },
  { name: "Vianden & the Our Valley", desc: "Base yourself near the iconic castle for hiking and cross-border day trips.", from: 69 },
  { name: "Echternach & Mullerthal", desc: "Luxembourg's 'Little Switzerland' — forests, rock formations, and peaceful trails.", from: 65 },
  { name: "Clervaux & Ardennes", desc: "Charming town with a famous castle and gateway to the northern Luxembourg forests.", from: 59 },
]

const FAQ = [
  {
    q: "What is the best area to stay in Luxembourg?",
    a: "Luxembourg City Centre is ideal for first-time visitors — within walking distance of the main sights, restaurants, and public transport. Kirchberg suits business travellers, while Vianden and Echternach are perfect for nature lovers.",
  },
  {
    q: "How far in advance should I book a hotel in Luxembourg?",
    a: "During peak summer months (June–August) and major events, book at least 3–4 weeks in advance. For off-season travel (November–March), last-minute deals are often available.",
  },
  {
    q: "Is breakfast usually included in Luxembourg hotels?",
    a: "Many 3–5 star hotels include breakfast in their rate, but budget properties and apartment hotels typically do not. Always check the room details before booking.",
  },
  {
    q: "Do Luxembourg hotels have free parking?",
    a: "City centre hotels rarely offer free parking due to space constraints. Countryside and suburban hotels usually include complimentary parking. Paid public car parks are widely available in Luxembourg City.",
  },
  {
    q: "Can I cancel my hotel booking for free?",
    a: "Most hotels in Luxembourg offer free cancellation up to 24–48 hours before check-in. Always review the cancellation policy for each property before confirming.",
  },
]

const amenityIcons: Record<string, React.ReactNode> = {
  "Free WiFi": <Wifi className="h-3 w-3" />,
  "Breakfast": <Coffee className="h-3 w-3" />,
  "Free parking": <Car className="h-3 w-3" />,
  "Restaurant": <Utensils className="h-3 w-3" />,
}

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
      ))}
    </div>
  )
}

export default function HotelsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative min-h-[520px] overflow-hidden">
          <Image
            src="/images/hotels-hero.jpg"
            alt="Boutique hotel in Luxembourg City old town"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/55 via-foreground/30 to-foreground/70" />

          <div className="relative mx-auto flex max-w-7xl flex-col px-4 py-16 lg:px-8">
            {/* Headline */}
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
                sightseeing.lu — Hotels
              </p>
              <h1 className="mt-3 text-balance text-4xl font-bold leading-tight text-white lg:text-5xl">
                Find Your Perfect Hotel in Luxembourg
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80">
                Compare hundreds of hotels across the Grand Duchy — from luxury city stays to
                peaceful countryside retreats. Best price guaranteed.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {["Free cancellation", "Best price guarantee", "Instant confirmation"].map((b) => (
                  <span key={b} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    <Check className="h-3 w-3 text-primary" />{b}
                  </span>
                ))}
              </div>
            </div>

            {/* Widget card */}
            <div className="mt-10 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-white/20">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Search Hotels in Luxembourg</span>
                </div>
                <span className="text-[10px] text-muted-foreground/60">Powered by Travelpayouts</span>
              </div>
              <div className="p-4">
                <HotelBookingWidget />
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust badges ── */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Featured hotels ── */}
        <section className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Hand-Picked Hotels</h2>
              <p className="mt-1 text-sm text-muted-foreground">Curated for quality, location, and value</p>
            </div>
            <span className="text-xs text-muted-foreground">{HOTELS.length} properties</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {HOTELS.map((hotel) => (
              <article
                key={hotel.name}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                {/* Image */}
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <Image
                    src={hotel.image}
                    alt={hotel.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                  />
                  {hotel.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                      {hotel.badge}
                    </span>
                  )}
                  {hotel.originalPrice && (
                    <span className="absolute right-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                      -{Math.round((1 - hotel.pricePerNight / hotel.originalPrice) * 100)}%
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <StarRow count={hotel.stars} />
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />{hotel.area}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-foreground leading-snug">{hotel.name}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{hotel.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {hotel.amenities.slice(0, 3).map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-foreground">
                          {amenityIcons[a] || <Check className="h-2.5 w-2.5 text-primary" />}{a}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Price + rating */}
                  <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold text-foreground">{hotel.rating}</span>
                      <span>({hotel.reviews})</span>
                    </div>
                    <div className="text-right">
                      {hotel.originalPrice && (
                        <p className="text-[11px] text-muted-foreground line-through">{hotel.originalPrice}&euro;</p>
                      )}
                      <p className="text-xl font-bold text-foreground leading-none">
                        {hotel.pricePerNight}<span className="ml-0.5 text-xs font-normal text-muted-foreground">&euro;/night</span>
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Explore by area ── */}
        <section className="border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
            <h2 className="text-2xl font-bold text-foreground">Explore Luxembourg by Area</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each region offers a different kind of stay — find the right fit for your trip.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AREAS.map((area) => (
                <div key={area.name} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">{area.name}</h3>
                    <span className="text-xs font-semibold text-primary">from {area.from}&euro;</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{area.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SEO editorial ── */}
        <section className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Hotels in Luxembourg City</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Luxembourg City is one of Europe's most compact yet stunning capitals. Staying in the city centre puts
                you steps from the UNESCO-listed Casemates, the Grand Ducal Palace, and some of the finest restaurants
                in the Benelux region. Whether you're after a grand 5-star experience on Boulevard Royal or a charming
                boutique room in the Grund district, Luxembourg City has accommodation for every budget.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Public transport in Luxembourg is completely free, making it easy to explore the entire country from a
                single base in the capital. Most major attractions — including the Philharmonie, Mudam, and the
                Adolphe Bridge — are reachable within 15 minutes from any city-centre hotel.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Countryside Retreats &amp; Nature Hotels</h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Beyond the capital, Luxembourg offers a wealth of charming countryside accommodation. The Mullerthal
                region — known as Luxembourg's Little Switzerland — features boutique guesthouses and family-run
                hotels surrounded by dramatic sandstone cliffs and ancient beech forests.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                The Ardennes in northern Luxembourg is perfect for hiking enthusiasts, with cosy hotels in Clervaux,
                Wiltz, and Vianden. The Our Valley along the German border offers riverside hotels with stunning
                castle views, while the Moselle wine region to the east provides vineyard hotels and spa retreats.
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <Sparkles className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Pair your hotel with a sightseeing experience</p>
              <p className="text-xs text-muted-foreground">
                Our AI trip planner combines the best local tours, transport, and accommodation into a single personalised itinerary.
              </p>
            </div>
            <Link
              href="/planner"
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Plan my trip <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-3xl px-4 py-14 lg:px-8">
            <h2 className="text-2xl font-bold text-foreground">Hotel FAQs — Luxembourg</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everything you need to know before you book.</p>
            <div className="mt-8 flex flex-col divide-y divide-border">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-foreground">{item.q}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA strip ── */}
        <section className="border-t border-border bg-primary/5">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-foreground">Ready to explore Luxembourg?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combine your hotel with local experiences — tours, food events, castle visits, and more.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/explore"
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  Browse experiences <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/planner"
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Sparkles className="h-4 w-4" /> AI Trip Planner
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter />
    </div>
  )
}
