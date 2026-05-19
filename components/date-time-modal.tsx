"use client"

import { useState, useEffect, useRef } from "react"
import { X, ChevronLeft, ChevronRight, Clock } from "lucide-react"

/* ── Types ── */
export interface DateTimeValue {
  date: string      // ISO "YYYY-MM-DD"
  timeFrom: string  // "HH:MM" or ""
  timeTo: string    // "HH:MM" or ""
}

/* ── Time helpers ── */
const SLOT_MINUTES = 30
const TIME_SLOTS: string[] = (() => {
  const out: string[] = []
  for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`)
  }
  return out
})()
function toMinutes(t: string): number {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return -1
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
function formatLabel(t: string): string {
  if (!t) return "Any time"
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

/* ── Time Select dropdown ── */
function TimeSelect({
  value,
  onChange,
  label,
  minTime,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  minTime?: string   // exclusive lower bound (e.g. From's value for the To picker)
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  // Scroll selected slot into view when opening
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>("[data-selected='true']")
      ?? listRef.current.querySelector<HTMLElement>("[data-enabled='true']")
    el?.scrollIntoView({ block: "center" })
  }, [open])

  const minMin = minTime ? toMinutes(minTime) : -1

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={[
          "flex w-full items-center justify-between gap-2 rounded-2xl border-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none",
          open ? "border-primary" : "border-border hover:border-primary/40",
          value ? "text-foreground" : "text-muted-foreground",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value ? formatLabel(value) : (placeholder ?? "Any time")}</span>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border-2 border-border bg-background p-1 shadow-xl"
        >
          <button
            type="button"
            data-enabled="true"
            data-selected={value === ""}
            onClick={() => { onChange(""); setOpen(false) }}
            className={[
              "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors",
              value === "" ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary",
            ].join(" ")}
          >
            Any time
          </button>
          {TIME_SLOTS
            .filter(slot => minMin < 0 || toMinutes(slot) > minMin)
            .map(slot => {
              const selected = value === slot
              return (
                <button
                  key={slot}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-enabled="true"
                  data-selected={selected ? "true" : "false"}
                  onClick={() => { onChange(slot); setOpen(false) }}
                  className={[
                    "flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground hover:bg-secondary",
                  ].join(" ")}
                >
                  {formatLabel(slot)}
                </button>
              )
            })}
          {minMin >= 0 && TIME_SLOTS.every(s => toMinutes(s) <= minMin) && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No later slots available on the same day.
            </p>
          )}
        </div>
      )}
    </div>
  )
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

  // If "To" is now <= "From", clear it so the user re-picks a valid value.
  useEffect(() => {
    if (!timeFrom || !timeTo) return
    if (toMinutes(timeTo) <= toMinutes(timeFrom)) setTimeTo("")
  }, [timeFrom, timeTo])

  if (!open) return null

  const handleClear = () => {
    setDate("")
    setTimeFrom("")
    setTimeTo("")
  }

  const invalidRange = !!timeFrom && !!timeTo && toMinutes(timeTo) <= toMinutes(timeFrom)

  const handleApply = () => {
    if (invalidRange) return
    onApply({ date, timeFrom, timeTo })
    onClose()
  }

  const hasSelection = date !== "" || timeFrom !== "" || timeTo !== ""

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

          {/* FROM TIME / TO TIME selectors */}
          <div className="grid grid-cols-2 gap-3 px-5 pb-2">
            <TimeSelect
              label="From"
              value={timeFrom}
              onChange={setTimeFrom}
              placeholder="Any time"
            />
            <TimeSelect
              label="To"
              value={timeTo}
              onChange={setTimeTo}
              minTime={timeFrom || undefined}
              placeholder={timeFrom ? "After " + formatLabel(timeFrom) : "Any time"}
            />
          </div>
          <div className="px-5 pb-5 pt-1 min-h-[18px]">
            {invalidRange ? (
              <p className="text-xs font-medium text-destructive">
                &ldquo;To&rdquo; must be later than &ldquo;From&rdquo; on the same day.
              </p>
            ) : timeFrom && !timeTo ? (
              <p className="text-xs text-muted-foreground">
                Pick a &ldquo;To&rdquo; time later than {formatLabel(timeFrom)} — same-day only.
              </p>
            ) : null}
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
            disabled={invalidRange}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
