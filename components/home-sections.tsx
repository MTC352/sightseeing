"use client"

import React, { useState } from "react"

import Link from "next/link"
import { TripCard, TripCardSkeleton, TripCardSmallSkeleton } from "./trip-card"
import { OutdoorTodayTrips } from "./outdoor-today-trips"
import { tripSummaries as staticTrips, categories, type Trip } from "@/lib/data"
import { useGetPublicTripsQuery, useGetGoogleReviewsQuery } from "@/store/site/api"
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
import { Star, ChevronRight, CloudSun, CloudRain, Sun, Wind, Droplets, Thermometer, Utensils, Bike, Landmark, Map as MapIcon, Gift, Users, Wine, Sparkles, TrendingUp, Zap, Clock, ExternalLink, Settings2, Loader2, Check, X as XIcon } from "lucide-react"
import { iconForSlug } from "@/lib/tag-icons"
import { EditableText } from "@/components/editable-text"
import { useEditMode } from "@/components/edit-mode-provider"
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
        <Link href="/search" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex">See all <ChevronRight className="h-4 w-4" /></Link>
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

  // Fallback skeleton icon while loading
  const icon = weather?.current.icon ?? "cloud-sun"
  const WeatherIcon = WEATHER_ICONS[icon] || CloudSun

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

          {/* AI-powered outdoor recommendations */}
          <div className="flex flex-1 flex-col">
            <OutdoorTodayTrips
              isWeatherLoading={isLoading}
              weatherCondition={weather?.current.condition}
            />
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

function CategoryTileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4">
      <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
      <div className="h-3 w-20 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function CategoriesSection() {
  const [tags, setTags] = React.useState<HomepageTag[]>([])
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/trip-tags?homepage=1", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { tags: [] })
      .then((j) => { if (!cancelled) setTags(Array.isArray(j?.tags) ? j.tags : []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  // Hide entirely once we know there are no trending tags. While the first
  // fetch is in flight we render skeletons so the section reserves its space
  // and avoids the layout shift the user reported.
  if (!loading && tags.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <h2 className="text-xl font-bold text-foreground">
        <EditableText id="home:categories:heading" defaultValue="Currently trending categories" />
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <EditableText id="home:categories:subheading" defaultValue="From cultural tours to adventurous activities." />
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <CategoryTileSkeleton key={`sk-${i}`} />)
          : tags.map((t) => {
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

/* ─────────────────────────────────────────────────────────────────────────────
   Google Reviews Section
   Fetches live reviews from the main Sightseeing.lu Google Business Profile
   via /api/google-reviews (30-min server-side cache + RTK Query 30-min cache).
   Falls back gracefully when the Google Places API key isn't configured.
───────────────────────────────────────────────────────────────────────────── */

const GOOGLE_PROFILE_URL = "https://share.google/CMkITZRJksNDlPTRD"

function GoogleBrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Google" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function ReviewStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.floor(rating)
        const half = !filled && i - 0.5 <= rating
        return (
          <Star
            key={i}
            className={`${cls} ${filled ? "fill-amber-400 text-amber-400" : half ? "fill-amber-200 text-amber-300" : "text-muted-foreground/20"}`}
          />
        )
      })}
    </div>
  )
}

type LiveReview = { author: string; avatar?: string; rating: number; date: string; text: string; url?: string }
type LiveReviewsPayload = { name?: string; rating?: number; totalReviews?: number; reviews?: LiveReview[]; error?: string }

export function ReviewsSection() {
  const { data: rawData, isLoading, isError } = useGetGoogleReviewsQuery(GOOGLE_PROFILE_URL)
  const data = rawData as unknown as LiveReviewsPayload
  const { isEditMode, savedChanges, pendingChanges, addChange } = useEditMode()

  const [panelOpen, setPanelOpen] = useState(false)
  const [placeId, setPlaceId] = useState("")
  const [businessUrl, setBusinessUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "ok" | "err">("idle")

  const activeProfileUrl =
    (pendingChanges["home:reviews:businessUrl"] as string | undefined) ??
    (savedChanges["home:reviews:businessUrl"] as string | undefined) ??
    GOOGLE_PROFILE_URL

  const liveReviews: LiveReview[] = data?.reviews ?? []
  const overallRating = typeof data?.rating === "number" ? data.rating : null
  const totalReviews = typeof data?.totalReviews === "number" ? data.totalReviews : null
  const hasData = liveReviews.length > 0

  async function openPanel() {
    setPanelOpen(true)
    setSaveStatus("idle")
    try {
      const res = await fetch("/api/admin/integrations")
      if (res.ok) {
        const rows = (await res.json()) as Array<{ key: string; value: string }>
        setPlaceId(rows.find((r) => r.key === "googlePlaceId")?.value ?? "")
      }
    } catch {}
    setBusinessUrl(activeProfileUrl === GOOGLE_PROFILE_URL ? "" : activeProfileUrl)
  }

  async function saveConfig() {
    setSaving(true)
    setSaveStatus("idle")
    try {
      if (placeId.trim()) {
        await fetch("/api/admin/integrations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "googlePlaceId", label: "Google Place ID", value: placeId.trim() }),
        })
      }
      if (businessUrl.trim()) {
        addChange("home:reviews:businessUrl", businessUrl.trim())
      }
      setSaveStatus("ok")
      setTimeout(() => { setSaveStatus("idle"); setPanelOpen(false) }, 1200)
    } catch {
      setSaveStatus("err")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">

      {/* ── Google Reviews Settings Panel (edit mode only) ── */}
      {isEditMode && panelOpen && (
        <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-50 p-5 dark:bg-amber-950/20">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Settings2 className="h-4 w-4 text-amber-500" />
              Google Reviews Settings
            </h3>
            <button
              onClick={() => setPanelOpen(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Google Place ID</label>
              <input
                type="text"
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                placeholder="ChIJ…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Saved to Admin → Integrations immediately.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Google Business URL</label>
              <input
                type="url"
                value={businessUrl}
                onChange={(e) => setBusinessUrl(e.target.value)}
                placeholder="https://share.google/…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Used for the "View All Reviews" button.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveStatus === "ok" ? (
                <Check className="h-4 w-4" />
              ) : null}
              {saveStatus === "ok" ? "Saved!" : "Apply"}
            </button>
            {saveStatus === "err" && (
              <span className="text-xs font-medium text-destructive">Save failed — check console.</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">

          {/* ── Header row: title + overall rating + CTA button ── */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground">
                <EditableText id="home:reviews:heading" defaultValue="Travelers love Sightseeing.lu" />
              </h2>

              {/* Overall rating badge */}
              <div className="mt-2.5 flex items-center gap-2.5">
                {isLoading ? (
                  <>
                    <div className="h-9 w-14 animate-pulse rounded-lg bg-muted" />
                    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                  </>
                ) : hasData && overallRating !== null ? (
                  <>
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {overallRating.toFixed(1)}
                    </span>
                    <ReviewStars rating={overallRating} size="lg" />
                    <span className="text-sm text-muted-foreground">
                      {totalReviews ? `${totalReviews.toLocaleString()}+ reviews` : "Google Reviews"}
                    </span>
                    <GoogleBrandIcon className="h-5 w-5" />
                  </>
                ) : null}
              </div>
            </div>

            {/* "View All Reviews on Google" CTA + edit mode configure button */}
            <div className="flex shrink-0 items-center gap-2">
              {isEditMode && (
                <button
                  onClick={openPanel}
                  title="Configure Google Reviews"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Configure
                </button>
              )}
              <a
                href={activeProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                <GoogleBrandIcon className="h-4 w-4" />
                View All Reviews on Google
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </div>
          </div>

          {/* ── Review cards: carousel on mobile, grid on desktop ── */}
          {isLoading ? (
            <div className="mt-6 flex gap-4 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="min-w-[260px] animate-pulse rounded-2xl border border-border bg-card p-5 md:min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 rounded bg-muted" />
                      <div className="h-3 w-20 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-3.5 rounded bg-muted" />
                    <div className="h-3.5 w-5/6 rounded bg-muted" />
                    <div className="h-3.5 w-4/6 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasData ? (
            /* Graceful fallback */
            <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-secondary/30 p-10 text-center">
              <GoogleBrandIcon className="h-10 w-10 opacity-50" />
              <p className="mt-4 text-sm font-semibold text-foreground">Read what travelers are saying</p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {isError
                  ? "Configure a Google Places API key in Admin → Integrations to display live reviews here."
                  : "Authentic reviews from guests who have experienced our tours."}
              </p>
              <a
                href={activeProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View Reviews on Google
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : (
            /* Live review cards */
            <div className="mt-6 flex gap-4 overflow-x-auto pb-3 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">
              {liveReviews.slice(0, 5).map((review, idx) => (
                <div
                  key={idx}
                  className="group min-w-[260px] flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md md:min-w-0"
                >
                  {/* Reviewer header */}
                  <div className="flex items-start gap-3">
                    {review.avatar ? (
                      <img
                        src={review.avatar}
                        alt={review.author}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-border"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {review.author.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{review.author}</p>
                      <p className="text-xs text-muted-foreground">{review.date}</p>
                    </div>
                    <GoogleBrandIcon className="h-4 w-4 shrink-0 opacity-70" />
                  </div>

                  {/* Stars */}
                  <div className="mt-2">
                    <ReviewStars rating={review.rating} size="sm" />
                  </div>

                  {/* Review text */}
                  <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-5">
                    {review.text}
                  </p>

                  {/* View on Google — appears on hover */}
                  {review.url && (
                    <a
                      href={review.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      View on Google <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Bestseller sidebar ── */}
        <BestsellerSidebar />
      </div>
    </section>
  )
}

function BestsellerSidebar() {
  const { trips, isLoading } = usePublishedTrips()
  if (!isLoading && !trips[0]) return null
  return (
    <div className="shrink-0 lg:w-80">
      <h3 className="text-lg font-bold text-foreground">
        <EditableText id="home:bestseller:heading" defaultValue="This week's bestseller" />
      </h3>
      <div className="mt-4">
        {isLoading ? <TripCardSkeleton /> : <TripCard trip={trips[0]} priority />}
      </div>
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
  const { data, isLoading, isFetching, isError } = useGetPublicTripsQuery()
  const recentIds = useRecentlyViewed()
  const loading = (isLoading || isFetching) && !data

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

  // Section hidden entirely when the visitor has no recent views — there's
  // nothing to fetch in that case, so we never render a stray skeleton row.
  if (recentIds.length === 0) return null

  // Once data is loaded but none of the recent ids resolve to a still-
  // published trip, hide the section too.
  if (!loading && recent.length === 0) return null

  // While the trips API is still loading we render compact skeletons sized
  // to match the recent ids the visitor has, so the rail reserves its space
  // and doesn't push the layout when cards arrive.
  const skeletonCount = Math.min(recentIds.length, 4)

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
        {loading
          ? Array.from({ length: skeletonCount }).map((_, i) => <TripCardSmallSkeleton key={`sk-${i}`} />)
          : recent.map((t, i) => (
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
