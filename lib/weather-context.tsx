"use client"

import { createContext, useContext } from "react"
import { useWeather } from "@/hooks/use-weather"
import type { WeatherData } from "@/hooks/use-weather"

const WeatherContext = createContext<WeatherData | null>(null)

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const { weather } = useWeather()
  return <WeatherContext.Provider value={weather}>{children}</WeatherContext.Provider>
}

/* Categories considered outdoor / weather-sensitive */
const OUTDOOR_CATEGORIES = new Set([
  "Sports & Nature",
  "Tours",
  "Walking Tours",
  "Bike Tours",
  "Boat Tours",
  "Adventure",
  "Outdoor",
  "Nature",
  "Hiking",
  "City Tours",
])

export function useIsGoodWeatherForTrip(category: string): boolean {
  const weather = useContext(WeatherContext)
  if (!weather) return false
  const { icon, temp } = weather.current
  const isNiceWeather = (icon === "sun" || icon === "cloud-sun") && temp >= 8
  return isNiceWeather && OUTDOOR_CATEGORIES.has(category)
}
