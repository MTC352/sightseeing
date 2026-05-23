"use client"

import React from "react"

import Link from "next/link"
import { TripCard, TripCardSkeleton } from "./trip-card"
import { tripSummaries as staticTrips, categories, reviews, type Trip } from "@/lib/data"
import { useGetPublicTripsQuery } from "@/store/site/api"
import { useWeather } from "@/hooks/use-weather"
import { useRecentlyViewed } from "@/lib/use-recently-viewed"

/** Shape of one trip in the /api/trips response. */
interface ApiTrip {
  id: string | number
  title: string
  price: number
  originalPrice?: number
  duration?: string | null
  rating?: number
  reviewCount?: number
  category?: string
  city?: string | null
  description?: string | null
  tags?: string[] | null
  badge?: string | null
  image?: string | null
  featured?: boolean
}

/** Pull the trips array out of /api/trips' `{ meta, trips }` wrapper. */
function extractApiTrips(data: unknown): ApiTrip[] {
  if (!data) return []
  if (Array.isArray(data)) return data as ApiTrip[]
  const obj = data as { trips?: ApiTrip[] }
  return Array.isArray(obj.trips) ? obj.trips : []
}

/** Convert one /api/trips row into the Trip shape TripCard expects. */
function apiToTrip(t: ApiTrip): Trip {
  return {
    id: String(t.id),
    title: t.title,
    image: t.image || "/placeholder.svg",
    price: Number(t.price ?? 0),
    originalPrice: t.originalPrice != null ? Number(t.originalPrice) : undefined,
    rating: Number(t.rating ?? 0),
    reviewCount: Number(t.reviewCount ?? 0),
    duration: t.duration ?? "",
    category: t.category ?? "Tours",
    tags: Array.isArray(t.tags) ? t.tags : [],
    badge: t.badge ?? undefined,
    city: t.city ?? undefined,
  }
}

/**
 * Hook: returns every published trip from the DB, already shaped for
 * <TripCard />. Previously this intersected the API list with the
 * static `tripSummaries` seed — but that seed is empty (lib/data.ts:83),
 * so the intersection was always empty and homepage sections that used
 * it rendered nothing. Now we build Trip objects directly from the API
 * payload, which contains every field TripCard needs.
 */
function usePublishedTrips(): { trips: Trip[]; isLoading: boolean } {
  // refetchOnMountOrArgChange forces a fresh /api/trips call every time the
  // homepage mounts, so admin Featured toggles show up immediately on the
  // next navigation rather than waiting for the RTK Query cache to expire.
  const { data, isLoading, isFetching, isError } = useGetPublicTripsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  })
  // Treat the first fetch (no cached data yet) as "loading" so consumers
  // can render skeletons. Once we have ANY data, subsequent background
  // refetches (isFetching) shouldn't flash skeletons over real content.
  const loading = (isLoading || isFetching) && !data
  if (loading || isError) return { trips: [], isLoading: loading }
  return { trips: extractApiTrips(data).map(apiToTrip), isLoading: false }
}

/**
 * Hook: returns the set of trip IDs flagged `featured` in the DB. The
 * homepage "Trending this month" section uses this so the admin's
 * Featured toggle on /admin/trips actually drives what shows up there
 * (previously it filtered by the static "popular" tag, which the admin
 * couldn't control, so toggling Featured had no visible effect).
 */
function useFeaturedTripIds(): Set<string> {
  const { data, isLoading, isError } = useGetPublicTripsQuery()
  if (isLoading || isError) return new Set()
  return new Set(
    extractApiTrips(data)
      .filter((t) => t.featured === true)
      .map((t) => String(t.id))
  )
}
import { Star, ChevronRight, CloudSun, CloudRain, Sun, Wind, Droplets, Thermometer, Utensils, Bike, Landmark, Map as MapIcon, Gift, Users, Wine, Sparkles, TrendingUp, Zap, Clock } from "lucide-react"
import { iconForSlug } from "@/lib/tag-icons"
import { EditableText } from "@/components/editable-text"
import { DeparturesSoonSection } from "@/components/departing-soon-section"

export { DeparturesSoonSection }

const CATEGORY_ICONS: Record<string, React.ElementType> = { "Food & Events": Utensils, "Sports & Nature": Bike, Culture: Landmark, Tours: MapIcon, "Gift Vouchers": Gift, "Private Tours": Users, Dinnerhopping: Wine, "LUGA Goodies": Sparkles }
const WEATHER_ICONS: Record<string, React.ElementType> = { "cloud-sun": CloudSun, "cloud-rain": CloudRain, sun: Sun }

/* Trending Section */
export function TrendingSection() {
  const { trips, isLoading } = usePublishedTrips()
  const featuredIds = useFeaturedTripIds()
  // Trending now reflects the admin's Featured toggle on /admin/trips
  // (DB `trips.featured`) instead of the static "popular" tag, which
  // wasn't user-editable. Fallback to the legacy "popular" tag only
  // when nothing is featured yet, so the section is never empty on a
  // fresh install.
  const trending = (featuredIds.size > 0
    ? trips.filter((t) => featuredIds.has(String(t.id)))
    : trips.filter((t) => t.tags.includes("popular"))
  ).slice(0, 3)
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" />
            <EditableText id="home:trending:heading" defaultValue="Trending this month" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <EditableText id="home:trending:subheading" defaultValue="Do not miss out on these trips." />
          </p>
        </div>
        <Link href="/explore" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex">See all <ChevronRight className="h-4 w-4" /></Link>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <TripCardSkeleton key={`sk-${i}`} />)
          : trending.map((t, i) => <TripCard key={t.id} trip={t} priority={i === 0} />)}
      </div>
    </section>
  )
}

/* Weather Widget Section */
export function WeatherSection() {
  const { weather, isLoading } = useWeather()
  const { trips } = usePublishedTrips()

  // Fallback skeleton icon while loading
  const icon = weather?.current.icon ?? "cloud-sun"
  const WeatherIcon = WEATHER_ICONS[icon] || CloudSun

  const isRainy = weather?.current.condition.toLowerCase().includes("rain") ?? false
  const suggestedTrips = trips
    .filter((t) => isRainy ? t.tags.includes("indoor") : t.tags.includes("outdoor"))
    .slice(0, 3)

  // Minimal white background theme - no sky gradients
  const BG_STYLES: Record<string, { bg: string; orb: string; text: string; subtext: string; badge: string; forecastBg: string; iconColor: string }> = {
    "sun": {
      bg: "bg-white",
      orb: "hidden",
      text: "text-foreground",
      subtext: "text-muted-foreground",
      badge: "bg-primary/10 text-primary border border-primary/20",
      forecastBg: "bg-secondary hover:bg-secondary/80",
      iconColor: "text-amber-500",
    },
    "cloud-sun": {
      bg: "bg-white",
      orb: "hidden",
      text: "text-foreground",
      subtext: "text-muted-foreground",
      badge: "bg-primary/10 text-primary border border-primary/20",
      forecastBg: "bg-secondary hover:bg-secondary/80",
      iconColor: "text-slate-500",
    },
    "cloud-rain": {
      bg: "bg-white",
      orb: "hidden",
      text: "text-foreground",
      subtext: "text-muted-foreground",
      badge: "bg-primary/10 text-primary border border-primary/20",
      forecastBg: "bg-secondary hover:bg-secondary/80",
      iconColor: "text-slate-600",
    },
  }

  const theme = BG_STYLES[icon] ?? BG_STYLES["cloud-sun"]

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          {/* Weather card — minimal white design */}
          <div
            className={`shrink-0 overflow-hidden rounded-2xl border border-border shadow-sm lg:w-72 ${theme.bg}`}
          >
            {/* Content */}
            <div className="relative z-10 p-6">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-bold ${theme.text}`}>{weather?.current.city ?? "Luxembourg"}</h3>
                {!isLoading && weather && (
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${theme.badge}`}>Live</span>
                )}
              </div>

              <div className="mt-5 flex items-end gap-4">
                {isLoading ? (
                  <div className="h-16 w-40 animate-pulse rounded-lg bg-secondary" />
                ) : (
                  <>
                    <WeatherIcon className={`h-16 w-16 ${theme.iconColor}`} />
                    <div>
                      <span className={`text-6xl font-light tracking-tight ${theme.text}`}>
                        {weather?.current.temp ?? "--"}&deg;
                      </span>
                      <p className={`text-sm font-medium ${theme.text}`}>{weather?.current.condition}</p>
                    </div>
                  </>
                )}
              </div>

              {isLoading ? (
                <div className="mt-3 h-4 w-32 animate-pulse rounded bg-secondary" />
              ) : (
                <p className={`mt-2 text-xs ${theme.subtext}`}>Feels like {weather?.current.feelsLike}&deg;C</p>
              )}

              <div className={`mt-4 flex gap-4 text-xs font-medium ${theme.subtext}`}>
                <span className="flex items-center gap-1">
                  <Droplets className="h-3.5 w-3.5" />
                  {isLoading ? "--" : `${weather?.current.humidity}%`}
                </span>
                <span className="flex items-center gap-1">
                  <Wind className="h-3.5 w-3.5" />
                  {isLoading ? "--" : `${weather?.current.wind} km/h`}
                </span>
                <span className="flex items-center gap-1">
                  <Thermometer className="h-3.5 w-3.5" />
                  {isLoading ? "--" : `${weather?.current.feelsLike}&deg;`}
                </span>
              </div>

              {/* 4-day forecast grid */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 rounded-lg bg-secondary p-3">
                      <div className="h-2.5 w-8 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-5 animate-pulse rounded-full bg-muted" />
                      <div className="h-3 w-6 animate-pulse rounded bg-muted" />
                    </div>
                  ))
                ) : (
                  weather?.forecast.map((d) => {
                    const DI = WEATHER_ICONS[d.icon] || Sun
                    return (
                      <div key={d.day} className={`flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 text-xs transition-colors ${theme.forecastBg}`}>
                        <span className={`font-medium ${theme.subtext}`}>{d.day}</span>
                        <DI className={`h-5 w-5 ${theme.iconColor}`} />
                        <span className={`font-bold ${theme.text}`}>{d.high}&deg;</span>
                        <span className={`text-[10px] ${theme.subtext}`}>{d.low}&deg;</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Suggested trips */}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                {isLoading ? "Trips for today's weather" : isRainy ? "Best indoor experiences today" : "Best outdoor experiences today"}
              </h3>
              <Link href="/explore" className="text-sm font-medium text-primary hover:underline">View all</Link>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? "Loading recommendations based on current conditions..."
                : `Based on ${weather?.current.condition.toLowerCase()} conditions, we recommend these experiences.`}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {suggestedTrips.map((t) => <TripCard key={t.id} trip={t} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* Categories Section — driven by the `trip_tags` table (admin-managed at
 *  /admin/trip-tags).  Each card links to /search?tag={slug} so the search
 *  page can pre-select the filter. */
interface HomepageTag { slug: string; label: string; trip_count: number }

export function CategoriesSection() {
  const [tags, setTags] = React.useState<HomepageTag[]>([])
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/trip-tags?homepage=1", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { tags: [] })
      .then((j) => { if (!cancelled) setTags(Array.isArray(j?.tags) ? j.tags : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  if (tags.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <h2 className="text-xl font-bold text-foreground">
        <EditableText id="home:categories:heading" defaultValue="Currently trending categories" />
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <EditableText id="home:categories:subheading" defaultValue="From cultural tours to adventurous activities." />
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        {tags.map((t) => {
          const Icon = iconForSlug(t.slug)
          return (
            <Link key={t.slug} href={`/search?tag=${encodeURIComponent(t.slug)}`} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
              <span className="text-xs font-semibold text-foreground">{t.label}</span>
              <span className="text-[10px] text-muted-foreground">{t.trip_count} experience{t.trip_count === 1 ? "" : "s"}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* Deals Section */
export function DealsSection() {
  const { trips } = usePublishedTrips()
  const deals = trips.filter((t) => t.originalPrice).slice(0, 3)
  if (deals.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="rounded-2xl bg-primary/5 p-6 lg:p-8">
        <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Zap className="h-5 w-5 text-primary" />
          <EditableText id="home:deals:heading" defaultValue="Last Minute Deals" />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <EditableText id="home:deals:subheading" defaultValue="Grab these discounted experiences before they sell out!" />
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{deals.map((t) => <TripCard key={t.id} trip={t} />)}</div>
      </div>
    </section>
  )
}

/* Reviews Section */
export function ReviewsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">
            <EditableText id="home:reviews:heading" defaultValue="Travelers love Sightseeing.lu" />
          </h2>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-bold text-foreground">4.7</span>
            <div className="flex gap-0.5">{[...Array(5)].map((_, i) => <Star key={i} className={`h-5 w-5 ${i < 4 ? "fill-amber-400 text-amber-400" : "fill-amber-400/30 text-amber-400/30"}`} />)}</div>
            <span className="text-sm text-muted-foreground">285 reviews</span>
          </div>
          <div className="mt-6 flex flex-col gap-4">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{r.author}</span>
                  <span className="text-xs text-muted-foreground">{r.date}</span>
                </div>
                <div className="mt-1 flex gap-0.5">{[...Array(5)].map((_, i) => <Star key={i} className={`h-3 w-3 ${i < r.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`} />)}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                <p className="mt-1 text-xs text-primary">{r.tripTitle}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Bestseller sidebar */}
        <BestsellerSidebar />
      </div>
    </section>
  )
}

function BestsellerSidebar() {
  const { trips } = usePublishedTrips()
  if (!trips[0]) return null
  return (
    <div className="shrink-0 lg:w-80">
      <h3 className="text-lg font-bold text-foreground">
        <EditableText id="home:bestseller:heading" defaultValue="This week's bestseller" />
      </h3>
      <div className="mt-4"><TripCard trip={trips[0]} priority /></div>
    </div>
  )
}

/* Recently Viewed (small card format)
 *
 * Dynamic: reads the visitor's recently-viewed trip ids from localStorage
 * (recorded on each /trip/[id] visit) and renders the latest 4 that are still
 * published. The whole section is hidden until the visitor has actually viewed
 * at least one trip so we never render an empty rail or stale static seeds. */
export function RecentlyViewed() {
  // Source DB trips directly (not the static-seed intersection) — DB IDs are
  // shaped "tcms_25" and don't collide with the legacy numeric ids in
  // lib/data.ts, so usePublishedTrips() would never find them.
  const { data, isLoading, isError } = useGetPublicTripsQuery()
  const recentIds = useRecentlyViewed()

  // Normalise the API response into the minimal Trip shape TripCard expects.
  const apiTrips = React.useMemo(() => {
    if (isLoading || isError || !data) return [] as Array<typeof staticTrips[number]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = Array.isArray(data as any) ? (data as any) : ((data as any)?.trips ?? [])
    return arr.map((t) => ({
      id: String(t.id),
      title: String(t.title ?? ""),
      category: String(t.category ?? "Tours"),
      city: t.city ? String(t.city) : undefined,
      image: String(t.image ?? "/placeholder.svg"),
      price: typeof t.price === "number" ? t.price : Number(t.price ?? 0),
      rating: typeof t.rating === "number" ? t.rating : Number(t.rating ?? 0),
      reviewCount: typeof t.reviewCount === "number" ? t.reviewCount : Number(t.reviewCount ?? 0),
      duration: String(t.duration ?? ""),
      tags: Array.isArray(t.tags) ? t.tags : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any as typeof staticTrips
  }, [data, isLoading, isError])

  // Lookup by id, then re-order by recency. Drops any id whose trip is no
  // longer published (or never existed in the catalog).
  const byId = React.useMemo(() => {
    const m = new globalThis.Map<string, (typeof apiTrips)[number]>()
    for (const t of apiTrips) m.set(String(t.id), t)
    return m
  }, [apiTrips])

  const recent = React.useMemo(() => {
    const out: typeof apiTrips = []
    const seen = new Set<string>()
    for (const id of recentIds) {
      const key = String(id)
      if (seen.has(key)) continue
      const t = byId.get(key)
      if (t) {
        out.push(t)
        seen.add(key)
        if (out.length >= 4) break
      }
    }
    return out
  }, [recentIds, byId])

  // Section hidden entirely when the visitor has no recent views yet —
  // matches the screenshot the user shared (heading without empty grid only
  // appears once they've actually viewed trips).
  if (recent.length === 0) return null

  return (
    <section data-testid="recently-viewed" className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
        <Clock className="h-5 w-5 text-primary" />
        <EditableText id="home:recent:heading" defaultValue="Recently Viewed" />
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <EditableText id="home:recent:subheading" defaultValue="Pick up where you left off." />
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {recent.map((t, i) => (
          <TripCard key={t.id} trip={t} variant="small" priority={i === 0} />
        ))}
      </div>
    </section>
  )
}

/* Stats Bar */
export function StatsBar() {
  const stats = [{ label: "Routes", value: "+100", sub: "Destinations near you" }, { label: "TripAdvisor Score", value: "4.5", sub: "4,500 on TripAdvisor" }, { label: "Seating Capacity", value: "1,920", sub: "Capacity of rides" }, { label: "E-Bikes", value: "76", sub: "An ecological way to discover" }]
  return (
    <section className="bg-primary/10">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-8 lg:grid-cols-4 lg:px-8">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-2xl font-bold text-primary">{s.value}</p>
            <p className="text-sm font-semibold text-foreground">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
