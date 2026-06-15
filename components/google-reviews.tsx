'use client'

import useSWR from 'swr'
import { Star, ExternalLink, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface GoogleReviewsProps {
  googleBusinessUrl?: string
  tripTitle: string
  rating: number
  reviewCount: number
}

interface Review {
  author: string
  rating: number
  date: string
  text: string
}

interface ReviewsData {
  name: string
  rating: number
  totalReviews: number
  reviews: Review[]
  error?: string
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) {
    return { error: `HTTP ${r.status}`, reviews: [] }
  }
  return r.json()
})

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Google" fill="none">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
      ))}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="min-w-[280px] animate-pulse rounded-lg border border-border bg-secondary/30 p-4 md:min-w-0">
      <div className="h-4 w-24 rounded bg-muted-foreground/20" />
      <div className="mt-3 h-3 w-32 rounded bg-muted-foreground/20" />
      <div className="mt-2 h-3 w-20 rounded bg-muted-foreground/20" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded bg-muted-foreground/20" />
        <div className="h-3 w-5/6 rounded bg-muted-foreground/20" />
      </div>
    </div>
  )
}

export function GoogleReviews({
  googleBusinessUrl,
  tripTitle,
  rating,
  reviewCount,
}: GoogleReviewsProps) {
  console.log("[v0] GoogleReviews received googleBusinessUrl:", googleBusinessUrl)
  
  // If no URL is provided, don't render anything
  if (!googleBusinessUrl) {
    console.log("[v0] GoogleReviews: No URL provided, returning null")
    return null
  }

  // Fetch reviews from the API
  const { data, isLoading, error } = useSWR<ReviewsData>(
    `/api/google-reviews?url=${encodeURIComponent(googleBusinessUrl)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3600000 } // Cache for 1 hour
  )

  // Loading state: show skeleton cards
  if (isLoading) {
    return (
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold text-foreground">Google Reviews</h2>
        <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  // Error handling
  if (error || data?.error) {
    const isPlaceIdError = data?.error?.includes("Place ID") || data?.error?.includes("NOT_FOUND")
    
    return (
      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Reviews not available</p>
            {isPlaceIdError ? (
              <p className="mt-2 text-sm text-amber-800">
                The Google Maps URL needs to include the Place ID. <strong>Use the "Share" button</strong> on Google Maps to get the correct link format (e.g., <code className="inline-block bg-amber-100 px-2 py-0.5 text-xs font-mono">https://share.google/...</code>), or ensure your URL contains the full place data.
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-800">Visit Google Maps to see reviews for this trip.</p>
            )}
            <a
              href={googleBusinessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-800"
            >
              View on Google Maps
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  // No reviews
  if (!data?.reviews || data.reviews.length === 0) {
    return null
  }

  return (
    <div className="mt-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Google Reviews</h2>
        <a
          href={googleBusinessUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          View all on Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div data-no-edit className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
        {data.reviews.slice(0, 3).map((review, idx) => (
          <div key={idx} className="min-w-[280px] flex flex-col justify-between rounded-lg border border-border bg-card p-4 md:min-w-0">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{review.author}</p>
                  <p className="text-xs text-muted-foreground">{review.date}</p>
                </div>
                <GoogleIcon className="h-4 w-4 shrink-0" />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground line-clamp-4">{review.text}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <StarRow rating={review.rating} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
