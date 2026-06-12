"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export type AnnouncementSize = "sm" | "md" | "lg"

export interface Announcement {
  enabled: boolean
  content: string
  size: AnnouncementSize
}

// Padding + font-size presets, fully managed from the admin panel.
export const ANNOUNCEMENT_SIZE_CLASSES: Record<AnnouncementSize, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-4 py-3.5 text-base",
}

// Presentational renderer shared by the public banner and the admin live
// preview so they always look identical. The accent background + forced white
// text are the fixed design — admins only control the message, links and size.
export function AnnouncementBannerContent({
  content,
  size,
}: {
  content: string
  size: AnnouncementSize
}) {
  return (
    <div
      className={cn(
        "w-full bg-primary text-center font-medium leading-snug text-white",
        ANNOUNCEMENT_SIZE_CLASSES[size],
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-5xl",
          // Force white on every descendant so editor colours never override the
          // banner design, and give links a clear, accessible affordance.
          "[&_*]:!text-white",
          "[&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-90",
          "[&_p]:m-0",
        )}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}

// Public banner. Hidden on /admin routes and whenever it is disabled or empty.
export function AnnouncementBanner({ announcement }: { announcement: Announcement | null }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith("/admin") ?? false

  if (isAdmin) return null
  if (!announcement?.enabled) return null
  if (!announcement.content?.trim()) return null

  return <AnnouncementBannerContent content={announcement.content} size={announcement.size} />
}
