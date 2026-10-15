import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * "Trending" pill for trips with the admin Trending switch on (DB `featured`).
 * Sits alongside the admin's free-text badge in the card's top-left stack.
 * `size="md"` matches the homepage TripCard badge; `sm` the search/explore cards.
 */
export function TrendingBadge({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-orange-500 font-bold text-white shadow",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]",
        className,
      )}
    >
      <TrendingUp className={size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"} />
      Trending
    </span>
  )
}
