"use client"

import { useState } from "react"

/* Avatar for a Google review author. Google's `lh3.googleusercontent.com`
 * profile photos can fail to hotlink (referrer throttling), so we:
 *   1. send no referrer (Google serves these reliably without one), and
 *   2. fall back to an initials circle on any load error — never a broken
 *      image icon. */
export function ReviewAvatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const initial = (name.trim().charAt(0) || "?").toUpperCase()

  if (!src || failed) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
        {initial}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      width={44}
      height={44}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-border"
    />
  )
}
