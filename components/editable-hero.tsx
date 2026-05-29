"use client"

import Image from "next/image"
import { EditableImage } from "@/components/editable-image"

interface EditableHeroProps {
  id: string
  defaultSrc: string
  alt: string
  /** Class forwarded to the EditableImage wrapper — defaults to "absolute inset-0" */
  className?: string
  imageClassName?: string
  sizes?: string
  priority?: boolean
}

/**
 * Drop-in replacement for a `<Image fill>` inside a positioned parent.
 * In non-edit mode it renders just the Image (transparent).
 * In edit mode it shows a "Change image" amber button overlay.
 * Safe to import from server components — all hooks live inside EditableImage.
 */
export function EditableHero({
  id,
  defaultSrc,
  alt,
  className = "absolute inset-0",
  imageClassName = "object-cover",
  sizes = "100vw",
  priority,
}: EditableHeroProps) {
  return (
    <EditableImage id={id} defaultValue={defaultSrc} className={className} label="Change image">
      {(src) => (
        <Image
          src={src}
          alt={alt}
          fill
          className={imageClassName}
          sizes={sizes}
          priority={priority}
        />
      )}
    </EditableImage>
  )
}
