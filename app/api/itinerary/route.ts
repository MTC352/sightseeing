import { generateText, Output } from "ai"
import { z } from "zod"
import { dbGetSettings } from "@/lib/db/queries"

const itinerarySchema = z.object({
  steps: z.array(z.object({
    time: z.string().describe("Start time, e.g. '09:00'"),
    tripTitle: z.string(),
    tripId: z.string(),
    durationMinutes: z.number(),
    travelToNext: z.string().nullable().describe("How to get to next stop, null if last"),
    breakAfter: z.object({
      type: z.enum(["food", "coffee", "none"]).describe("Type of break needed after this stop. 'none' if no break needed."),
      label: z.string().describe("e.g. 'Lunch break', 'Coffee break', 'Dinner'. Empty string if type is none."),
      location: z.string().describe("The city/area of the preceding trip stop where the break takes place. Empty string if type is none."),
      durationMinutes: z.number().describe("Duration of the break in minutes. 0 if type is none."),
    }).describe("Optional food or coffee break after this stop. Set type to 'none' if no break is needed here."),
  })),
  summary: z.string().describe("One-sentence overview of the day plan"),
  tips: z.array(z.string()).describe("2-3 practical tips for the day"),
  carSuggestion: z.object({
    recommended: z.boolean().describe("True if a car rental would benefit this itinerary (spread-out locations, rural areas, heavy luggage)"),
    reason: z.string().describe("Why a car is or isn't recommended for this plan"),
  }),
  hotelSuggestion: z.object({
    recommended: z.boolean().describe("True if the day is long/tiring enough to warrant an overnight stay"),
    area: z.string().describe("Best area to stay near the last stop or city center"),
    reason: z.string().describe("Why an overnight stay is recommended"),
  }),
})

const dummyCarListings = [
  { name: "Volkswagen Polo", category: "Compact", price: 39, image: "/images/cars/compact-car.jpg", provider: "Europcar", badge: "Best Value" },
  { name: "Peugeot 3008 SUV", category: "SUV", price: 62, image: "/images/cars/suv.jpg", provider: "Hertz", badge: "Most Popular" },
  { name: "BMW 2 Series Convertible", category: "Convertible", price: 95, image: "/images/cars/convertible.jpg", provider: "Sixt", badge: "Premium" },
]

const dummyHotelListings = [
  { name: "Le Royal Luxembourg", area: "City Center", price: 189, image: "/images/hotels/city-center.jpg", stars: 5, badge: "Top Rated" },
  { name: "Auberge des Ardennes", area: "Clervaux, Ardennes", price: 109, image: "/images/hotels/countryside.jpg", stars: 3, badge: "Best for Nature" },
  { name: "Hotel Heintz", area: "Vianden", price: 129, image: "/images/hotels/vianden.jpg", stars: 3, badge: null },
  { name: "Eden au Lac", area: "Echternach", price: 99, image: "/images/hotels/countryside.jpg", stars: 3, badge: "Budget Pick" },
]

function pickHotelForArea(area: string) {
  const lower = area.toLowerCase()
  const match = dummyHotelListings.find(h => lower.includes(h.area.split(",")[0].toLowerCase()))
  return match || dummyHotelListings[0]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFallbackItinerary(trips: { id: string; title: string; city: string; duration: string; category: string }[], settings: Record<string, any>) {
  const [startHourStr] = settings.dayStartTime.split(":")
  const startHour = parseInt(startHourStr) || 9
  let currentMinute = 0
  // Use admin-configured buffer time
  const BUFFER_MINUTES = settings.bufferTimeBetweenStops || 30
  const TRAVEL_MINUTES = settings.travelTimeMethod === "walking" ? 25 : settings.travelTimeMethod === "driving" ? 15 : 20
  const MEAL_DURATION = settings.mealBreakDuration || 60

  const steps = trips.map((t, i) => {
    const dur = parseInt(t.duration) || 90
    const h = startHour + Math.floor(currentMinute / 60)
    const m = currentMinute % 60
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`

    // Add meal breaks based on admin settings
    const midIndex = Math.floor(trips.length / 2)
    const isLunchStop = i === midIndex - 1 && trips.length >= 2 && settings.autoInsertMealBreaks
    const isLastStop = i === trips.length - 1
    const breakAfter = isLunchStop
      ? { type: "food" as const, label: "Lunch break", location: t.city || "Luxembourg City", durationMinutes: MEAL_DURATION }
      : isLastStop && settings.autoInsertMealBreaks
      ? { type: "food" as const, label: "Dinner", location: t.city || "Luxembourg City", durationMinutes: MEAL_DURATION + 15 }
      : { type: "none" as const, label: "", location: "", durationMinutes: 0 }

    // Advance clock: activity duration + travel + buffer + any break
    currentMinute += dur + TRAVEL_MINUTES + BUFFER_MINUTES + (breakAfter.durationMinutes || 0)

    return {
      time,
      tripTitle: t.title,
      tripId: t.id,
      durationMinutes: dur,
      travelToNext: i < trips.length - 1 ? "15-20 min by bus/tram (free)" : null,
      breakAfter,
    }
  })
  const endHour = startHour + Math.floor(currentMinute / 60)
  const hasMultipleCities = new Set(trips.map(t => t.city).filter(Boolean)).size > 1
  const isLongDay = endHour >= 18
  const lastCity = trips[trips.length - 1]?.city || "Luxembourg City center"
  const suggestedHotel = pickHotelForArea(lastCity)

  return {
    steps,
    summary: `A curated ${trips.length}-stop day exploring ${[...new Set(trips.map(t => t.city).filter(Boolean))].join(" and ") || "Luxembourg"}.`,
    tips: [
      "Luxembourg has entirely free public transport -- buses, trams, and trains.",
      "Start early to avoid crowds at popular spots.",
      "Take a break for a local Kniddelen lunch between stops.",
    ],
    carSuggestion: {
      recommended: true,
      reason: hasMultipleCities
        ? "Your trips span multiple locations -- a rental car gives you flexibility and saves transit time between cities."
        : "A car lets you explore at your own pace, especially for scenic detours.",
      listings: dummyCarListings.slice(0, 2),
    },
    hotelSuggestion: {
      recommended: true,
      area: lastCity,
      reason: isLongDay
        ? `Your day runs until late -- consider staying overnight near ${lastCity} to recharge.`
        : "With multiple activities, an overnight stay lets you enjoy the evening atmosphere too.",
      listings: [suggestedHotel, ...dummyHotelListings.filter(h => h.name !== suggestedHotel.name).slice(0, 1)],
    },
  }
}

export async function POST(req: Request) {
  try {
    const { trips, startDate } = await req.json() as {
      trips: { id: string; title: string; city: string; duration: string; category: string }[]
      startDate?: string
    }

    if (!trips?.length) {
      return Response.json({ error: "No trips provided" }, { status: 400 })
    }

    // Validate the visit date. The UI picks dates in the user's local timezone
    // (Europe/Luxembourg for this site), so we must compare against the same
    // local day rather than raw UTC — otherwise a user selecting "today" in
    // the evening UTC-side may be wrongly rejected as past.
    // We also strictly parse the calendar date so impossible values like
    // "2026-02-31" don't slip through and produce garbled prompt context.
    const APP_TZ = "Europe/Luxembourg"
    function localTodayYMD(): string {
      // en-CA gives YYYY-MM-DD shape directly in the requested timezone.
      return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date())
    }
    function parseStrictYMD(s: string | undefined | null): string | null {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
      const [y, m, d] = s.split("-").map(Number)
      if (m < 1 || m > 12 || d < 1 || d > 31) return null
      // Round-trip through Date and verify the parts match — rejects 2026-02-31, etc.
      const probe = new Date(Date.UTC(y, m - 1, d))
      if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null
      return s
    }
    const today = localTodayYMD()
    const parsedDate = parseStrictYMD(startDate)
    const visitDate = parsedDate && parsedDate >= today ? parsedDate : null
    if (!visitDate) {
      return Response.json({ error: "MISSING_VISIT_DATE", message: "A valid visit date (YYYY-MM-DD, today or later) is required to build an itinerary." }, { status: 400 })
    }

    // Day-of-week context — helps the model pick realistic times for the chosen date.
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const [vy, vm, vd] = visitDate.split("-").map(Number)
    const visitDateObj = new Date(Date.UTC(vy, vm - 1, vd))
    const visitDayName = DAYS[visitDateObj.getUTCDay()]
    const visitPretty = `${visitDayName}, ${vd} ${MONTHS[vm - 1]} ${vy}`

    const tripList = trips.map((t, i) => `${i + 1}. "${t.title}" [${t.id}] in ${t.city} (${t.duration}, ${t.category})`).join("\n")
    
    // Get admin-configured planner behavior settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = (await dbGetSettings()).plannerBehavior as any
    const travelMethodLabel = settings.travelTimeMethod === "walking" ? "walking" 
      : settings.travelTimeMethod === "driving" ? "car/driving" 
      : "bus/tram (free public transport)"

    try {
      const { output } = await generateText({
        model: settings.model || "openai/gpt-4o-mini",
        output: Output.object({ schema: itinerarySchema }),
        prompt: `You are a Luxembourg travel planner. Build a RELAXED day itinerary from these saved trips.

VISIT DATE: ${visitPretty} (${visitDate}). Plan specifically for this date — treat it as authoritative when choosing realistic times, accounting for the day of week, typical opening hours, and night-vs-day suitability of each trip.

Sequence them by geographic proximity, suggest realistic start times beginning at ${settings.dayStartTime}.
Include ${travelMethodLabel} travel between stops.

IMPORTANT TIMING RULES (from admin configuration):
- Leave ${settings.bufferTimeBetweenStops} minutes of buffer time between each activity for spontaneous exploration, photos, souvenir shopping, or simply enjoying the moment.
- Don't schedule activities back-to-back. A relaxed pace is key to an enjoyable trip.
- Account for travel time PLUS this buffer when calculating the next activity's start time.
- Maximum ${settings.maxStopsPerDay} stops per day.
- Day should end by ${settings.dayEndTime}.
- Default activity duration (if not specified): ${settings.defaultActivityDuration} minutes.

Trips:
${tripList}

Build a practical, enjoyable day plan with a relaxed pace. Include 2-3 tips about timing, food breaks, or local knowledge.

For EACH step, decide if a food or coffee break is needed AFTER that step (before the next one):
${settings.autoInsertMealBreaks ? `- Add a lunch break (type: "food", ~${settings.mealBreakDuration} min) around ${settings.lunchBreakTime} if the itinerary spans more than 3 hours.
- Add a coffee break (type: "coffee", ~20 min) after a morning activity if there is a gap before the next stop.
- Add a dinner break (type: "food", ~${settings.mealBreakDuration + 15} min) around ${settings.dinnerBreakTime} if the last trip finishes before 20:00 and a hotel stay is recommended.` : '- Meal breaks are disabled by admin. Only add breaks if absolutely necessary for a very long day.'}
- Set type to "none" with empty label/location and durationMinutes: 0 if no break is needed after that step.
- The "location" field MUST be the city/area of that same step (e.g. "Echternach", "Luxembourg City", "Vianden"). This is used to search for restaurants nearby on TripAdvisor.

Also evaluate:
- CAR RENTAL: Recommend if trips span multiple cities/rural areas, or if travel between stops exceeds 30+ min by public transport. Luxembourg is small but some areas like Vianden, Mullerthal, or Echternach are easier by car.
- HOTEL STAY: Recommend if the itinerary runs late (past ${settings.dayEndTime}), involves tiring outdoor activities, or spans locations far from the starting point. Suggest the best area to stay based on the last stop.`,
      })
      return Response.json(output)
    } catch (aiErr) {
      console.error("[itinerary] AI failed, using fallback:", aiErr)
      return Response.json(buildFallbackItinerary(trips, settings))
    }
  } catch (err) {
    console.error("[itinerary] Error:", err)
    return Response.json({ error: "Failed to generate itinerary" }, { status: 500 })
  }
}
