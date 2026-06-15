"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface HeroSlideshowProps {
  /** One or more background image URLs. */
  images: string[]
  /** Seconds between automatic slides (only used when there are 2+ images). */
  intervalSeconds: number
}

/**
 * HeroSlideshow
 * -------------
 * Renders the hero background. With a single image it shows a static <img>.
 * With two or more images it cross-fades between them on a timer, advancing
 * every `intervalSeconds`. Rendered for every visitor (the public site reads
 * the saved images from page_content via the edit-mode context).
 */
export function HeroSlideshow({ images, intervalSeconds }: HeroSlideshowProps) {
  const slides = images.length > 0 ? images : []
  const isSlideshow = slides.length > 1
  const [index, setIndex] = useState(0)

  // Keep the active index in range if the image list shrinks.
  useEffect(() => {
    setIndex((i) => (i >= slides.length ? 0 : i))
  }, [slides.length])

  // Auto-advance only when there is more than one image.
  useEffect(() => {
    if (!isSlideshow) return
    const ms = Math.max(2, intervalSeconds) * 1000
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, ms)
    return () => clearInterval(timer)
  }, [isSlideshow, intervalSeconds, slides.length])

  if (slides.length === 0) return null

  if (!isSlideshow) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={slides[0]}
        alt="Luxembourg City panoramic view"
        className="absolute inset-0 h-full w-full object-cover"
        fetchPriority="high"
      />
    )
  }

  return (
    <>
      {slides.map((src, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${i}-${src}`}
          src={src}
          alt={i === 0 ? "Luxembourg City panoramic view" : ""}
          aria-hidden={i !== index}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out",
            i === index ? "opacity-100" : "opacity-0",
          )}
          fetchPriority={i === 0 ? "high" : "low"}
        />
      ))}
    </>
  )
}
