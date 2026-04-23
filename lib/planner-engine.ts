import { trips, weatherData, type Trip } from "./data"

export interface PlannerResponse {
  text: string
  trips: Trip[]
  tags: string[]
  weatherNote?: string
}

export type WeatherCondition = "sunny" | "cloudy" | "rainy"

const KEYWORD_MAP: Record<string, string[]> = {
  food: ["food"], eat: ["food"], taste: ["food"], cuisine: ["food"], drink: ["food"],
  walk: ["culture", "outdoor"], history: ["culture"], culture: ["culture"], museum: ["culture"], castle: ["culture"],
  bike: ["sport"], cycle: ["sport"], cycling: ["sport"], sport: ["sport"], active: ["sport"],
  night: ["night"], evening: ["night"], sunset: ["night"], dark: ["night"],
  rain: ["indoor"], indoor: ["indoor"], shelter: ["indoor"],
  family: ["family"], kid: ["family"], children: ["family"],
  cheap: ["popular"], budget: ["popular"], affordable: ["popular"],
  sun: ["outdoor"], outdoor: ["outdoor"], park: ["outdoor"],
}

const AI_RESPONSES: Record<string, string> = {
  food: "Great choice! Luxembourg has a thriving food scene. Here are some culinary experiences where you can taste local specialties with expert guides who know all the hidden gems.",
  culture: "Luxembourg is steeped in history! From medieval fortifications to grand ducal palaces, these tours will immerse you in centuries of fascinating heritage.",
  sport: "Ready for an active adventure? Luxembourg's valleys and plateaus make for incredible cycling and outdoor experiences, especially with our premium e-bikes!",
  night: "The city transforms after dark! From illuminated bridges to lively neighborhoods, these evening experiences show Luxembourg's enchanting nightlife.",
  indoor: "No worries about the weather! Here are some fantastic indoor experiences that are perfect for a rainy day in Luxembourg.",
  family: "Exploring with the family? These kid-friendly activities are designed to keep everyone entertained while discovering Luxembourg together.",
  popular: "Looking for great value? These popular experiences offer amazing Luxembourg adventures that won't break the bank.",
  outdoor: "Perfect weather for outdoor exploration! Here are some fantastic open-air experiences to make the most of the sunshine.",
  default: "Here are some wonderful experiences in Luxembourg that match what you're looking for. Each one is led by passionate local guides!",
}

const WEATHER_NOTES: Record<WeatherCondition, string> = {
  sunny: "It's a beautiful day in Luxembourg -- perfect for outdoor adventures!",
  cloudy: "Partly cloudy skies today -- a great day for both indoor and outdoor experiences.",
  rainy: "Rain is expected today -- we've prioritized cozy indoor experiences for you.",
}

export function deriveWeatherCondition(): WeatherCondition {
  const condition = weatherData.current.condition.toLowerCase()
  if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("storm")) return "rainy"
  if (condition.includes("sun") || condition.includes("clear")) return "sunny"
  return "cloudy"
}

function scoreTrip(trip: Trip, weather: WeatherCondition, matchedTags: Set<string>): number {
  let score = 0
  // keyword match score
  for (const tag of matchedTags) {
    if (trip.tags.includes(tag)) score += 10
  }
  // weather bonus/penalty
  if (weather === "rainy") {
    score += trip.tags.includes("indoor") ? 5 : -3
    score += trip.tags.includes("outdoor") ? -2 : 0
  } else if (weather === "sunny") {
    score += trip.tags.includes("outdoor") ? 5 : 0
    score += trip.tags.includes("indoor") ? -1 : 0
  }
  // popularity bonus
  score += trip.tags.includes("popular") ? 2 : 0
  score += trip.rating >= 4.7 ? 1 : 0
  return score
}

export function getAIResponse(query: string, weather?: WeatherCondition): PlannerResponse {
  const wx = weather ?? deriveWeatherCondition()
  const lower = query.toLowerCase()
  const matchedTags = new Set<string>()

  for (const [kw, tags] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(kw)) tags.forEach((t) => matchedTags.add(t))
  }

  // If user mentions weather explicitly, add weather-aware tags
  if (lower.includes("rain") || lower.includes("rainy") || lower.includes("wet")) {
    matchedTags.add("indoor")
  }
  if (lower.includes("sun") || lower.includes("sunny") || lower.includes("nice weather")) {
    matchedTags.add("outdoor")
  }

  const tagArr = Array.from(matchedTags)

  // Score and rank all trips
  const scored = trips.map((t) => ({ trip: t, score: scoreTrip(t, wx, matchedTags) }))
  scored.sort((a, b) => b.score - a.score)

  let matched: Trip[]
  if (tagArr.length > 0) {
    // Return trips that match at least one tag, sorted by score
    const tagged = scored.filter((s) => tagArr.some((tag) => s.trip.tags.includes(tag)))
    matched = tagged.length > 0 ? tagged.map((s) => s.trip) : scored.slice(0, 4).map((s) => s.trip)
  } else {
    // No keywords -- return weather-optimized top picks
    matched = scored.slice(0, 5).map((s) => s.trip)
  }

  const responseKey = tagArr[0] || "default"
  let text = AI_RESPONSES[responseKey] || AI_RESPONSES.default

  // Append weather context to the response
  const weatherNote = WEATHER_NOTES[wx]
  if (tagArr.length === 0) {
    // When no specific query, lead with weather context
    text = `${weatherNote} ${text}`
  }

  return { text, trips: matched, tags: tagArr, weatherNote }
}

export function getWeatherGreeting(): string {
  const wx = deriveWeatherCondition()
  const { temp } = weatherData.current
  if (wx === "rainy") {
    return `Hey there! It's ${temp}°C and rainy in Luxembourg right now, but don't let that stop you -- I know plenty of cozy indoor experiences! What kind of adventure are you looking for?`
  }
  if (wx === "sunny") {
    return `Hey there! It's a gorgeous ${temp}°C and sunny in Luxembourg today -- perfect for exploring! What kind of experience are you after? Food tours, cycling, culture?`
  }
  return `Hey there! It's ${temp}°C with partly cloudy skies in Luxembourg. Great conditions for all kinds of experiences! What would you like to discover?`
}
