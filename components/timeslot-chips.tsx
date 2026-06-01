"use client"

import { useEffect, useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
import type { PlannerTimeslot, PlannerTimeslotsResponse } from "@/app/api/planner/timeslots/route"

/* ── Types ── */
export type Timeslot = PlannerTimeslot
export interface TripDepartures {
  today: Timeslot[]
  tomorrow: Timeslot[]
}

/* ── Helpers ── */
/** Parse "HH:MM" to minutes-since-midnight; null if invalid. */
function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(mm)) return null
  return h * 60 + mm
}

/**
 * Pick the recommended slot index from a list, given a desired "suggested" time.
 * Strategy: prefer the earliest slot whose start time is >= suggested time AND
 * still has spots; if none, fall back to the closest-by-absolute-distance slot
 * with spots; if all are sold out, the closest by time.
 */
function pickRecommendedIndex(slots: Timeslot[], suggested: string | undefined): number {
  if (!slots.length) return -1
  const target = suggested ? timeToMinutes(suggested) : null
  if (target == null) {
    // No target — first bookable slot, else first
    const firstOpen = slots.findIndex((s) => s.spotsLeft === null || s.spotsLeft > 0)
    return firstOpen >= 0 ? firstOpen : 0
  }
  const bookable = slots
    .map((s, i) => ({ s, i, t: timeToMinutes(s.time) }))
    .filter((x) => x.t != null) as Array<{ s: Timeslot; i: number; t: number }>

  const open = bookable.filter((x) => x.s.spotsLeft === null || x.s.spotsLeft > 0)
  const onOrAfter = open.filter((x) => x.t >= target).sort((a, b) => a.t - b.t)
  if (onOrAfter.length) return onOrAfter[0].i

  const closestOpen = open
    .slice()
    .sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))
  if (closestOpen.length) return closestOpen[0].i

  const closestAny = bookable
    .slice()
    .sort((a, b) => Math.abs(a.t - target) - Math.abs(b.t - target))
  return closestAny.length ? closestAny[0].i : 0
}

/* ── Single chip ── */
export function TimeslotChip({
  slot,
  selected,
  recommended,
  onClick,
}: {
  slot: Timeslot
  selected?: boolean
  recommended?: boolean
  onClick?: (slot: Timeslot) => void
}) {
  const unlimited = slot.spotsLeft === null
  const pct = unlimited ? 1 : (slot.spotsTotal && slot.spotsTotal > 0 ? slot.spotsLeft! / slot.spotsTotal : 1)
  const soldOut = !unlimited && slot.spotsLeft === 0
  const lowStock = !unlimited && !soldOut && (slot.spotsLeft! <= 3 || pct <= 0.2)

  const colorClass = soldOut
    ? "border-red-200 bg-red-50 text-red-700"
    : lowStock
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700"
  const dotColor = soldOut
    ? "bg-red-500"
    : lowStock
    ? "bg-amber-500"
    : "bg-emerald-500"
  const selectedRing = selected ? "ring-2 ring-primary ring-offset-1" : ""
  const recommendedRing =
    recommended && !selected
      ? "ring-2 ring-primary/70 ring-offset-1 shadow-sm"
      : ""

  return (
    <button
      type="button"
      onClick={() => onClick?.(slot)}
      disabled={soldOut}
      className={[
        "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        colorClass,
        selectedRing,
        recommendedRing,
        soldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-sm active:scale-95",
      ].join(" ")}
    >
      {recommended && !soldOut && (
        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-2 w-2" />
        </span>
      )}
      <span className="font-semibold">{slot.time}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-[11px]">
        {soldOut
          ? "Sold out"
          : unlimited
          ? "Open"
          : `${slot.spotsLeft} left`}
      </span>
    </button>
  )
}

/* ── Today / Tomorrow timeslot rows for a single trip — REAL-TIME ── */
export function ItineraryTimeslots({
  tripId,
  suggestedTime,
  onSnap,
}: {
  tripId: string
  /** AI-suggested time ("HH:MM"). Used to highlight the recommended slot. */
  suggestedTime?: string
  /** Called when the recommended slot is resolved — lets the parent
   *  replace the "Suggested" label with the actual recommended slot time. */
  onSnap?: (snapped: { time: string; day: "today" | "tomorrow" }) => void
}) {
  const [data, setData] = useState<PlannerTimeslotsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/planner/timeslots?tripId=${encodeURIComponent(tripId)}`,
          { cache: "no-store" },
        )
        const json = (await res.json()) as PlannerTimeslotsResponse
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            tripId,
            palisisId: null,
            today: [],
            tomorrow: [],
            todayGroups: [],
            tomorrowGroups: [],
            error: "FETCH_FAILED",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tripId])

  const todaySlots    = data?.today    ?? []
  const tomorrowSlots = data?.tomorrow ?? []
  const todayGroups   = data?.todayGroups    ?? []
  const tomorrowGroups = data?.tomorrowGroups ?? []
  const hasSlots = todaySlots.length > 0 || tomorrowSlots.length > 0

  // Multi-category: either day has >1 group with a name
  const multiCat = todayGroups.length > 1 || tomorrowGroups.length > 1

  // Recommended slot: prefer today, else tomorrow (always uses flat arrays)
  const recommended = useMemo(() => {
    if (todaySlots.length) {
      const idx = pickRecommendedIndex(todaySlots, suggestedTime)
      if (idx >= 0) return { day: "today" as const, index: idx, slot: todaySlots[idx] }
    }
    if (tomorrowSlots.length) {
      const idx = pickRecommendedIndex(tomorrowSlots, suggestedTime)
      if (idx >= 0) return { day: "tomorrow" as const, index: idx, slot: tomorrowSlots[idx] }
    }
    return null
  }, [todaySlots, tomorrowSlots, suggestedTime])

  // Notify parent whenever the recommended slot resolves/changes
  useEffect(() => {
    if (recommended && onSnap) {
      onSnap({ time: recommended.slot.time, day: recommended.day })
    }
    // Intentionally exclude `onSnap` from deps — parents pass inline callbacks;
    // re-running on identity changes would be redundant since the snap value is
    // already stabilized by the parent's setState equality guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended])

  if (loading) {
    return (
      <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-[11px] text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading real-time availability...
      </div>
    )
  }

  if (!data?.ok || !hasSlots) {
    const reason = data?.error === "NO_PALISIS_LINK"
      ? "No live availability for this experience yet."
      : data?.error === "TOURCMS_NOT_CONFIGURED"
      ? "Live availability unavailable."
      : data?.error === "TOURCMS_ERROR"
      ? "Could not load real-time slots."
      : "No timeslots available right now."
    return (
      <div className="mt-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-[11px] text-muted-foreground">
        {reason}
      </div>
    )
  }

  const handleClick = (label: "today" | "tomorrow", slot: Timeslot) => {
    const key = `${label}-${slot.time}`
    setSelected((prev) => (prev === key ? null : key))
  }

  /** Render chips for one day, using grouped view when multiple categories exist */
  function renderDaySlots(
    day: "today" | "tomorrow",
    groups: typeof todayGroups,
    flatSlots: Timeslot[],
  ) {
    if (!flatSlots.length) return null

    let flatIndex = 0 // tracks position in flat array for recommended highlighting

    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-foreground">
          {day === "today" ? "Today" : "Tomorrow"}
        </span>

        {multiCat ? (
          /* Grouped: category name + chips below it */
          <div className="flex flex-col gap-2.5 mt-0.5">
            {groups.map((group, gi) => {
              const groupStart = flatIndex
              flatIndex += group.slots.length
              return (
                <div key={gi}>
                  {group.name && (
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground leading-tight">
                      {group.name}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {group.slots.map((slot, si) => {
                      const absIdx = groupStart + si
                      return (
                        <TimeslotChip
                          key={`${day}-g${gi}-${si}`}
                          slot={slot}
                          selected={selected === `${day}-${slot.time}-${gi}`}
                          recommended={recommended?.day === day && recommended.index === absIdx}
                          onClick={() => {
                            const key = `${day}-${slot.time}-${gi}`
                            setSelected((prev) => (prev === key ? null : key))
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Single category: flat chip row (original layout) */
          <div className="flex flex-wrap gap-1.5">
            {flatSlots.map((slot, i) => (
              <TimeslotChip
                key={`${day}-${i}-${slot.time}`}
                slot={slot}
                selected={selected === `${day}-${slot.time}`}
                recommended={recommended?.day === day && recommended.index === i}
                onClick={() => handleClick(day, slot)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Available Timeslots
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {renderDaySlots("today",    todayGroups,    todaySlots)}
        {renderDaySlots("tomorrow", tomorrowGroups, tomorrowSlots)}
      </div>
      {recommended && (
        <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary">
          <Sparkles className="h-2.5 w-2.5" />
          Recommended: {recommended.day === "today" ? "Today" : "Tomorrow"} at{" "}
          {recommended.slot.time}
        </p>
      )}
      {selected && (
        <p className="mt-1 text-[10px] font-medium text-primary">
          Selected {selected.replace(/-\d+$/, "").replace("-", " ")}
        </p>
      )}
    </div>
  )
}
