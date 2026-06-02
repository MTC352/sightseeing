"use client"

import { usePlannerList } from "@/lib/planner-list-context"
import Image from "next/image"
import Link from "next/link"
import { ShoppingBag, X, Trash2, Clock, Users, CalendarX } from "lucide-react"

interface TripCartProps {
  /** Number of people selected during the planner preferences (adults + children).
   *  Drives the per-trip person count and the line prices.
   *  Defaults to 1 when the cart is shown outside the planner. */
  persons?: number
  /** Per-trip disable info keyed by trip id. When a trip has an entry it is
   *  rendered greyed-out with an overlay message and excluded from the total —
   *  it lacks timeslot availability on the visitor's planned date. */
  disabledMap?: Record<string, { reason?: string }>
}

export function TripCart({ persons, disabledMap }: TripCartProps = {}) {
  const { items, removeItem, clearList, totalItems, persons: ctxPersons } = usePlannerList()

  // Person count comes from the preferences, not editable in the cart. Prefer an
  // explicit prop (live planner state) and fall back to the context's
  // preference-derived value when rendered outside the planner.
  const partySize = Math.max(1, Math.floor(persons ?? ctxPersons))

  const dis = disabledMap ?? {}
  const isDisabled = (id: string) => Object.prototype.hasOwnProperty.call(dis, id)

  // Only available (enabled) trips contribute to the estimated total.
  const totalPrice = items.reduce((sum, i) => (isDisabled(i.trip.id) ? sum : sum + i.trip.price * partySize), 0)

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <ShoppingBag className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">Your trip list is empty</p>
        <p className="mt-1 text-xs text-muted-foreground">Add experiences from the chat, browse below, or load your saved trips.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Item list header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">My Trip ({totalItems})</h3>
        <button
          type="button"
          onClick={clearList}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>

      {/* Items */}
      <div className="px-4 py-3">
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const disabled = isDisabled(item.trip.id)
            const reason = dis[item.trip.id]?.reason
            return (
              <div
                key={item.trip.id}
                className={`relative flex items-center gap-3 rounded-xl border p-2.5 shadow-sm transition-colors ${disabled ? "border-amber-300/60 bg-muted/40" : "border-border bg-card"}`}
                data-disabled={disabled ? "true" : "false"}
                data-testid={`planner-list-item-${item.trip.id}`}
              >
                <Link href={`/trip/${item.trip.id}`} className={`relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-xl ${disabled ? "opacity-50" : ""}`}>
                  <Image
                    src={item.trip.image || "/placeholder.svg"}
                    alt={item.trip.title}
                    fill
                    className="object-cover"
                    sizes="88px"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
                  <Link
                    href={`/trip/${item.trip.id}`}
                    className={`line-clamp-2 text-sm font-bold leading-tight transition-colors hover:text-primary ${disabled ? "text-muted-foreground" : "text-card-foreground"}`}
                  >
                    {item.trip.title}
                  </Link>
                  {disabled ? (
                    <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
                      <CalendarX className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-2">{reason || "No timeslots on your planned date"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {item.trip.duration}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${disabled ? "text-muted-foreground line-through" : "text-primary"}`}>
                      {item.trip.price.toFixed(2)}&nbsp;&euro;
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">/ per person</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        title="People selected in your preferences"
                      >
                        <Users className="h-3 w-3" />
                        {partySize}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.trip.id)}
                        aria-label={`Remove ${item.trip.title}`}
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="text-lg font-bold text-foreground">{totalPrice.toFixed(2)}&nbsp;&euro;</span>
        </div>
      </div>
    </div>
  )
}
