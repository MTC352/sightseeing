import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { DepartingSoonItem } from "@/app/api/departing-soon/route"

export type { DepartingSoonItem }

export type DepartingSoonData = {
  ok: boolean
  departures: DepartingSoonItem[]
  autoUpdate: boolean
  interval: number
  cachedAt: string
  fromCache: boolean
}

export type WeatherData = {
  temp: number
  feels_like: number
  description: string
  icon: string
  humidity: number
  wind_speed: number
  city: string
  country: string
  cached?: boolean
  error?: string
}

export type GoogleReview = {
  author_name: string
  rating: number
  text: string
  time: number
  relative_time_description: string
  profile_photo_url: string
}

export type GoogleReviewsData = {
  reviews: GoogleReview[]
  rating: number
  total_ratings: number
  place_name: string
}

export type PublicTrip = {
  id: number
  title: string
  slug: string
  category: string
  subcategory?: string
  price: number
  duration: string
  location: string
  region?: string
  short_description?: string
  featured_image?: string
  featured: boolean
  status: string
  difficulty?: string
}

export type PublicPost = {
  id: number
  title: string
  slug: string
  excerpt?: string
  category?: string
  featured_image?: string
  published_at?: string
  author?: string
}

export const siteApi = createApi({
  reducerPath: "siteApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    getWeather: builder.query<WeatherData, string | void>({
      query: (city = "Luxembourg") => `/weather?city=${city}`,
      keepUnusedDataFor: 300,
    }),

    getGoogleReviews: builder.query<GoogleReviewsData, string>({
      query: (url) => `/google-reviews?url=${encodeURIComponent(url)}`,
      keepUnusedDataFor: 1800,
    }),

    getMapboxToken: builder.query<{ token: string }, void>({
      query: () => "/mapbox-token",
      keepUnusedDataFor: 3600,
    }),

    getPublicTrips: builder.query<PublicTrip[], void>({
      query: () => "/trips",
      keepUnusedDataFor: 300,
    }),

    getPublicPosts: builder.query<PublicPost[], void>({
      query: () => "/posts",
      keepUnusedDataFor: 300,
    }),
  }),
})

export const {
  useGetWeatherQuery,
  useGetGoogleReviewsQuery,
  useGetMapboxTokenQuery,
  useGetPublicTripsQuery,
  useGetPublicPostsQuery,
} = siteApi
