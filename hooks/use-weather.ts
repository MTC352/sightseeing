import useSWR from "swr"

export interface WeatherCurrent {
  temp: number
  feelsLike: number
  condition: string
  humidity: number
  wind: number
  icon: "sun" | "cloud-sun" | "cloud-rain"
  city: string
  sunrise: number
  sunset: number
}

export interface WeatherDay {
  day: string
  high: number
  low: number
  icon: "sun" | "cloud-sun" | "cloud-rain"
  condition: string
}

export interface DateWeather {
  temp: number
  condition: string
  icon: "sun" | "cloud-sun" | "cloud-rain"
  isRainy: boolean
}

export interface WeatherData {
  current: WeatherCurrent
  forecast: WeatherDay[]
  dateWeather?: DateWeather | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function useWeather(date?: string) {
  const url = date ? `/api/weather?date=${encodeURIComponent(date)}` : "/api/weather"

  const { data, error, isLoading } = useSWR<WeatherData | { error: string }>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 1800_000, // 30 min
    shouldRetryOnError: false,
  })

  // Only expose valid weather data — discard error-shaped responses
  const isErrorShape = data && "error" in data
  const weather = data && !isErrorShape ? (data as WeatherData) : null

  return {
    weather,
    isLoading,
    isError: !!error || !!isErrorShape,
    // dateWeather: present = forecast found, null = too far in future, undefined = no date requested
    dateWeather: weather?.dateWeather,
  }
}
