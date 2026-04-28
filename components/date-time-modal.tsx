"use client"

import { useState, useEffect } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

/* ── Types ── */
export interface DateTimeValue {
  date: string      // ISO "YYYY-MM-DD"
  timeFrom: string  // "HH:MM" or ""
  timeTo: string    // "HH:MM" or ""
}

/* ── Mini Calendar ── */
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function MiniCalendar({
  selectedFrom,
  selectedTo,
  pickingField,
  onSelect,
}: {
  selectedFrom: string
  selectedTo: string
  pickingField: "from" | "to"
  onSelect: (d: string) => void
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const fromDate = selectedFrom ? new Date(selectedFrom + "T00:00:00") : null
  const toDate = selectedTo ? new Date(selectedTo + "T00:00:00") : null

  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const next = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const cellDate = (d: number) => new Date(viewYear, viewMonth, d)
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)

  const isPast = (d: number) => cellDate(d) < todayMidnight
  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const isFrom = (d: number) =>
    fromDate !== null &&
    d === fromDate.getDate() && viewMonth === fromDate.getMonth() && viewYear === fromDate.getFullYear()
  const isTo = (d: number) =>
    toDate !== null &&
    d === toDate.getDate() && viewMonth === toDate.getMonth() && viewYear === toDate.getFullYear()
  const isInRange = (d: number) => {
    if (!fromDate || !toDate) return false
    const cd = cellDate(d)
    return cd > fromDate && cd < toDate
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const select = (d: number) => {
    if (isPast(d)) return
    onSelect(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`)
  }

  return (
    <div className="select-none">
      <div className="flex items-center justify-between px-1 pb-4">
        <button
          type="button"
          onClick={prev}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-foreground">{MONTHS[viewMonth]} {viewYear}</span>
        <button
          type="button"
          onClick={next}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground/60 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const past = isPast(d)
          const from = isFrom(d)
          const to = isTo(d)
          const range = isInRange(d)
          const tod = isToday(d)
          const selected = from || to

          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => select(d)}
              className={[
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-all",
                past
                  ? "cursor-not-allowed text-muted-foreground/25"
                  : "cursor-pointer",
                selected
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : range
                  ? "bg-primary/10 text-primary rounded-none"
                  : tod
                  ? "border-2 border-primary/60 text-primary font-semibold hover:bg-primary/10"
                  : !past
                  ? "text-foreground hover:bg-secondary"
                  : "",
              ].join(" ")}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}



/* ── Main Modal ── */
export function DateTimeModal({
  open,
  onClose,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
  value: DateTimeValue
  onApply: (v: DateTimeValue) => void
}) {
  const [date, setDate] = useState(value.date)
  const [timeFrom, setTimeFrom] = useState(value.timeFrom)
  const [timeTo, setTimeTo] = useState(value.timeTo)

  // Sync incoming value when modal opens
  useEffect(() => {
    if (open) {
      setDate(value.date)
      setTimeFrom(value.timeFrom)
      setTimeTo(value.timeTo)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const handleClear = () => {
    setDate("")
    setTimeFrom("")
    setTimeTo("")
  }

  const handleApply = () => {
    onApply({ date, timeFrom, timeTo })
    onClose()
  }

  const hasSelection = date !== ""

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold text-foreground">Select date &amp; time</h2>
          <div className="flex items-center gap-3">
            {hasSelection && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 transition-colors hover:bg-secondary"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto">
          {/* Departure Time label */}
          <div className="px-5 pt-5 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Departure Time</p>
          </div>

          {/* FROM TIME / TO TIME text inputs */}
          <div className="grid grid-cols-2 gap-3 px-5 pb-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                From
              </label>
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors focus:border-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                To
              </label>
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="w-full rounded-2xl border-2 border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors focus:border-primary focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          {/* FROM / TO date selectors — REMOVED, using single date picker */}

          {/* Calendar */}
          <div className="px-5 pb-6 pt-3">
            <MiniCalendar
              selectedFrom={date}
              selectedTo=""
              pickingField="from"
              onSelect={setDate}
            />
          </div>


        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Apply dates
          </button>
        </div>
      </div>
    </div>
  )
}
