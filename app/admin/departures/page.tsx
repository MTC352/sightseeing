"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Calendar, Clock, MapPin, Users, Search, Filter,
  ChevronDown, Plus, Pencil, Trash2, Check, X, ExternalLink
} from "lucide-react"
import type { Departure } from "@/lib/admin-store"

type StatusFilter = "all" | "scheduled" | "full" | "cancelled" | "completed"

const STATUS_STYLES: Record<Departure["status"], { label: string; bg: string; text: string }> = {
  scheduled: { label: "Scheduled",  bg: "bg-primary/10",      text: "text-primary" },
  full:       { label: "Full",       bg: "bg-amber-100",       text: "text-amber-700" },
  cancelled:  { label: "Cancelled",  bg: "bg-destructive/10",  text: "text-destructive" },
  completed:  { label: "Completed",  bg: "bg-muted",           text: "text-muted-foreground" },
}

function spotsColor(booked: number, total: number) {
  const pct = booked / total
  if (pct >= 1) return "text-destructive font-semibold"
  if (pct >= 0.8) return "text-amber-600 font-semibold"
  return "text-foreground"
}

function StatusBadge({ status }: { status: Departure["status"] }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

function dayLabel(iso: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(iso + "T00:00:00")
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff < 0) return null
  return null
}

export default function AdminDeparturesPage() {
  const [departures, setDepartures] = useState<Departure[]>([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [groupByDate, setGroupByDate] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/departures")
    if (res.ok) setDepartures(await res.json())
  }, [])

  useEffect(() => { load() }, [load])

  const categories = ["all", ...Array.from(new Set(departures.map((d) => d.category))).sort()]

  const filtered = departures.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!d.tripTitle.toLowerCase().includes(q) && !d.city.toLowerCase().includes(q) && !d.guideName.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Group by date
  const grouped: Record<string, Departure[]> = {}
  filtered.forEach((d) => {
    if (!grouped[d.date]) grouped[d.date] = []
    grouped[d.date].push(d)
  })
  const sortedDates = Object.keys(grouped).sort()

  // Summary stats
  const totalSpots = filtered.reduce((s, d) => s + d.spotsTotal, 0)
  const bookedSpots = filtered.reduce((s, d) => s + d.spotsBooked, 0)
  const todayCount = filtered.filter((d) => dayLabel(d.date) === "Today").length

  async function handleStatusChange(id: string, status: Departure["status"]) {
    await fetch("/api/admin/departures", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this departure?")) return
    await fetch(`/api/admin/departures?id=${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Operations</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Departures</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{filtered.length} departures scheduled</p>
        </div>
        <Link
          href="/admin/departures/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Departure
        </Link>
      </div>

      {/* Stats strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total departures", value: filtered.length, icon: Calendar },
          { label: "Departing today",  value: todayCount,      icon: Clock },
          { label: "Total spots",      value: totalSpots,      icon: Users },
          { label: "Spots booked",     value: `${bookedSpots} / ${totalSpots}`, icon: Check },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search trip, city, guide..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="appearance-none rounded-lg border border-border bg-background py-2 pl-8 pr-7 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="full">Full</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-7 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        <button
          type="button"
          onClick={() => setGroupByDate((v) => !v)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${groupByDate ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
        >
          Group by date
        </button>
      </div>

      {/* Departures list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No departures found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters</p>
        </div>
      ) : groupByDate ? (
        <div className="flex flex-col gap-6">
          {sortedDates.map((date) => {
            const label = dayLabel(date)
            return (
              <div key={date}>
                {/* Date header */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{fmtDate(date)}</span>
                    {label && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${label === "Today" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                        {label}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">{grouped[date].length} departure{grouped[date].length !== 1 ? "s" : ""}</span>
                </div>

                {/* Cards for this date */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {grouped[date].map((dep) => (
                        <DepartureRow key={dep.id} dep={dep} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Trip</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Date & Time</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Guide</th>
                <th className="hidden px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Spots</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((dep) => (
                <DepartureRow key={dep.id} dep={dep} onStatusChange={handleStatusChange} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DepartureRow({
  dep,
  onStatusChange,
  onDelete,
}: {
  dep: Departure
  onStatusChange: (id: string, s: Departure["status"]) => void
  onDelete: (id: string) => void
}) {
  const spotsLeft = dep.spotsTotal - dep.spotsBooked
  const label = dayLabel(dep.date)

  return (
    <tr className="group transition-colors hover:bg-secondary/40">
      {/* Trip info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="hidden h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dep.tripImage} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="max-w-[200px] truncate font-medium text-foreground">{dep.tripTitle}</p>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {dep.city}
              <span className="mx-1 text-border">·</span>
              <span className="text-[10px] font-medium text-primary/70">{dep.category}</span>
            </div>
          </div>
        </div>
      </td>

      {/* Date + time */}
      <td className="hidden px-4 py-3 sm:table-cell">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {dep.time}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {fmtDate(dep.date)}
              {label && (
                <span className={`ml-1 rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${label === "Today" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {label}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Guide */}
      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {dep.guideName.split(" ").map((n) => n[0]).join("")}
          </div>
          <span className="text-sm">{dep.guideName}</span>
        </div>
      </td>

      {/* Spots */}
      <td className="hidden px-4 py-3 lg:table-cell">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-sm ${spotsColor(dep.spotsBooked, dep.spotsTotal)}`}>
            {dep.spotsBooked} / {dep.spotsTotal}
          </span>
          {/* Progress bar */}
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${dep.spotsBooked >= dep.spotsTotal ? "bg-destructive" : dep.spotsBooked / dep.spotsTotal >= 0.8 ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (dep.spotsBooked / dep.spotsTotal) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{spotsLeft} left</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={dep.status} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            href={`/trip/${dep.tripId}`}
            target="_blank"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="View trip"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {dep.status === "scheduled" && (
            <button
              type="button"
              onClick={() => onStatusChange(dep.id, "cancelled")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Cancel departure"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {dep.status === "cancelled" && (
            <button
              type="button"
              onClick={() => onStatusChange(dep.id, "scheduled")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              title="Restore departure"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(dep.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}
