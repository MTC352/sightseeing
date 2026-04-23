"use client"

import { useState } from "react"

/* ── Types ── */
export interface Timeslot {
  time: string
  spotsLeft: number
  spotsTotal: number
}
export interface TripDepartures {
  today: Timeslot[]
  tomorrow: Timeslot[]
}

/* ── Deterministic dummy data generator ── */
export function getDummyDepartures(tripId: string): TripDepartures {
  const hash = tripId.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const times = ["09:00", "10:30", "11:00", "13:00", "14:30", "15:00", "16:30", "18:00", "19:30"]

  const pickSlots = (seed: number, count: number): Timeslot[] => {
    const slots: Timeslot[] = []
    for (let i = 0; i < count; i++) {
      const idx = (seed + i * 3) % times.length
      const total = 10 + ((seed + i) % 15)
      const booked = Math.floor(total * (0.2 + ((seed * (i + 1)) % 80) / 100))
      slots.push({ time: times[idx], spotsLeft: Math.max(0, total - booked), spotsTotal: total })
    }
    return slots.sort((a, b) => a.time.localeCompare(b.time))
  }

  return {
    today: pickSlots(hash, 1 + (hash % 4)),
    tomorrow: pickSlots(hash + 7, 1 + ((hash + 2) % 5)),
  }
}

/* ── Single chip ── */
export function TimeslotChip({
  slot,
  selected,
  onClick,
}: {
  slot: Timeslot
  selected?: boolean
  onClick?: (slot: Timeslot) => void
}) {
  const pct = slot.spotsLeft / slot.spotsTotal
  const colorClass = slot.spotsLeft === 0
    ? "border-red-200 bg-red-50 text-red-700"
    : pct <= 0.2
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700"
  const dotColor = slot.spotsLeft === 0
    ? "bg-red-500"
    : pct <= 0.2
    ? "bg-amber-500"
    : "bg-emerald-500"
  const selectedRing = selected ? "ring-2 ring-primary ring-offset-1" : ""

  return (
    <button
      type="button"
      onClick={() => onClick?.(slot)}
      disabled={slot.spotsLeft === 0}
      className={[
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
        colorClass,
        selectedRing,
        slot.spotsLeft === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-sm active:scale-95",
      ].join(" ")}
    >
      <span className="font-semibold">{slot.time}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span className="text-[11px]">
        {slot.spotsLeft === 0 ? "Sold out" : `${slot.spotsLeft} left`}
      </span>
    </button>
  )
}

/* ── Today / Tomorrow timeslot rows for a single trip ── */
export function ItineraryTimeslots({ tripId }: { tripId: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const departures = getDummyDepartures(tripId)

  const hasSlots = departures.today.length > 0 || departures.tomorrow.length > 0
  if (!hasSlots) return null

  const handleClick = (label: string, slot: Timeslot) => {
    const key = `${label}-${slot.time}`
    setSelected(prev => prev === key ? null : key)
  }

  return (
    <div className="mt-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Available Timeslots
      </p>
      <div className="flex flex-col gap-2">
        {departures.today.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-semibold text-foreground">Today</span>
            <div className="flex flex-wrap gap-1.5">
              {departures.today.map((slot, i) => (
                <TimeslotChip
                  key={i}
                  slot={slot}
                  selected={selected === `today-${slot.time}`}
                  onClick={() => handleClick("today", slot)}
                />
              ))}
            </div>
          </div>
        )}
        {departures.tomorrow.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-semibold text-foreground">Tomorrow</span>
            <div className="flex flex-wrap gap-1.5">
              {departures.tomorrow.map((slot, i) => (
                <TimeslotChip
                  key={i}
                  slot={slot}
                  selected={selected === `tomorrow-${slot.time}`}
                  onClick={() => handleClick("tomorrow", slot)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {selected && (
        <p className="mt-2 text-[10px] text-primary font-medium">
          Timeslot {selected.split("-").slice(1).join(":")} selected
        </p>
      )}
    </div>
  )
}
