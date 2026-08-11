"use client"

import React from "react"
import { Star, ExternalLink } from "lucide-react"
import type { GlobalReviews, LiveReview } from "@/lib/google-reviews-normalize"
import { ReviewAvatar } from "@/components/review-avatar"

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
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-border"}`} />
      ))}
    </div>
  )
}

/* One review at a time — auto-advances every 5s and loops. Mirrors the
 * homepage ReviewSlider (pause on hover, respects prefers-reduced-motion,
 * dot navigation). */
function ReviewSlider({ reviews }: { reviews: LiveReview[] }) {
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const count = reviews.length

  React.useEffect(() => {
    if (index > count - 1) setIndex(0)
  }, [count, index])

  React.useEffect(() => {
    if (count <= 1 || paused) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000)
    return () => clearInterval(id)
  }, [count, paused])

  if (count === 0) return null
  const active = Math.min(index, count - 1)

  return (
    <div
      className="mt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Viewport */}
      <div className="relative overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {reviews.map((review, idx) => (
            <div key={idx} aria-hidden={idx !== active} className="w-full shrink-0 px-0.5">
              <div className="flex min-h-[240px] flex-col rounded-2xl border border-border bg-background p-6 shadow-sm">
                {/* Reviewer header */}
                <div className="flex items-start gap-3">
                  <ReviewAvatar src={review.avatar} name={review.author} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{review.author}</p>
                    <p className="text-xs text-muted-foreground">{review.date}</p>
                  </div>
                  <GoogleIcon className="h-5 w-5 shrink-0 opacity-70" />
                </div>

                {/* Stars */}
                <div className="mt-3">
                  <StarRow rating={review.rating} />
                </div>

                {/* Review text */}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-6">
                  {review.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {reviews.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setIndex(idx)}
              aria-label={`Go to review ${idx + 1}`}
              aria-current={idx === active}
              className={`h-2 rounded-full transition-all ${
                idx === active ? "w-6 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function AboutGoogleReviews({ data, profileUrl }: { data: GlobalReviews | null; profileUrl: string }) {
  const reviews = data?.reviews ?? []
  const rating = typeof data?.rating === "number" ? data.rating : null
  const total = typeof data?.totalReviews === "number" ? data.totalReviews : null

  // Graceful fallback — key/reviews unavailable. Always render something.
  if (reviews.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-background p-10 text-center">
        <GoogleIcon className="h-9 w-9 opacity-60" />
        <p className="mt-4 text-sm font-semibold text-foreground">Read what travellers are saying</p>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Authentic reviews from guests who have experienced our tours.
        </p>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View Reviews on Google
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    )
  }

  return (
    <>
      {/* Live overall-rating badge + View-all link (replaces the old hardcoded "4.7 average") */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 rounded-full bg-primary/10 px-3 py-1.5">
          <GoogleIcon className="h-4 w-4 shrink-0" />
          {rating !== null && <span className="text-sm font-bold text-primary">{rating.toFixed(1)}</span>}
          {rating !== null && <StarRow rating={rating} />}
          {total !== null && (
            <span className="text-xs font-medium text-primary">
              {total.toLocaleString()} Google review{total === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          View all on Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Live reviews — auto-advancing slider (matches the homepage) */}
      <ReviewSlider reviews={reviews} />
    </>
  )
}
