"use client"

import { CloudSun, CloudRain, Sun, Droplets, Wind } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"

const WEATHER_ICONS: Record<string, React.ElementType> = {
  "cloud-sun": CloudSun,
  "cloud-rain": CloudRain,
  sun: Sun,
}

interface WeatherWidgetProps {
  /** Extra classes for the outer card (e.g. width on desktop). */
  className?: string
}

/**
 * Shared live-weather widget used across the site (homepage, trip detail, …).
 * Single source of truth so the SAME widget renders everywhere.
 */
export function WeatherWidget({ className = "" }: WeatherWidgetProps) {
  const { weather, isLoading } = useWeather()

  // Nothing to show once loading finished with no data.
  if (!isLoading && !weather) return null

  const WIcon = WEATHER_ICONS[weather?.current.icon ?? "cloud-sun"] || CloudSun

  return (
    <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Right now in {weather?.current.city ?? "Luxembourg"}
        </h3>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ) : weather ? (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <WIcon className="h-12 w-12 text-primary" />
            <div>
              <span className="text-4xl font-bold tracking-tight text-foreground">
                {weather.current.temp}&deg;C
              </span>
              <p className="text-sm text-muted-foreground">{weather.current.condition}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-4 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" />
              {weather.current.humidity}%
            </span>
            <span className="flex items-center gap-1">
              <Wind className="h-3.5 w-3.5" />
              {weather.current.wind} km/h
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {weather.forecast.map((d) => {
              const DI = WEATHER_ICONS[d.icon] || Sun
              return (
                <div
                  key={d.day}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/50 py-4 text-xs"
                >
                  <span className="text-muted-foreground">{d.day}</span>
                  <DI className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-foreground">{d.high}&deg;</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
