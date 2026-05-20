import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { TripCard } from "@/components/trip-card"
import { categories, type Trip } from "@/lib/data"
import { dbListTrips } from "@/lib/db/queries"
import { safeJsonLd } from "@/lib/json-ld"
import { Star, Clock, MapPin, ArrowRight } from "lucide-react"
import { notFound } from "next/navigation"

// Must be dynamic — published trip set changes with admin archive/draft actions.
export const dynamic = "force-dynamic"

async function getPublishedTrips(): Promise<Trip[]> {
  const rows = (await dbListTrips({ publicOnly: true }).catch(() => [])) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    title: String((r.title_override ?? r.title) ?? ""),
    image: String(r.image ?? "/images/placeholder.jpg"),
    price: Number(r.price ?? 0),
    originalPrice: r.originalPrice != null ? Number(r.originalPrice) : undefined,
    rating: Number(r.rating ?? 0),
    reviewCount: Number(r.reviewCount ?? 0),
    duration: String(r.duration ?? ""),
    category: String(r.category ?? ""),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    badge: r.badge != null ? String(r.badge) : undefined,
    city: r.city != null ? String(r.city) : undefined,
    description: r.description != null ? String(r.description) : undefined,
    permalink: r.permalink != null ? String(r.permalink) : undefined,
    provider: r.provider != null ? String(r.provider) : undefined,
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
  } as Trip))
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

function slugify(name: string) {
  return name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")
}

function unslugify(slug: string) {
  return categories.find((c) => slugify(c.name) === slug)
}

/* Category-specific intro paragraphs for AEO answer-first content */
const CATEGORY_INTROS: Record<string, string> = {
  "Food & Events":
    "Discover Luxembourg's culinary scene through our curated food tours, wine tastings, beer brewing workshops, brewery visits, and sunset concerts. From the Moselle Valley's finest wines to Luxembourg City's hidden food gems, our food and events experiences connect you with the authentic flavours of the Grand Duchy.",
  Tours:
    "Explore Luxembourg with our range of guided and self-guided tours. Whether you prefer a scenic bus tour, a walking tour through the historic old town, a full-day castle excursion, or a self-guided audio tour at your own pace, we have the perfect way to discover the Grand Duchy.",
  "Sports & Nature":
    "Get active in Luxembourg with our e-bike tours, e-scooter adventures, climbing initiations, and cycling rentals. From pedalling through the Alzette Valley to exploring the Mullerthal region's dramatic rock formations, our sports and nature experiences combine physical activity with stunning scenery.",
  Culture:
    "Immerse yourself in Luxembourg's rich cultural heritage through museum passes, cathedral audio tours, printing and playing card museums, and heritage trails. Our culture experiences take you from the underground slate mines of Haut-Martelange to the vibrant museums mile of Luxembourg City.",
  Dinnerhopping:
    "Experience Luxembourg's unique Dinner Hopping concept -- a multi-course meal at 3 different restaurants, all connected by a ride on a retro converted American School Bus. Choose from American, Italian, Latin American, or gourmet menus for an unforgettable evening out.",
  "Private Tours":
    "Enjoy a fully customizable private tour through Luxembourg's castles and countryside. With a personal driver-guide, flexible itineraries, and VIP treatment, our private tours are perfect for families, couples, or small groups who want an exclusive experience.",
}

const CATEGORY_FAQS: Record<string, { q: string; a: string }[]> = {
  "Food & Events": [
    { q: "What food tours are available in Luxembourg?", a: "We offer a 3-hour food tour through Luxembourg City (34 EUR), multiple wine tastings along the Moselle Valley (from 15 EUR), a beer brewing workshop (89 EUR), brewery visits (25 EUR), and beer tasting sessions (20 EUR)." },
    { q: "Can I do a wine tasting in Luxembourg?", a: "Yes! We have 5 wine tasting experiences across the Moselle Valley -- in Grevenmacher, Remerschen, Wellenstein, Wormeldange, and Ehnen. Prices start at 15 EUR per person for a 1.5-hour guided tasting." },
    { q: "Are the food tours suitable for dietary restrictions?", a: "Yes. Most of our food experiences accommodate vegetarian, vegan, gluten-free, and other dietary needs. Please inform us when booking." },
  ],
  Tours: [
    { q: "What is the best tour in Luxembourg City?", a: "Our Best Guided Walking Tour (25 EUR, 2.5h) is the top-rated option with 203 reviews and a 4.7 star rating. For a broader view, try the City Bus Tour (20 EUR, 2h) or the City Train (14.50 EUR, 50min)." },
    { q: "Are there castle tours in Luxembourg?", a: "Yes! The Nature and Castles Day Tour (56 EUR, 8h) visits Beaufort and Vianden castles. We also offer Private Castle Tours (from 320 EUR) with fully customizable itineraries." },
    { q: "Do you have self-guided tours?", a: "We offer 4 Self-Guided Walking Tours (4.99 EUR each) and a Cathedral Notre Dame Audio Tour (4.99 EUR). All use a mobile audio guide app." },
  ],
  "Sports & Nature": [
    { q: "Can I rent an e-bike in Luxembourg?", a: "Yes! We offer 1-day e-bike rentals for 35 EUR. We also have guided e-bike tours (55-70 EUR, 3 hours) covering Luxembourg City's highlights." },
    { q: "What outdoor activities are available?", a: "E-bike tours, e-scooter tours in Beaufort, climbing initiation in Echternach, and a UNESCO heritage cycling tour. Prices range from 9 EUR (climbing) to 70 EUR (guided e-bike tour)." },
  ],
  Culture: [
    { q: "What museums can I visit in Luxembourg?", a: "The Museums Mile pass (21 EUR) gives access to all 7 Luxembourg City museums. We also offer the Printing Museum and Playing Card Museum in Grevenmacher (5 EUR each), the Slate Mine in Haut-Martelange (14 EUR), and Museum A Possen in Bech-Kleinmacher (5 EUR)." },
    { q: "Is the Cathedral Notre Dame worth visiting?", a: "Absolutely. Our self-guided audio tour (4.99 EUR, 45 minutes) takes you through the history and architecture of this iconic Gothic cathedral." },
  ],
  Dinnerhopping: [
    { q: "What is the Dinner Hopping Bus?", a: "The Dinner Hopping Bus is a unique culinary concept where you enjoy a 3-course meal at 3 different restaurants, travelling between them on a retro converted American School Bus. It's a 4-hour experience starting at 99 EUR per person." },
    { q: "What menus are available on the Dinner Hopping Bus?", a: "We offer four flavour journeys: North American (99 EUR), Italian (99 EUR), Latin American (99 EUR), and a Gourmet option (109 EUR). VIP table upgrades with cremant are available." },
  ],
  "Private Tours": [
    { q: "How much does a private tour cost?", a: "Private Nature & Castle Day Tours start at 320 EUR for a 4-hour tour, with an 8-hour option available. The price includes a professional driver-guide and a fully customizable itinerary." },
    { q: "Can I customise my private tour?", a: "Yes. All private tours are fully customizable. Choose your preferred castles, stops, duration (4 or 8 hours), and pickup location." },
  ],
}

export function generateStaticParams() {
  return categories.map((cat) => ({ slug: slugify(cat.name) }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cat = unslugify(slug)
  if (!cat) return { title: "Category not found" }

  const allTrips = await getPublishedTrips()
  const catTrips = allTrips.filter((t) => t.category === cat.name)
  const description = `${cat.name} in Luxembourg: ${catTrips.length} experiences from ${Math.min(...catTrips.map((t) => t.price).filter((p) => p > 0)).toFixed(0)} EUR. ${CATEGORY_INTROS[cat.name]?.split(".")[0] ?? ""}.`

  return {
    title: `${cat.name} Experiences in Luxembourg`,
    description,
    alternates: { canonical: `${BASE}/experiences/${slug}` },
    openGraph: {
      title: `${cat.name} - Luxembourg Experiences | sightseeing.lu`,
      description,
      url: `${BASE}/experiences/${slug}`,
      images: catTrips[0] ? [{ url: catTrips[0].image.startsWith("/") ? `${BASE}${catTrips[0].image}` : catTrips[0].image, width: 1200, height: 630, alt: cat.name }] : [],
    },
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cat = unslugify(slug)
  if (!cat) notFound()

  // Published-only via DB — archived/draft trips never surface.
  const allTrips = await getPublishedTrips()
  const catTrips = allTrips
    .filter((t) => t.category === cat.name)
    .sort((a, b) => b.reviewCount - a.reviewCount)
  const prices = catTrips.map((t) => t.price).filter((p) => p > 0)
  const faqs = CATEGORY_FAQS[cat.name] ?? []

  /* JSON-LD: CollectionPage wrapping ItemList + BreadcrumbList + FAQPage */
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cat.name} Experiences in Luxembourg`,
    numberOfItems: catTrips.length,
    itemListElement: catTrips.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE}/trip/${t.id}`,
      name: t.title,
      image: t.image.startsWith("/") ? `${BASE}${t.image}` : t.image,
    })),
  }
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${BASE}/experiences/${slug}`,
      url: `${BASE}/experiences/${slug}`,
      name: `${cat.name} Experiences in Luxembourg`,
      description: CATEGORY_INTROS[cat.name] ?? `Browse ${catTrips.length} ${cat.name} experiences across Luxembourg.`,
      inLanguage: "en",
      isPartOf: { "@type": "WebSite", "@id": `${BASE}/#website`, url: BASE, name: "sightseeing.lu" },
      about: { "@type": "Thing", name: cat.name },
      mainEntity: itemListLd,
    },
    itemListLd,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        { "@type": "ListItem", position: 2, name: cat.name, item: `${BASE}/experiences/${slug}` },
      ],
    },
    ...(faqs.length > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]
      : []),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schemas) }} />
      <div className="min-h-screen bg-background">
        <Navbar />

        {/* Breadcrumb */}
        <div className="mx-auto max-w-7xl px-4 py-3 lg:px-8">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link href="/explore" className="hover:text-primary">Explore</Link>
            <span>/</span>
            <span className="text-foreground">{cat.name}</span>
          </nav>
        </div>

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <h1 className="text-balance text-2xl font-bold text-foreground lg:text-3xl">{cat.name} in Luxembourg</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground leading-relaxed">
            {CATEGORY_INTROS[cat.name] ?? `Explore ${catTrips.length} ${cat.name.toLowerCase()} experiences across Luxembourg.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">{catTrips.length} experiences</span>
            {prices.length > 0 && <span className="rounded-full border border-border px-3 py-1">From {Math.min(...prices).toFixed(0)} EUR</span>}
            <span className="rounded-full border border-border px-3 py-1">{[...new Set(catTrips.map((t) => t.city).filter(Boolean))].length} locations</span>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <h2 className="text-lg font-bold text-foreground">Compare All {cat.name} Experiences</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 font-semibold text-foreground">Experience</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Price</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Duration</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Rating</th>
                  <th className="px-4 py-3 font-semibold text-foreground">Location</th>
                  <th className="px-4 py-3 font-semibold text-foreground" />
                </tr>
              </thead>
              <tbody>
                {catTrips.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                          <Image src={t.image} alt={t.title} fill className="object-cover" sizes="40px" />
                        </div>
                        <div>
                          <Link href={`/trip/${t.id}`} className="font-medium text-foreground hover:text-primary">{t.title}</Link>
                          {t.badge && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{t.badge}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{t.price === 0 ? "Free" : `${t.price.toFixed(0)} EUR`}</td>
                    <td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.duration}</span></td>
                    <td className="px-4 py-3"><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{t.rating} <span className="text-xs text-muted-foreground">({t.reviewCount})</span></span></td>
                    <td className="px-4 py-3 text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t.city ?? "Luxembourg"}</span></td>
                    <td className="px-4 py-3">
                      <Link href={`/trip/${t.id}`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">View <ArrowRight className="h-3 w-3" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Trip Cards Grid */}
        <section className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <h2 className="text-lg font-bold text-foreground">All {cat.name} Experiences</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catTrips.map((t) => (
              <TripCard key={t.id} trip={t} />
            ))}
          </div>
        </section>

        {/* FAQ */}
        {faqs.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-8">
            <h2 className="text-lg font-bold text-foreground">Frequently Asked Questions</h2>
            <div className="mt-4 flex flex-col gap-3">
              {faqs.map((faq, i) => (
                <details key={i} className="group rounded-xl border border-border bg-card">
                  <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-foreground transition-colors hover:text-primary">
                    {faq.q}
                  </summary>
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}

        <SiteFooter />
      </div>
    </>
  )
}
