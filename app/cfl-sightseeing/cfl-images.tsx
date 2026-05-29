"use client"

import Image from "next/image"
import { EditableImage } from "@/components/editable-image"

export function CflLogoImage() {
  return (
    <EditableImage
      id="cfl:logo:image"
      defaultValue="/cfl-sightseeing/cfl-logo.jpg"
      label="Change logo"
    >
      {(src) => (
        <Image
          src={src}
          alt="CFL logo"
          width={56}
          height={56}
          className="h-full w-full object-cover"
          priority
        />
      )}
    </EditableImage>
  )
}

export function CflHeroImage() {
  return (
    <EditableImage
      id="cfl:hero:image"
      defaultValue="/cfl-sightseeing/hero.jpg"
      className="absolute inset-0"
      label="Change image"
    >
      {(src) => (
        <Image
          src={src}
          alt="Luxembourg City corniche and Grund — sightseeing.lu"
          fill
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover"
        />
      )}
    </EditableImage>
  )
}
