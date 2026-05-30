import { NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { dbListTrips, dbGetSettings } from "@/lib/db/queries"
import { getTourCMSConfig, showTourDatesAndDeals } from "@/lib/tourcms"
import { rateLimit, schedulePrune } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/** Current time as "HH:MM" in Europe/Luxembourg. */
function nowLuxHHMM(): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Luxembourg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(Date.now())
  return s.slice(0, 5)
}

const DEFAULT_PROMPT =
  "Analyze today's weather data, current time, available timeslots, trip title, trip description, and trip details. Recommend the best outdoor experiences that are still available today and most suitable for the current weather conditions."

const RankingSchema = z.object({
  rankings: z.array(
    z.object({
      tripId: z.string(),
      score: z.number().min(0).max(100),
      reason: z.string(),
      weatherMatch: z.enum(["excellent", "good", "fair", "poor"]),
    }),
  ),
})

export interface OutdoorTodaySlot {
  time: string
  spotsLeft: number | null
  priceDisplay?: string
}

export interface OutdoorTodayTrip {
  id: string
  title: string
  description: string | null
  image: string | null
  price: number | null
  originalPrice: number | null
  duration: string | null
  tags: string[]
  tripTags: string[]
  category: string | null
  city: string | null
  upcomingSlots: OutdoorTodaySlot[]
  weatherMatch: "excellent" | "good" | "fair" | "poor"
  aiReason: string
  score: number
}

export interface OutdoorTodayResponse {
  ok: boolean
  trips: OutdoorTodayTrip[]
  weather: { icon: string; condition: string; temp: number } | null
  displayCount: number
  aiPowered: boolean
  error?: string
}

// 10-minute server-side cache
const _cache = new Map<string, { data: OutdoorTodayResponse; expiresAt: number }>()

function todayYMD(): string {
  // Use Luxembourg date — a day starts at midnight there, not midnight UTC.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Luxembourg" }).format(Date.now())
}

/**
 * Returns true if the slot is still in the future (Luxembourg local time).
 *
 * Priority:
 *  1. start_time_utcseconds — epoch seconds from TourCMS (timezone-exact)
 *  2. start_time HH:MM string — compared to current Luxembourg time
 *  3. No time info — keep it (checkAvailability only returns bookable components)
 */
function isFutureSlot(slotTime: string, utcSeconds?: string): boolean {
  // Prefer UTC epoch seconds — accurate across DST changes
  if (utcSeconds) {
    return parseInt(utcSeconds, 10) > Math.floor(Date.now() / 1000)
  }
  // HH:MM string: compare to current Luxembourg time
  if (slotTime.length >= 5) {
    return slotTime > nowLuxHHMM()
  }
  // No time information → include (returned by checkAvailability for today, so bookable)
  return true
}

function weatherTagMatch(
  icon: string,
  condition: string,
  tags: string[],
): "excellent" | "good" | "fair" | "poor" {
  const isRainy =
    icon === "cloud-rain" ||
    condition.toLowerCase().includes("rain") ||
    condition.toLowerCase().includes("storm")
  const isIndoor = tags.includes("indoor")
  const isOutdoor = tags.includes("outdoor")

  if (isRainy) {
    if (isIndoor) return "excellent"
    if (isOutdoor) return "poor"
    return "fair"
  }
  if (isOutdoor) return "excellent"
  if (isIndoor) return "good"
  return "good"
}

export async function GET(req: Request) {
  schedulePrune()
  const rl = rateLimit(req, { limit: 10, windowMs: 60_000 })
  if (!rl.allowed) return rl.response

  // Read settings FIRST so displayCount can be part of the cache key.
  // This ensures changing the admin "Number of Trips" setting busts the cache immediately.
  let displayCount = 2
  let systemPrompt = DEFAULT_PROMPT
  let configModel = "anthropic/claude-haiku-4-5-20251001"
  let aiConfigMaxTokens = 1024
  let aiConfigTemperature = 0.5
  let anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? ""
  try {
    const settings = await dbGetSettings()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiConfig = (settings.ai as any)?.outdoor_today as Record<string, unknown> | undefined
    const configExtra = aiConfig?.extra && typeof aiConfig.extra === "object"
      ? aiConfig.extra as Record<string, unknown>
      : {}
    if (typeof configExtra.display_count === "number") displayCount = configExtra.display_count
    if (typeof aiConfig?.systemPrompt === "string" && aiConfig.systemPrompt) systemPrompt = aiConfig.systemPrompt
    if (typeof aiConfig?.model === "string" && aiConfig.model) configModel = aiConfig.model
    if (typeof aiConfig?.maxTokens === "number") aiConfigMaxTokens = aiConfig.maxTokens
    if (typeof aiConfig?.temperature === "number") aiConfigTemperature = aiConfig.temperature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiKeys = (settings as any)?.apiKeys as Record<string, string> | undefined
    if (apiKeys?.anthropic) anthropicApiKey = apiKeys.anthropic
  } catch { /* use defaults */ }

  // Cache key includes displayCount so changing the admin setting busts it immediately.
  const cacheKey = `outdoor|v4|${todayYMD()}|${displayCount}|${Math.floor(Date.now() / (10 * 60_000))}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json<OutdoorTodayResponse>(cached.data)
  }

  try {
    // Fetch weather from internal route
    const origin = new URL(req.url).origin
    let weather: { icon: string; condition: string; temp: number } | null = null
    try {
      const wRes = await fetch(`${origin}/api/weather`, { cache: "no-store" })
      if (wRes.ok) {
        const wData = await wRes.json()
        weather = {
          icon: wData?.current?.icon ?? "cloud-sun",
          condition: wData?.current?.condition ?? "Partly Cloudy",
          temp: wData?.current?.temp ?? 12,
        }
      }
    } catch { /* ignore, proceed without weather */ }

    const weatherIcon = weather?.icon ?? "cloud-sun"
    const weatherCondition = weather?.condition ?? "Partly Cloudy"

    // Fetch all published trips
    const allTrips = (await dbListTrips({ publicOnly: true })) as Record<string, unknown>[]

    // Get TourCMS config for live timeslots
    const tourcmsConfig = await getTourCMSConfig()
    const tripsWithPalisis = allTrips.filter((t) => t.palisis_id)
    const today = todayYMD()

    type SlotResult = { tripId: string; slots: OutdoorTodaySlot[] }
    let slotResults: SlotResult[] = []

    if (tourcmsConfig && tripsWithPalisis.length > 0) {
      const batch = tripsWithPalisis.slice(0, 20)
      const settled = await Promise.allSettled(
        batch.map(async (trip): Promise<SlotResult> => {
          const palisisId = String(trip.palisis_id)
          // Use showTourDatesAndDeals (calendar API) — no rate/quantity params needed,
          // unlike checkAvailability which requires r1/r2 rate selection to return slots.
          const res = await showTourDatesAndDeals(tourcmsConfig, palisisId, {
            startdate_start: today,
            startdate_end: today,
          })
          if (!res.ok || !res.dates?.length) return { tripId: String(trip.id), slots: [] }
          const slots: OutdoorTodaySlot[] = res.dates
            .filter((d) => {
              const slotTime = (d.start_time ?? "").slice(0, 5)
              return isFutureSlot(slotTime)
            })
            .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
            .map((d) => ({
              time: (d.start_time ?? "").slice(0, 5),
              spotsLeft:
                d.spaces_remaining === "UNLIMITED"
                  ? null
                  : d.spaces_remaining
                    ? Math.max(0, parseInt(d.spaces_remaining, 10) || 0)
                    : null,
              priceDisplay: d.offer_price_1_display ?? d.price_1_display ?? undefined,
            }))
          return { tripId: String(trip.id), slots }
        }),
      )
      slotResults = settled
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<SlotResult>).value)
        .filter((r) => r.slots.length > 0)
    }

    const slotMap = new Map<string, OutdoorTodaySlot[]>()
    for (const r of slotResults) slotMap.set(r.tripId, r.slots)

    // Eligible trips: have upcoming slots OR (no TourCMS) all trips
    const eligibleTrips = tourcmsConfig
      ? allTrips.filter((t) => slotMap.has(String(t.id)))
      : allTrips.slice(0, 20)

    if (eligibleTrips.length === 0) {
      const payload: OutdoorTodayResponse = {
        ok: true,
        trips: [],
        weather,
        displayCount,
        aiPowered: false,
      }
      _cache.set(cacheKey, { data: payload, expiresAt: Date.now() + 10 * 60_000 })
      return NextResponse.json<OutdoorTodayResponse>(payload)
    }

    // AI ranking
    type Ranking = {
      tripId: string
      score: number
      reason: string
      weatherMatch: "excellent" | "good" | "fair" | "poor"
    }
    let rankings: Ranking[] = []
    let aiPowered = false

    if (anthropicApiKey) {
      try {
        const anthropic = createAnthropic({ apiKey: anthropicApiKey })
        const rawModel = configModel.startsWith("anthropic/")
          ? configModel.slice("anthropic/".length)
          : configModel.startsWith("claude")
            ? configModel
            : "claude-haiku-4-5-20251001"
        const model = anthropic(rawModel)

        const tripSummaries = eligibleTrips.slice(0, 15).map((t) => ({
          id: String(t.id),
          title: t.title,
          description: (t.description as string | null)?.slice(0, 300) ?? "",
          tags: Array.isArray(t.tags) ? t.tags : [],
          tripTags: Array.isArray(t.tripTags) ? t.tripTags : [],
          duration: t.duration,
          category: t.category,
          upcomingSlots: (slotMap.get(String(t.id)) ?? []).slice(0, 3).map((s) => s.time),
        }))

        const userMessage = JSON.stringify({
          currentTime: nowLuxHHMM(),
          weather: { icon: weatherIcon, condition: weatherCondition, temp: weather?.temp },
          trips: tripSummaries,
        })

        const { experimental_output } = await generateText({
          model,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          maxTokens: aiConfigMaxTokens,
          temperature: aiConfigTemperature,
          experimental_output: Output.object({ schema: RankingSchema }),
        })

        if (experimental_output?.rankings?.length) {
          rankings = experimental_output.rankings
          aiPowered = true
        }
      } catch (aiErr) {
        console.warn("[outdoor-today] AI ranking failed, using tag fallback:", aiErr)
      }
    }

    // Build ranked trips
    type ScoredTrip = {
      trip: Record<string, unknown>
      score: number
      reason: string
      weatherMatch: "excellent" | "good" | "fair" | "poor"
    }

    let scored: ScoredTrip[]
    if (aiPowered && rankings.length > 0) {
      const rankMap = new Map(rankings.map((r) => [r.tripId, r]))
      scored = eligibleTrips
        .map((t) => {
          const rank = rankMap.get(String(t.id))
          const tags = Array.isArray(t.tags) ? (t.tags as string[]) : []
          return {
            trip: t,
            score: rank?.score ?? 0,
            reason: rank?.reason ?? "",
            weatherMatch: rank?.weatherMatch ?? weatherTagMatch(weatherIcon, weatherCondition, tags),
          }
        })
        .sort((a, b) => b.score - a.score)
    } else {
      scored = eligibleTrips
        .map((t) => {
          const tags = Array.isArray(t.tags) ? (t.tags as string[]) : []
          const match = weatherTagMatch(weatherIcon, weatherCondition, tags)
          const matchScore = { excellent: 100, good: 70, fair: 40, poor: 10 }[match]
          return { trip: t, score: matchScore, reason: "", weatherMatch: match }
        })
        .sort((a, b) => b.score - a.score)
    }

    const topTrips: OutdoorTodayTrip[] = scored
      .slice(0, Math.max(displayCount, 1) * 2)
      .map(({ trip, score, reason, weatherMatch }) => ({
        id: String(trip.id),
        title: String(trip.title ?? ""),
        description: (trip.description as string | null) ?? null,
        image: (trip.image as string | null) ?? null,
        price: typeof trip.price === "number" ? trip.price : null,
        originalPrice: typeof trip.originalPrice === "number" ? trip.originalPrice : null,
        duration: (trip.duration as string | null) ?? null,
        tags: Array.isArray(trip.tags) ? (trip.tags as string[]) : [],
        tripTags: Array.isArray(trip.tripTags) ? (trip.tripTags as string[]) : [],
        category: (trip.category as string | null) ?? null,
        city: (trip.city as string | null) ?? null,
        upcomingSlots: slotMap.get(String(trip.id)) ?? [],
        weatherMatch,
        aiReason: reason,
        score,
      }))

    const payload: OutdoorTodayResponse = {
      ok: true,
      trips: topTrips,
      weather,
      displayCount,
      aiPowered,
    }
    _cache.set(cacheKey, { data: payload, expiresAt: Date.now() + 10 * 60_000 })
    return NextResponse.json<OutdoorTodayResponse>(payload)
  } catch (err) {
    console.error("[outdoor-today] Error:", err)
    return NextResponse.json<OutdoorTodayResponse>(
      { ok: false, trips: [], weather: null, displayCount: 2, aiPowered: false, error: "Internal error" },
      { status: 500 },
    )
  }
}
