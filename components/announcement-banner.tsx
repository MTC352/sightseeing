"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export type AnnouncementSize = "sm" | "md" | "lg"
export type AnnouncementAlign = "left" | "center" | "right"

export interface Announcement {
  enabled: boolean
  content: string
  size: AnnouncementSize
  align: AnnouncementAlign
  bgColor: string
  textColor: string
}

// Padding + font-size presets, fully managed from the admin panel.
export const ANNOUNCEMENT_SIZE_CLASSES: Record<AnnouncementSize, string> = {
  sm: "px-4 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-4 py-3.5 text-base",
}

const ALIGN_CLASSES: Record<AnnouncementAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

// Tailwind's preflight reset strips the browser defaults from <strong>, <em>,
// headings, lists, etc., so the rich-text formatting would otherwise render as
// plain text inside the banner. These arbitrary variants restore the expected
// look for every tag the editor can emit, so the banner is true WYSIWYG.
const RICH_TEXT_CLASSES = cn(
  "[&_p]:m-0",
  "[&_strong]:font-bold [&_b]:font-bold",
  "[&_em]:italic [&_i]:italic",
  "[&_u]:underline [&_s]:line-through",
  "[&_h2]:my-0 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight",
  "[&_h3]:my-0 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:leading-tight",
  "[&_h4]:my-0 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:leading-tight",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-current [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_mark]:rounded [&_mark]:px-0.5",
  "[&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-90",
)

// Presentational renderer shared by the public banner and the admin live
// preview so they always look identical (true WYSIWYG). Admins control the
// message, links, size, alignment, banner colour and default text colour;
// inline colours set in the editor override the default text colour.
export function AnnouncementBannerContent({
  content,
  size,
  align = "center",
  bgColor = "",
  textColor = "",
}: {
  content: string
  size: AnnouncementSize
  align?: AnnouncementAlign
  bgColor?: string
  textColor?: string
}) {
  return (
    <div
      className={cn(
        "w-full font-medium leading-snug",
        // Theme defaults only when the admin hasn't picked a custom colour.
        !bgColor && "bg-primary",
        !textColor && "text-white",
        ALIGN_CLASSES[align],
        ANNOUNCEMENT_SIZE_CLASSES[size],
      )}
      style={{
        ...(bgColor ? { backgroundColor: bgColor } : {}),
        ...(textColor ? { color: textColor } : {}),
      }}
    >
      <div
        className={cn("mx-auto max-w-5xl", RICH_TEXT_CLASSES)}
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

  return (
    <AnnouncementBannerContent
      content={announcement.content}
      size={announcement.size}
      align={announcement.align}
      bgColor={announcement.bgColor}
      textColor={announcement.textColor}
    />
  )
}
