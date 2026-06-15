"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Calendar, CloudSun, CloudRain, Sun, Users, Plus, Minus, X } from "lucide-react"
import { useWeather } from "@/hooks/use-weather"
import { EditableText } from "@/components/editable-text"
import { EditableHeroBackground } from "@/components/editable-hero-background"
import { DateTimeModal } from "@/components/date-time-modal"
import type { DateTimeValue } from "@/components/date-time-modal"

const WEATHER_ICONS: Record<string, React.ElementType> = {
  "cloud-sun": CloudSun,
  "cloud-rain": CloudRain,
  sun: Sun,
}

export function HeroSection() {
  const [query, setQuery] = useState("")
  const [dateTime, setDateTime] = useState<DateTimeValue>({ date: "", timeFrom: "", timeTo: "" })
  const [dateModalOpen, setDateModalOpen] = useState(false)
  const [persons, setPersons] = useState(2)
  const [showPersons, setShowPersons] = useState(false)
  const router = useRouter()
  const { weather, isLoading } = useWeather()

  const iconKey: string = weather ? weather.current.icon : "cloud-sun"
  const WeatherIcon: React.ElementType = WEATHER_ICONS[iconKey] ?? CloudSun

  function handleSearch() {
    const params = new URLSearchParams()
    const q = query.trim()
    if (q) params.set("q", q)
    if (dateTime.date) params.set("date", dateTime.date)
    if (dateTime.timeFrom) params.set("timeFrom", dateTime.timeFrom)
    if (dateTime.timeTo) params.set("timeTo", dateTime.timeTo)
    if (persons > 1) params.set("persons", String(persons))
    router.push(`/search?${params.toString()}`)
  }

  const dateLabel = (() => {
    if (!dateTime.date && !dateTime.timeFrom) return null
    const d = dateTime.date
      ? new Date(dateTime.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : ""
    const t = dateTime.timeFrom
      ? dateTime.timeTo ? `${dateTime.timeFrom}–${dateTime.timeTo}` : dateTime.timeFrom
      : ""
    return [d, t].filter(Boolean).join(" · ")
  })()

  return (
    <>
    <DateTimeModal
      open={dateModalOpen}
      onClose={() => setDateModalOpen(false)}
      value={dateTime}
      onApply={(v) => setDateTime(v)}
    />
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <EditableHeroBackground />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/40 to-foreground/70" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 lg:px-8 lg:pb-24 lg:pt-32">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            <EditableText
              id="home:hero:headline"
              defaultValue="Handpicked Experiences"
              className="text-balance"
            />
          </h1>
          <p className="mt-3 text-base text-white/80 lg:text-lg">
            <EditableText
              id="home:hero:subtitle"
              defaultValue="Join us on the hunt for the best activities in and around Luxembourg."
              multiline
            />
          </p>

          <div data-no-edit className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
            {isLoading ? (
              <div className="h-4 w-32 animate-pulse rounded bg-white/20" />
            ) : weather ? (
              <>
                <WeatherIcon className="h-4 w-4 text-white" aria-hidden="true" />
                <span className="text-sm font-medium text-white">{weather.current.temp}&deg;C</span>
                <span className="text-xs text-white/70">{weather.current.condition}</span>
                <span className="h-3 w-px bg-white/30" />
                <span className="text-xs text-white/60">Luxembourg City</span>
              </>
            ) : (
              <span className="text-xs text-white/60">Luxembourg City</span>
            )}
          </div>
        </div>

        <div className="mt-8 max-w-3xl">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch() }}
            className="flex flex-col gap-3 rounded-2xl bg-background/95 p-3 shadow-xl backdrop-blur-sm sm:flex-row sm:items-center sm:gap-0 sm:divide-x sm:divide-border sm:rounded-full sm:p-2"
          >
            <div className="flex flex-1 items-center gap-2 px-4 py-2">
              <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search activities, tours, experiences…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                aria-label="Search keywords"
              />
            </div>

            <button
              type="button"
              onClick={() => setDateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-left focus:outline-none"
              aria-label="Select date and time"
            >
              <Calendar className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className={`text-sm ${dateLabel ? "text-foreground" : "text-muted-foreground"}`}>
                {dateLabel ?? "Date & time"}
              </span>
              {dateLabel && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setDateTime({ date: "", timeFrom: "", timeTo: "" }) }}
                  onKeyDown={(e) => e.key === "Enter" && setDateTime({ date: "", timeFrom: "", timeTo: "" })}
                  className="rounded-full text-muted-foreground/60 hover:text-muted-foreground"
                  aria-label="Clear date and time"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>

            <div className="relative flex items-center gap-2 px-4 py-2">
              <button
                type="button"
                onClick={() => setShowPersons((v) => !v)}
                className="flex items-center gap-2 focus:outline-none"
                aria-expanded={showPersons}
                aria-label="Select number of persons"
              >
                <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm text-foreground">
                  {persons} {persons === 1 ? "person" : "people"}
                </span>
              </button>
              {showPersons && (
                <div className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-lg sm:top-full sm:bottom-auto sm:mt-2">
                  <button
                    type="button"
                    onClick={() => setPersons((p) => Math.max(1, p - 1))}
                    disabled={persons <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                    aria-label="Decrease persons"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{persons}</span>
                  <button
                    type="button"
                    onClick={() => setPersons((p) => Math.min(20, p + 1))}
                    disabled={persons >= 20}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                    aria-label="Increase persons"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:ml-1 sm:rounded-full"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </button>
          </form>
        </div>
      </div>
    </section>
    </>
  )
}
