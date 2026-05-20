"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import type { PlannerMessage } from "@/app/api/planner/route"
import { Navbar } from "@/components/site-navbar"
import { TripCart } from "@/components/planner/trip-cart"
import { SightseeingMap } from "@/components/chatgpt-widgets/sightseeing-map"
import { SightseeingAlbum } from "@/components/chatgpt-widgets/sightseeing-album"
import { TravelOffers } from "@/components/travel-offers"
import { MobiliteitPlanner } from "@/components/mobiliteit-planner"
import { SidebarItinerary, ItineraryPanel, type Itinerary } from "@/components/sidebar-itinerary"
import { useCart } from "@/lib/cart-context"
import { weatherData, type Trip } from "@/lib/data"

// Fail-closed: NEVER bootstrap the AI planner with static seed data — it
// would expose archived/draft trips that have been removed from the DB.
// The planner starts empty and is populated by /api/planner/trips (publicOnly).
const staticTripsFallback: Trip[] = []
import Image from "next/image"
import {
  Send, Bot, User, PanelLeftClose, PanelLeftOpen, ShoppingBag,
  MapPin, Compass, Utensils, Bike, Landmark, Star, X, Sparkles,
  CloudSun, CloudRain, Sun, Thermometer, Droplets, Wind,
  Users, Heart, Baby, UserRound, Minus, Plus,
  Clock, DollarSign, ChevronRight, ChevronDown, ChevronUp, RotateCcw, Check, Ticket, Copy, Calendar,
  CloudLightning, Umbrella, Camera, Share2, UserPlus, Route, ThumbsUp, ThumbsDown,
} from "lucide-react"

/* ─── Cookie helpers ─── */
const PREFS_COOKIE = "sightseeing_prefs"
const MAX_AGE = 60 * 60 * 24 * 7
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${MAX_AGE};SameSite=Lax`
}
function getCookie(name: string): string | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null
  } catch { return null }
}

/* ─── Preferences ─── */
interface Preferences {
  group: string
  interests: string[]
  duration: string
  budget: string
  /** YYYY-MM-DD — the day the user plans to visit (used for timeslots & deals). */
  startDate: string
  /** Number of adults in the party (≥1). Always set; for solo this is 1, couple 2. */
  adults: number
  /** Number of children in the party (≥0). Only meaningful for family/friends. */
  children: number
  /** Number of days when duration === "multi-day" (1..maxMultiDayDays, admin-managed). */
  dayCount: number
}
const EMPTY_PREFS: Preferences = { group: "", interests: [], duration: "", budget: "", startDate: "", adults: 1, children: 0, dayCount: 1 }
/** Returns sensible defaults for adults/children when the user picks a group. */
function defaultPartyFor(group: string): { adults: number; children: number } {
  if (group === "solo") return { adults: 1, children: 0 }
  if (group === "couple") return { adults: 2, children: 0 }
  if (group === "family") return { adults: 2, children: 1 }
  if (group === "friends") return { adults: 3, children: 0 }
  return { adults: 1, children: 0 }
}

/* ─── Date helpers ─── */
function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
function todayYMD(): string { return ymdLocal(new Date()) }
function tomorrowYMD(): string {
  const d = new Date(); d.setDate(d.getDate() + 1); return ymdLocal(d)
}
/** Next Saturday (or today if today is Saturday). */
function nextWeekendYMD(): string {
  const d = new Date()
  const dow = d.getDay() // 0 Sun .. 6 Sat
  const add = dow === 6 ? 0 : (6 - dow + 7) % 7
  d.setDate(d.getDate() + add)
  return ymdLocal(d)
}
function formatYMDPretty(ymd: string): string {
  if (!ymd) return ""
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  const dt = new Date(y, m - 1, d)
  const t = todayYMD(); const tm = tomorrowYMD()
  if (ymd === t) return "Today"
  if (ymd === tm) return "Tomorrow"
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

const GROUP_OPTIONS = [
  { value: "solo", label: "Solo", icon: UserRound },
  { value: "couple", label: "Couple", icon: Heart },
  { value: "family", label: "Family with kids", icon: Baby },
  { value: "friends", label: "Friends group", icon: Users },
]
const INTEREST_OPTIONS = [
  { value: "food", label: "Food & Drinks", icon: Utensils },
  { value: "culture", label: "History & Culture", icon: Landmark },
  { value: "outdoor", label: "Outdoor & Nature", icon: Compass },
  { value: "night", label: "Nightlife", icon: Star },
  { value: "sport", label: "Active & Sports", icon: Bike },
  { value: "indoor", label: "Hidden Gems", icon: MapPin },
]
const DURATION_OPTIONS = [
  { value: "1-2h", label: "1-2 hours" },
  { value: "half-day", label: "Half day" },
  { value: "full-day", label: "Full day" },
  { value: "multi-day", label: "Multi-day trip" },
]
const BUDGET_OPTIONS = [
  { value: "casual", label: "Keep it casual" },
  { value: "mid-range", label: "Mid-range" },
  { value: "premium", label: "Treat ourselves" },
]

/* ─── Weather ─── */
type WxCond = "sunny" | "cloudy" | "rainy"
function deriveWx(): WxCond {
  const c = weatherData.current.condition.toLowerCase()
  if (c.includes("rain") || c.includes("drizzle") || c.includes("storm")) return "rainy"
  if (c.includes("sun") || c.includes("clear")) return "sunny"
  return "cloudy"
}
function WxIcon({ condition, className }: { condition: WxCond; className?: string }) {
  if (condition === "rainy") return <CloudRain className={className} />
  if (condition === "sunny") return <Sun className={className} />
  return <CloudSun className={className} />
}
function wxColor(c: WxCond) {
  if (c === "rainy") return "text-blue-500"
  if (c === "sunny") return "text-amber-500"
  return "text-sky-500"
}

/* ────────────────────────────────────── */
/* PARTY STEPPER (Adults / Children)       */
/* ────────────────────────────────────── */
function PartyStepper({
  label, sub, icon, value, min, onDec, onInc,
}: {
  label: string; sub: string; icon: React.ReactNode;
  value: number; min: number;
  onDec: () => void; onInc: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">{sub}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={onDec}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center text-base font-bold tabular-nums text-foreground">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={onInc}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ────────────────────────────────────── */
/* ONBOARDING                              */
/* ────────────────────────────────────── */
function Onboarding({ onComplete, maxMultiDayDays }: { onComplete: (prefs: Preferences) => void; maxMultiDayDays: number }) {
  const [step, setStep] = useState(0)
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS)
  // Sub-step inside step 2: when "Multi-day trip" is picked we ask for
  // the number of days (1..maxMultiDayDays, admin-managed) before
  // advancing to budget.
  const [askDays, setAskDays] = useState(false)
  // Sub-step inside step 0: when Family/Friends is picked we ask for an
  // Adults + Children count before advancing to interests. Solo/Couple
  // skip this entirely (party-size is implied).
  const [askParty, setAskParty] = useState(false)

  function selectGroup(value: string) {
    const party = defaultPartyFor(value)
    setPrefs((p) => ({ ...p, group: value, adults: party.adults, children: party.children }))
    if (value === "family" || value === "friends") {
      setAskParty(true)
    } else {
      setAskParty(false)
      setTimeout(() => setStep(1), 200)
    }
  }
  function bumpAdults(delta: number) {
    setPrefs((p) => ({ ...p, adults: Math.max(1, Math.min(20, p.adults + delta)) }))
  }
  function bumpChildren(delta: number) {
    setPrefs((p) => ({ ...p, children: Math.max(0, Math.min(20, p.children + delta)) }))
  }
  function confirmParty() {
    setAskParty(false)
    setStep(1)
  }
  function toggleInterest(value: string) {
    setPrefs((p) => {
      const has = p.interests.includes(value)
      return { ...p, interests: has ? p.interests.filter((v) => v !== value) : p.interests.length < 3 ? [...p.interests, value] : p.interests }
    })
  }
  function selectDuration(value: string) {
    setPrefs((p) => ({ ...p, duration: value, dayCount: value === "multi-day" ? Math.max(2, p.dayCount || 2) : 1 }))
    if (value === "multi-day") {
      setAskDays(true)
    } else {
      setAskDays(false)
      setTimeout(() => setStep(3), 200)
    }
  }
  function bumpDays(delta: number) {
    setPrefs((p) => ({ ...p, dayCount: Math.max(2, Math.min(maxMultiDayDays, (p.dayCount || 2) + delta)) }))
  }
  function confirmDays() {
    setAskDays(false)
    setStep(3)
  }
  function selectBudget(value: string) {
    const updated = { ...prefs, budget: value }
    setPrefs(updated)
    setTimeout(() => setStep(4), 200)
  }
  function selectStartDate(value: string) {
    const updated = { ...prefs, startDate: value }
    setPrefs(updated)
    setTimeout(() => onComplete(updated), 300)
  }

  const questions = [
    "Hey there! Let me help plan your perfect day in Luxembourg. First -- who's joining today?",
    "Great choice! Now, what sounds good to you? Pick up to 3 interests.",
    "How much time do you have for exploring?",
    "What's your vibe for the day?",
    "When are you visiting? I'll match real timeslots and any current deals to your date.",
  ]
  const partyQuestion = prefs.group === "family"
    ? "Got it — how many adults and kids are coming?"
    : "Awesome — how many of you are in the group?"

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-1 px-4 pt-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      <div className="flex flex-1 flex-col px-4 py-5">
        <div className="mb-5 flex gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-secondary px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
            {step === 0 && askParty ? partyQuestion : questions[step]}
          </div>
        </div>
        {step === 0 && !askParty && (
          <div className="grid grid-cols-2 gap-2">
            {GROUP_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => selectGroup(opt.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-sm font-medium transition-all ${prefs.group === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                <opt.icon className="h-6 w-6" /><span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
        {step === 0 && askParty && (
          <div className="flex flex-col gap-3">
            <PartyStepper
              label="Adults"
              sub="Ages 13+"
              icon={<UserRound className="h-5 w-5" />}
              value={prefs.adults}
              min={1}
              onDec={() => bumpAdults(-1)}
              onInc={() => bumpAdults(+1)}
            />
            <PartyStepper
              label="Children"
              sub="Ages 0-12"
              icon={<Baby className="h-5 w-5" />}
              value={prefs.children}
              min={0}
              onDec={() => bumpChildren(-1)}
              onInc={() => bumpChildren(+1)}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => { setAskParty(false); setPrefs((p) => ({ ...p, group: "" })) }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground">
                ← Back
              </button>
              <button type="button" onClick={confirmParty}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {INTEREST_OPTIONS.map((opt) => {
                const selected = prefs.interests.includes(opt.value)
                return (
                  <button key={opt.value} type="button" onClick={() => toggleInterest(opt.value)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all ${selected ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                    <opt.icon className="h-4 w-4 shrink-0" /><span className="text-left text-xs">{opt.label}</span>
                    {selected && <Check className="ml-auto h-3.5 w-3.5" />}
                  </button>
                )
              })}
            </div>
            <p className="text-center text-[10px] text-muted-foreground">{prefs.interests.length}/3 selected</p>
            <button type="button" disabled={prefs.interests.length === 0} onClick={() => setStep(2)}
              className="mx-auto flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {step === 2 && !askDays && (
          <div className="flex flex-col gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => selectDuration(opt.value)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all ${prefs.duration === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                <Clock className="h-5 w-5 shrink-0" /><span>{opt.label}</span>
                {opt.value === "multi-day" && (
                  <span className="ml-auto text-[10px] text-muted-foreground">up to {maxMultiDayDays} days</span>
                )}
              </button>
            ))}
          </div>
        )}
        {step === 2 && askDays && (
          <div className="flex flex-col gap-3">
            <PartyStepper
              label="Number of days"
              sub={`2 to ${maxMultiDayDays} days`}
              icon={<Calendar className="h-5 w-5" />}
              value={prefs.dayCount || 2}
              min={2}
              onDec={() => bumpDays(-1)}
              onInc={() => bumpDays(+1)}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <button type="button" onClick={() => { setAskDays(false); setPrefs((p) => ({ ...p, duration: "", dayCount: 1 })) }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground">
                ← Back
              </button>
              <button type="button" onClick={confirmDays}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="flex flex-col gap-2">
            {BUDGET_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => selectBudget(opt.value)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all ${prefs.budget === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                <DollarSign className="h-5 w-5 shrink-0" /><span>{opt.label}</span>
              </button>
            ))}
            <button type="button" onClick={() => selectBudget("any")}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground">
              Skip — show all trips
            </button>
          </div>
        )}
        {step === 4 && (
          <div className="flex flex-col gap-2">
            {[
              { value: todayYMD(),       label: "Today" },
              { value: tomorrowYMD(),    label: "Tomorrow" },
              { value: nextWeekendYMD(), label: "This weekend" },
            ].map((opt) => (
              <button key={opt.value} type="button" onClick={() => selectStartDate(opt.value)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all ${prefs.startDate === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                <Calendar className="h-5 w-5 shrink-0" />
                <span>{opt.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatYMDPretty(opt.value)}</span>
              </button>
            ))}
            <div className="mt-1 flex flex-col gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3">
              <label htmlFor="planner-start-date" className="text-xs font-medium text-muted-foreground">
                Or pick a specific date
              </label>
              <input
                id="planner-start-date"
                type="date"
                min={todayYMD()}
                value={prefs.startDate}
                onChange={(e) => setPrefs((p) => ({ ...p, startDate: e.target.value }))}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                disabled={!prefs.startDate || prefs.startDate < todayYMD()}
                onClick={() => selectStartDate(prefs.startDate)}
                className="mx-auto mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                Start planning <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────── */
/* TRIP GRID CARD                          */
/* ────────────────────────────────────── */
function TripCard({ trip, onSelect }: { trip: Trip; onSelect: (trip: Trip) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(trip)}
      className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md"
    >
      {/* Thumbnail */}
      <div className="relative w-36 shrink-0 overflow-hidden sm:w-44">
        <Image src={trip.image} alt={trip.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="180px" />
        {trip.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">{trip.badge}</span>
        )}
      </div>
      {/* Content */}
      <div className="flex flex-1 flex-col justify-between gap-2 p-3.5">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">{trip.category}</span>
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{trip.title}</p>
          {trip.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{trip.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{trip.rating}</span>
            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
            {trip.city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{trip.city}</span>}
          </div>
          <div className="flex items-baseline gap-1.5">
            {trip.originalPrice && <span className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(0)}&euro;</span>}
            <span className="text-base font-bold text-foreground">{trip.price > 0 ? `${trip.price.toFixed(0)}\u20AC` : "Free"}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

/* ────────────────────────────────────── */
/*  MAIN PAGE                              */
/* ────────────────────────────────────── */
export default function PlannerPage() {
  const wx = useMemo(deriveWx, [])
  const { temp, humidity, wind, condition } = weatherData.current
  const { addItem, totalItems, items, hydrated: cartHydrated } = useCart()

  /* State */
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [hydrated, setHydrated] = useState(false)
  // Max number of days the user can pick for a Multi-day trip. Admin-managed
  // in /admin/ai-systems/itinerary (default 2). Loaded once on mount from
  // the public /api/planner/form-config endpoint so admin changes flow
  // through without a deploy.
  const [maxMultiDayDays, setMaxMultiDayDays] = useState(2)
  useEffect(() => {
    let cancelled = false
    fetch("/api/planner/form-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { maxMultiDayDays?: number } | null) => {
        if (cancelled || !data) return
        const v = Number(data.maxMultiDayDays)
        if (Number.isFinite(v) && v >= 2 && v <= 14) setMaxMultiDayDays(v)
      })
      .catch(() => { /* keep default 2 */ })
    return () => { cancelled = true }
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [input, setInput] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "up" | "down">>({})
  const [centerItinerary, setCenterItinerary] = useState<Itinerary | null>(null)
  // Visibility of the full-screen modal is now decoupled from the
  // itinerary DATA. Closing the modal previously cleared centerItinerary,
  // which (a) wiped localStorage and (b) flipped the sidebar back to
  // "Build" even though the plan was already built. We now only flip
  // this flag on close and keep the data intact for re-opening / reload.
  const [centerItineraryOpen, setCenterItineraryOpen] = useState(false)
  const [itineraryRegenerating, setItineraryRegenerating] = useState(false)
  const itineraryRestoredRef = useRef(false)
  // Dynamic trips catalog — hydrated from DB on mount.
  // Bootstraps from the static seed so the first render isn't empty and so
  // the page still works if the DB endpoint is unreachable.
  const [allTrips, setAllTrips] = useState<Trip[]>(staticTripsFallback)
  useEffect(() => {
    let cancelled = false
    fetch("/api/planner/trips", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; trips?: Trip[] } | null) => {
        if (cancelled || !data?.ok || !Array.isArray(data.trips) || data.trips.length === 0) return
        setAllTrips(data.trips)
      })
      .catch(() => { /* keep static fallback */ })
    return () => { cancelled = true }
  }, [])
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleOpenItinerary = useCallback((itinerary: Itinerary) => {
    setCenterItinerary(itinerary)
    setCenterItineraryOpen(true)
    // On mobile/tablet the right-side cart drawer is the only surface
    // that can host the itinerary panel — make sure it's open so the
    // panel is actually visible after build / view.
    setCartOpen(true)
    // Auto-expand the map so the route + numbered pins are visible
    // immediately when the plan lands.
    setMapExpanded(true)
  }, [])
  const handleCloseItinerary = useCallback(() => {
    // Hide the modal but keep the data — so View Itinerary stays
    // available and the plan survives page refreshes.
    setCenterItineraryOpen(false)
  }, [])

  /* ─── Itinerary persistence ───
     Survives hard refresh by mirroring `centerItinerary` to localStorage.
     Cart contents are the authoritative invalidator: the fingerprint is
     just the sorted list of trip ids in the cart vs. in the itinerary.
     The itinerary's visitDate is intentionally NOT part of the fingerprint
     because the sidebar lets the user rebuild for a different day, and
     that rebuilt itinerary must remain visible even though it no longer
     matches `prefs.startDate` (the onboarding date never updates when the
     sidebar mutates the visit-date cookie). Adding/removing trips from
     the cart still clears any stale itinerary. */
  const cartFingerprint = useMemo(
    () => [...items.map((i) => i.trip.id)].sort().join(","),
    [items],
  )

  // Ordered list of Trip objects matching the itinerary's steps — fed to
  // the map so it can render numbered pins (1..N) and connect them with
  // a driving route polyline. Only shown while the itinerary panel is
  // actually open so closing the panel returns the map to "search
  // results" mode.
  const itineraryMapTrips = useMemo<Trip[] | undefined>(() => {
    if (!centerItinerary || !centerItineraryOpen) return undefined
    const byId = new Map<string, Trip>()
    for (const t of allTrips) byId.set(t.id, t)
    for (const ci of items) byId.set(ci.trip.id, ci.trip)
    const out: Trip[] = []
    for (const s of centerItinerary.steps) {
      const t = byId.get(s.tripId)
      if (t) out.push(t)
    }
    return out.length > 0 ? out : undefined
  }, [centerItinerary, centerItineraryOpen, allTrips, items])

  // Set of trip ids currently in the cart — used by the drift guard
  // below to test "is every itinerary step still represented in the
  // cart?" instead of comparing fingerprints, which would falsely fire
  // any time the AI picked only a subset of cart trips (perfectly normal
  // — e.g. a closed venue gets excluded).
  const cartTripIdSet = useMemo(() => new Set(items.map((i) => i.trip.id)), [items])

  // Restore on mount (once cart hydrated).
  useEffect(() => {
    if (!cartHydrated || !hydrated || itineraryRestoredRef.current) return
    itineraryRestoredRef.current = true
    try {
      // v2 bumped: legacy entries (v1) didn't include the live travelLeg
      // data, so reading them back would render misleading "routing
      // service error" copy. The old key is best-effort cleared too.
      try { window.localStorage.removeItem("sightseeing_itinerary_v1") } catch { /* ignore */ }
      const raw = window.localStorage.getItem("sightseeing_itinerary_v2")
      if (!raw) return
      const saved = JSON.parse(raw) as { itinerary: Itinerary }
      const it = saved?.itinerary
      if (!it?.steps?.length) {
        window.localStorage.removeItem("sightseeing_itinerary_v2")
        return
      }
      // Match the drift-guard semantics: keep the saved plan as long
      // as every step is still present in the cart. (The AI may have
      // intentionally built a plan with fewer trips than the cart —
      // e.g. dropping a venue that was closed on the chosen date —
      // and an exact-fingerprint compare would wrongly wipe it.)
      const stillRepresented = it.steps.every((s) => cartTripIdSet.has(s.tripId))
      if (stillRepresented) {
        setCenterItinerary(it)
      } else {
        window.localStorage.removeItem("sightseeing_itinerary_v2")
      }
    } catch {
      try { window.localStorage.removeItem("sightseeing_itinerary_v2") } catch { /* ignore */ }
    }
  }, [cartHydrated, hydrated, cartTripIdSet])

  // Drift guard — clear ONLY when the user actively removes a trip
  // from the cart that the itinerary depended on. Previously this
  // compared full fingerprints, which incorrectly fired whenever the
  // AI built a plan with fewer trips than the cart held (e.g. it
  // dropped a venue that was closed on the chosen date) — so the
  // freshly-built itinerary was nuked the instant it landed and the
  // "Build → View" button silently snapped back to "Build".
  useEffect(() => {
    if (!itineraryRestoredRef.current || !centerItinerary) return
    const stillRepresented = centerItinerary.steps.every((s) => cartTripIdSet.has(s.tripId))
    if (!stillRepresented) {
      setCenterItinerary(null)
    }
  }, [centerItinerary, cartTripIdSet])

  // Persist whenever the itinerary changes — always keyed by the itinerary's
  // own self-fingerprint, never the (possibly drifted) cart fingerprint.
  useEffect(() => {
    if (!itineraryRestoredRef.current) return
    try {
      if (centerItinerary) {
        window.localStorage.setItem(
          "sightseeing_itinerary_v2",
          JSON.stringify({ itinerary: centerItinerary }),
        )
      } else {
        window.localStorage.removeItem("sightseeing_itinerary_v2")
      }
    } catch { /* quota / privacy-mode — silently skip */ }
  }, [centerItinerary])

  // Global ESC handler — closes the itinerary modal regardless of which
  // element currently has focus (the backdrop's local onKeyDown only fires
  // when the backdrop itself is focused, which is rare in practice).
  useEffect(() => {
    if (!centerItineraryOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCenterItineraryOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [centerItineraryOpen])

  const handleRegenerateItinerary = useCallback(async () => {
    setItineraryRegenerating(true)
    try {
      const trips = items.map(i => ({
        id: i.trip.id,
        title: i.trip.title,
        city: i.trip.city,
        duration: i.trip.duration,
        category: i.trip.category,
      }))
      // Always re-read the latest prefs at call time — the dependency array
      // intentionally tracks `prefs` so onboarding changes flow through, but
      // this guards against any stale-closure edge case as well.
      const visitDate = prefs?.startDate || todayYMD()
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips, startDate: visitDate }),
      })
      if (!res.ok) throw new Error("Failed")
      const data: Itinerary = await res.json()
      setCenterItinerary(data)
    } catch { /* silent */ } finally {
      setItineraryRegenerating(false)
    }
  }, [items, prefs])

  const sendFeedback = useCallback(async (messageId: string, vote: "up" | "down") => {
    setFeedbackGiven((prev) => ({ ...prev, [messageId]: vote }))
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, vote, source: "planner", timestamp: new Date().toISOString() }),
    })
  }, [])

  const handleTripSelect = useCallback((trip: Trip) => setSelectedTrip(trip), [])

  /* Hydrate prefs from cookie */
  useEffect(() => {
    const saved = getCookie(PREFS_COOKIE)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<Preferences>
        // Require a startDate that is today or later; otherwise discard so the
        // user is re-prompted (we never want to plan against a stale past date).
        const validDate = parsed.startDate && parsed.startDate >= todayYMD()
        if (parsed.group && parsed.interests?.length && parsed.duration && parsed.budget && validDate) {
          // Backfill adults/children for cookies written before this field existed.
          const party = defaultPartyFor(parsed.group)
          setPrefs({
            group: parsed.group,
            interests: parsed.interests,
            duration: parsed.duration,
            budget: parsed.budget,
            startDate: parsed.startDate!,
            adults: typeof parsed.adults === "number" && parsed.adults >= 1 ? parsed.adults : party.adults,
            children: typeof parsed.children === "number" && parsed.children >= 0 ? parsed.children : party.children,
            // Backfill dayCount for legacy cookies. If duration is multi-day
            // and no count was stored, default to 2.
            dayCount: typeof parsed.dayCount === "number" && parsed.dayCount >= 1
              ? parsed.dayCount
              : (parsed.duration === "multi-day" ? 2 : 1),
          })
        }
      } catch { /* ignore */ }
    }
    setHydrated(true)
  }, [])

  /* AI Chat */
  const cartSummary = useMemo(() => items.map(i => ({ id: i.trip.id, title: i.trip.title })), [items])

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/planner",
      prepareSendMessagesRequest: ({ id, messages: msgs }) => ({
        body: { id, messages: msgs, preferences: prefs, cartItems: cartSummary },
      }),
    }),
    [prefs, cartSummary]
  )

  // ── Chat persistence ──
  // Restore prior conversation from localStorage so a hard refresh doesn't
  // lose the chat. Keyed under v1 so we can bump the schema later.
  const CHAT_STORAGE_KEY = "sightseeing_chat_v1"
  const initialMessagesRef = useRef<PlannerMessage[]>([])
  const messagesRestoredRef = useRef(false)
  if (!messagesRestoredRef.current && typeof window !== "undefined") {
    messagesRestoredRef.current = true
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as PlannerMessage[]
        if (Array.isArray(saved) && saved.length > 0) {
          initialMessagesRef.current = saved
        }
      }
    } catch { /* ignore */ }
  }

  const { messages, sendMessage, addToolOutput, status, setMessages } = useChat<PlannerMessage>({
    transport,
    messages: initialMessagesRef.current,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (toolCall.dynamic) return
      if (toolCall.toolName === "updatePreferences") {
        // AI-driven preference update from chat. We read the latest
        // prefs SYNCHRONOUSLY from prefsRef (not the React state captured
        // in this closure) so the snapshot we hand back to the model is
        // always current — React's setState is async and the next auto
        // tool-loop request fires immediately after addToolOutput, so a
        // stale snapshot would silently desync model state from the UI.
        const patch = toolCall.input as Partial<Preferences>
        const base: Preferences = prefsRef.current ?? EMPTY_PREFS

        // Per-field merge with strict validation.
        const next: Preferences = {
          group: typeof patch.group === "string" && patch.group ? patch.group : base.group,
          interests: Array.isArray(patch.interests) ? patch.interests.slice(0, 3) : base.interests,
          duration: typeof patch.duration === "string" && patch.duration ? patch.duration : base.duration,
          budget: typeof patch.budget === "string" && patch.budget ? patch.budget : base.budget,
          startDate: typeof patch.startDate === "string" && patch.startDate ? patch.startDate : base.startDate,
          adults: typeof patch.adults === "number" && patch.adults >= 1 ? Math.min(20, patch.adults) : base.adults,
          children: typeof patch.children === "number" && patch.children >= 0 ? Math.min(20, patch.children) : base.children,
          // Preserve / clamp dayCount on AI-driven updates. If the AI is
          // switching to multi-day, snap to at least 2 days; switching
          // away from multi-day collapses back to 1.
          dayCount: typeof patch.dayCount === "number" && patch.dayCount >= 1
            ? Math.min(14, Math.floor(patch.dayCount))
            : (patch.duration === "multi-day"
                ? Math.max(2, base.dayCount || 2)
                : (patch.duration && patch.duration !== "multi-day" ? 1 : base.dayCount)),
        }
        // When the group changes, snap any OMITTED party-size field to
        // the sensible default for the new group — independently for
        // adults and children. (Previously this only fired when BOTH
        // were omitted, which left stale kids hanging around after e.g.
        // family → couple transitions.)
        if (patch.group && patch.group !== base.group) {
          const d = defaultPartyFor(patch.group)
          if (typeof patch.adults !== "number") next.adults = d.adults
          if (typeof patch.children !== "number") next.children = d.children
        }

        // No-op short-circuit: skip churn if nothing actually changed.
        const unchanged =
          next.group === base.group &&
          next.duration === base.duration &&
          next.budget === base.budget &&
          next.startDate === base.startDate &&
          next.adults === base.adults &&
          next.children === base.children &&
          next.interests.length === base.interests.length &&
          next.interests.every((v, i) => v === base.interests[i])

        if (!unchanged) {
          prefsRef.current = next
          setPrefs(next)
          try { setCookie(PREFS_COOKIE, JSON.stringify(next)) } catch { /* ignore */ }
        }

        addToolOutput({
          tool: "updatePreferences",
          toolCallId: toolCall.toolCallId,
          output: {
            ok: true,
            unchanged,
            preferences: next,
          } as never,
        })
        return
      }
      if (toolCall.toolName === "addToCart") {
        const { tripId } = toolCall.input as { tripId: string; tripTitle: string }
        // Resolve from static catalog first, then from the most recent searchTrips
        // tool output (covers DB-only trips with tcms_* ids).
        // Read from refs — useChat captures onToolCall's closure on mount, so
        // direct `allTrips` / `aiTrips` reads would see stale values after the
        // DB hydration replaces the catalog.
        let trip: Trip | undefined = allTripsRef.current.find((t) => t.id === tripId)
        if (!trip) trip = aiTripsRef.current.find((t) => t.id === tripId)
        if (trip) addItem(trip)
        addToolOutput({
          tool: "addToCart",
          toolCallId: toolCall.toolCallId,
          output: undefined as never,
        })
      }
    },
  })

  /* Auto-scroll chat */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  /* Persist messages whenever they change — survives hard refresh. */
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (messages.length > 0) {
        window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages))
      } else {
        window.localStorage.removeItem(CHAT_STORAGE_KEY)
      }
    } catch { /* quota / privacy-mode — silently skip */ }
  }, [messages, CHAT_STORAGE_KEY])

  /* Send initial message after onboarding */
  const didSendInitial = useRef(false)
  // If we restored prior chat history from localStorage on mount, do NOT
  // re-fire the "Find the best trips for me…" seed message — otherwise
  // every refresh would tack a duplicate onto the bottom of the chat.
  if (initialMessagesRef.current.length > 0) didSendInitial.current = true
  useEffect(() => {
    if (hydrated && prefs && !didSendInitial.current && messages.length === 0 && status === "ready") {
      didSendInitial.current = true
      const t = setTimeout(() => {
        const visitDate = prefs.startDate || todayYMD()
        const isToday = visitDate === todayYMD()
        const datePhrase = isToday ? "today" : `on ${formatYMDPretty(visitDate)} (${visitDate})`
        sendMessage({ text: `Find the best trips for me ${datePhrase} based on my preferences and the weather. Analyse each trip's description and details (day vs night activities, opening hours, indoor vs outdoor) to match trips that genuinely fit my visit date and time-of-day, then check real availability for ${visitDate}.` })
      }, 300)
      return () => clearTimeout(t)
    }
  }, [hydrated, prefs, messages.length, sendMessage, status])

  function handleOnboardingComplete(newPrefs: Preferences) {
    setCookie(PREFS_COOKIE, JSON.stringify(newPrefs))
    setPrefs(newPrefs)
  }
  function resetPrefs() {
    setPrefs(null)
    didSendInitial.current = false
    document.cookie = `${PREFS_COOKIE}=;path=/;max-age=0`
    // Clear persisted chat history too — a fresh onboarding shouldn't show
    // the previous visitor's conversation in the background.
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
      setMessages([])
    } catch { /* ignore */ }
  }

  /* ── Extract trips from AI Gen UI tool results ── */
  const aiTrips = useMemo(() => {
    const found: Trip[] = []
    const seen = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool-searchTrips" && part.state === "output-available") {
          const output = part.output as {
            trips: Array<{
              id: string; title?: string; image?: string; price?: number;
              originalPrice?: number; rating?: number; reviewCount?: number;
              duration?: string; category?: string; tags?: string[]; badge?: string;
              city?: string; description?: string; highlights?: string[];
            }>
          }
          if (output?.trips) {
            // Clear previous results so we always show the latest search
            found.length = 0
            seen.clear()
            for (const partial of output.trips) {
              if (!seen.has(partial.id)) {
                seen.add(partial.id)
                const full = allTrips.find((t) => t.id === partial.id)
                if (full) {
                  found.push(full)
                } else if (partial.title && partial.image) {
                  // DB-only trip (e.g. tcms_*): build a Trip from partial fields
                  found.push({
                    id: partial.id,
                    title: partial.title,
                    image: partial.image,
                    price: partial.price ?? 0,
                    originalPrice: partial.originalPrice,
                    rating: partial.rating ?? 0,
                    reviewCount: partial.reviewCount ?? 0,
                    duration: partial.duration ?? "",
                    category: partial.category ?? "",
                    tags: partial.tags ?? [],
                    badge: partial.badge,
                    city: partial.city,
                    description: partial.description,
                    highlights: partial.highlights,
                  })
                }
              }
            }
          }
        }
      }
    }
    return found
  }, [messages, allTrips])

  /* Client-side fallback trips */
  const fallbackTrips = useMemo(() => {
    if (!prefs) return []
    const wxCond = deriveWx()
    const scored = allTrips.map((t) => {
      let score = 0
      for (const interest of prefs.interests) {
        if (t.tags.includes(interest)) score += 10
        if (t.category.toLowerCase().includes(interest)) score += 5
      }
      if (wxCond === "rainy" && t.tags.includes("indoor")) score += 5
      if (wxCond === "sunny" && t.tags.includes("outdoor")) score += 5
      if (t.rating >= 4.7) score += 3
      if (prefs.budget !== "any") {
        if (prefs.budget === "casual" && t.price <= 30) score += 4
        if (prefs.budget === "premium" && t.price >= 60) score += 4
        if (prefs.budget === "mid-range" && t.price > 20 && t.price < 80) score += 4
      }
      return { trip: t, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 8).map((s) => s.trip)
  }, [prefs, allTrips])

  const resultTrips = aiTrips.length > 0 ? aiTrips : fallbackTrips

  // Mirror aiTrips into a ref so onToolCall (addToCart) can resolve DB-only
  // trips (tcms_*) that aren't in the static catalog. useChat's onToolCall
  // closure captures stale values, so we read latest via this ref.
  const aiTripsRef = useRef<Trip[]>([])
  useEffect(() => { aiTripsRef.current = aiTrips }, [aiTrips])
  // Same staleness issue for the DB-hydrated catalog — mirror it into a ref.
  const allTripsRef = useRef<Trip[]>(staticTripsFallback)
  useEffect(() => { allTripsRef.current = allTrips }, [allTrips])
  // Latest prefs snapshot — read synchronously by the updatePreferences
  // tool handler so the merged value it returns to the model is never
  // stale (React state updates are async, but the tool-loop fires the
  // next request immediately after addToolOutput).
  const prefsRef = useRef<Preferences | null>(null)
  useEffect(() => { prefsRef.current = prefs }, [prefs])
  const isStreaming = status === "streaming" || status === "submitted"
  const showResults = resultTrips.length > 0

  /* Auto-expand map and center it when AI returns a new set of results */
  const prevResultTripIds = useRef<string>("")
  useEffect(() => {
    if (resultTrips.length === 0) return
    const ids = resultTrips.map((t) => t.id).join(",")
    if (ids !== prevResultTripIds.current) {
      prevResultTripIds.current = ids
      setMapExpanded(true)
    }
  }, [resultTrips])

  /* ── Context-aware suggestions that anticipate the next user action ── */
  const suggestions = useMemo(() => {
    type Chip = { label: string; action: string }
    const chips: Chip[] = []
    const turns = messages.filter((m) => m.role === "user").length

    // Phase 1: No messages yet or first turn -- broad discovery
    if (turns === 0) {
      chips.push({ label: "Best for today", action: "What are the best experiences for today's weather?" })
      chips.push({ label: "Surprise me", action: "Surprise me with something unique!" })
      if (prefs?.budget === "casual") chips.push({ label: "Free activities", action: "Show me free activities" })
      else chips.push({ label: "Top rated", action: "Show me the highest rated experiences" })
      chips.push({ label: "What's nearby?", action: "What experiences are close to the city center?" })
      return chips
    }

    // If a trip is currently selected in the detail view
    if (selectedTrip) {
      chips.push({ label: "Save to trip", action: `Add "${selectedTrip.title}" to my trip list` })
      chips.push({ label: "Similar options", action: `Show me more experiences like "${selectedTrip.title}"` })
      chips.push({ label: "Tell me more", action: `What should I know before visiting "${selectedTrip.title}"?` })
      chips.push({ label: "Back to results", action: "Show me other options" })
      return chips
    }

    // If cart has items -- suggest planning/completing
    if (totalItems > 0) {
      chips.push({ label: "Review my trip", action: `I have ${totalItems} item${totalItems > 1 ? "s" : ""} saved. Help me plan the day.` })
      chips.push({ label: "Add more", action: "Show me more experiences to add to my trip" })
      if (totalItems >= 2) chips.push({ label: "Plan my route", action: "What's the best order to visit my saved experiences?" })
    }

    // If results are showing -- suggest refinements based on what's available
    if (resultTrips.length > 0) {
      const categories = [...new Set(resultTrips.map((t) => t.category))]
      const hasOutdoor = resultTrips.some((t) => t.tags.includes("outdoor"))
      const hasIndoor = resultTrips.some((t) => t.tags.includes("indoor"))
      const hasFree = resultTrips.some((t) => t.price === 0)
      const cheapest = [...resultTrips].sort((a, b) => a.price - b.price)[0]
      const topRated = [...resultTrips].sort((a, b) => b.rating - a.rating)[0]

      if (topRated && chips.length < 4) chips.push({ label: `Top pick: ${topRated.rating}`, action: `Tell me about "${topRated.title}"` })
      if (hasOutdoor && hasIndoor && chips.length < 4) chips.push({ label: "Outdoor only", action: "Only show me outdoor experiences" })
      if (hasFree && chips.length < 4) chips.push({ label: "Free options", action: "Show me only the free activities" })
      if (cheapest && cheapest.price > 0 && chips.length < 4) chips.push({ label: `From ${cheapest.price}\u00A0\u20AC`, action: `What can I do for around ${cheapest.price} euros?` })
      if (categories.length > 1 && chips.length < 4) {
        const cat = categories.find((c) => c !== "Tours") ?? categories[0]
        chips.push({ label: cat, action: `Show me ${cat.toLowerCase()} experiences` })
      }
    }

    // General fallbacks to ensure there's always something to tap
    if (chips.length < 2) chips.push({ label: "Family-friendly", action: "What experiences are best for families?" })
    if (chips.length < 3) chips.push({ label: "Half-day plan", action: "Help me plan a half-day itinerary" })
    if (chips.length < 4) chips.push({ label: "Rainy day ideas", action: "What should I do if it rains?" })

    return chips.slice(0, 4)
  }, [messages, prefs, selectedTrip, totalItems, resultTrips])

  function handleSend(text: string) {
    if (!text.trim() || status !== "ready") return
    setSelectedTrip(null)
    sendMessage({ text })
    setInput("")
  }

  if (!hydrated) return null

  /* ────────────────────────── */
  /* RENDER                     */
  /* ────────────────────────── */
  return (
    <div className="flex h-screen flex-col bg-background">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">

        {/* ───── LEFT: Chat Sidebar ───── */}
        <div className={`flex flex-col border-r border-border bg-card transition-all duration-300 ${sidebarOpen ? "w-full sm:w-80 lg:w-96" : "w-0 overflow-hidden"}`}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Trip Planner</p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <WxIcon condition={wx} className={`h-3 w-3 ${wxColor(wx)}`} />
                  <span>{temp}°C &bull; {condition}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {!prefs ? (
            <Onboarding onComplete={handleOnboardingComplete} maxMultiDayDays={maxMultiDayDays} />
          ) : (
            <>
              {/* Preference pills */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize">{prefs.group}</span>
                {prefs.interests.map((i) => (
                  <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize">{i}</span>
                ))}
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground">{prefs.duration}</span>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize">{prefs.budget}</span>
                <button type="button" onClick={resetPrefs} className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground" title="Reset preferences">
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>

              {/* Chat messages -- TEXT and DATA only, never trip listings */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                <div className="flex flex-col gap-4">
                  {messages.map((msg, msgIdx) => {
                    if (msgIdx === 0 && msg.role === "user") return null
                    const textParts: React.ReactNode[] = []
                    msg.parts.forEach((part, idx) => {
                      switch (part.type) {
                        case "text": {
                          const clean = part.text.replace(/^#{1,3}\s+/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/!\[.*?\]\(.*?\)/g, "").replace(/^[-*]\s+/gm, "").trim()
                          if (clean) textParts.push(<p key={idx} className="whitespace-pre-wrap">{clean}</p>)
                          break
                        }
                        case "tool-searchTrips": {
                          if (part.state !== "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Updating results...</span>
                              </div>
                            )
                          }
                          // When output-available, render nothing -- the center panel updates automatically
                          break
                        }
                        case "tool-showWeather": {
                          if (part.state === "output-available") {
                            const wxOut = part.output as unknown as { tip: string; current: typeof weatherData.current; forecast: typeof weatherData.forecast }
                            textParts.push(
                              <div key={idx} className="mt-2 rounded-xl border border-border bg-background/80 p-3">
                                <div className="flex items-center gap-2">
                                  <WxIcon condition={wx} className={`h-5 w-5 ${wxColor(wx)}`} />
                                  <div>
                                    <span className="text-sm font-semibold text-foreground">{temp}°C</span>
                                    <span className="ml-1.5 text-xs text-muted-foreground">{condition}</span>
                                  </div>
                                </div>
                                <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                                  <span className="flex items-center gap-1"><Droplets className="h-3 w-3 text-blue-400" />{humidity}%</span>
                                  <span className="flex items-center gap-1"><Wind className="h-3 w-3 text-sky-400" />{wind} km/h</span>
                                  <span className="flex items-center gap-1"><Thermometer className="h-3 w-3 text-red-400" />Feels {temp - 2}°C</span>
                                </div>
                                {wxOut?.tip && <p className="mt-2 text-xs text-muted-foreground">{wxOut.tip}</p>}
                              </div>
                            )
                          } else {
                            textParts.push(<p key={idx} className="text-xs italic text-muted-foreground">Checking weather...</p>)
                          }
                          break
                        }
                        case "tool-offerCoupon": {
                          if (part.state === "output-available") {
                            const coupon = part.output as { code: string; discountPercent: number; tripTitle: string; expiresLabel: string; reason: string }
                            textParts.push(
                              <div key={idx} className="mt-2.5 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5">
                                  <Ticket className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Special offer</span>
                                  <span className="ml-auto text-[10px] text-primary/70">{coupon.expiresLabel}</span>
                                </div>
                                <div className="px-3 py-2.5">
                                  <p className="text-xs text-muted-foreground">{coupon.reason}</p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-2xl font-bold text-primary">{coupon.discountPercent}%</span>
                                      <span className="text-xs font-medium text-primary/70">OFF</span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-dashed border-primary/30 bg-background px-2.5 py-1.5">
                                      <code className="text-sm font-bold tracking-wider text-foreground">{coupon.code}</code>
                                      <button
                                        type="button"
                                        onClick={() => { navigator.clipboard.writeText(coupon.code) }}
                                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
                                        title="Copy code"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                                    {"Best for: "}{coupon.tripTitle}
                                  </p>
                                </div>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-showTransitPlanner": {
                          if (part.state === "output-available") {
                            const transit = part.output as { context: string; provider: string }
                            textParts.push(
                              <div key={idx} className="mt-2.5">
                                {transit?.context && (
                                  <p className="mb-2 text-xs text-muted-foreground">{transit.context}</p>
                                )}
                                <MobiliteitPlanner />
                              </div>
                            )
                          } else {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Loading transit planner...</span>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-showWeatherAlert": {
                          if (part.state === "output-available") {
                            const alert = part.output as { alertType: string; title: string; message: string; suggestedTags: string[] }
                            const alertStyles: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
                              rainy: { bg: "from-blue-500/10 to-blue-600/5", border: "border-blue-400/30", icon: <Umbrella className="h-4 w-4 text-blue-500" /> },
                              sunny: { bg: "from-amber-500/10 to-yellow-500/5", border: "border-amber-400/30", icon: <Sun className="h-4 w-4 text-amber-500" /> },
                              cloudy: { bg: "from-slate-400/10 to-slate-500/5", border: "border-slate-400/30", icon: <CloudSun className="h-4 w-4 text-slate-500" /> },
                            }
                            const style = alertStyles[alert.alertType] || alertStyles.cloudy
                            textParts.push(
                              <div key={idx} className={`mt-2.5 overflow-hidden rounded-xl border ${style.border} bg-gradient-to-br ${style.bg}`}>
                                <div className="flex items-start gap-2.5 p-3">
                                  <div className="mt-0.5">{style.icon}</div>
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>
                                    <button
                                      type="button"
                                      onClick={() => sendMessage({ text: `Show me ${alert.suggestedTags.join(" and ")} experiences` })}
                                      className="mt-2 rounded-full bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm transition-colors hover:bg-background"
                                    >
                                      {"Show me " + alert.suggestedTags.join(" & ") + " picks"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-buildItinerary": {
                          if (part.state === "output-available") {
                            const itinerary = part.output as { steps: { time: string; tripTitle: string; tripId: string; durationMinutes: number; travelToNext?: string }[]; summary: string }
                            textParts.push(
                              <div key={idx} className="mt-2.5 overflow-hidden rounded-xl border border-border bg-card">
                                <div className="flex items-center gap-2 bg-primary/5 px-3 py-2">
                                  <Route className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-xs font-bold text-foreground">Your Day Itinerary</span>
                                </div>
                                <div className="px-3 py-2.5">
                                  <p className="mb-3 text-xs text-muted-foreground">{itinerary.summary}</p>
                                  <div className="relative ml-2 border-l-2 border-primary/20 pl-4">
                                    {itinerary.steps.map((step, si) => (
                                      <div key={si} className="relative pb-4 last:pb-0">
                                        <div className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-xs font-bold text-primary">{step.time}</span>
                                          <span className="text-xs font-semibold text-foreground">{step.tripTitle}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">{step.durationMinutes} min</span>
                                        {step.travelToNext && (
                                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                            <span>{"~"}</span>
                                            <span>{step.travelToNext}</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )
                          } else {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Building your itinerary...</span>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-addToCart": {
                          if (part.state === "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 p-2 text-xs font-medium text-primary">
                                <Check className="h-3.5 w-3.5" /><span>{part.output as string}</span>
                              </div>
                            )
                          } else if (part.state === "input-available") {
                            textParts.push(<p key={idx} className="text-xs italic text-muted-foreground">Adding to your trip...</p>)
                          }
                          break
                        }
                      }
                    })
                    if (textParts.length === 0) return null
                    const isAssistant = msg.role === "assistant"
                    const isDone = status !== "streaming" && status !== "submitted"
                    const voted = feedbackGiven[msg.id]
                    return (
                      <div key={msg.id} className={`flex gap-2.5 ${isAssistant ? "" : "flex-row-reverse"}`}>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isAssistant ? "bg-primary/10" : "bg-secondary"}`}>
                          {isAssistant ? <Bot className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <div className="flex max-w-[85%] flex-col gap-1">
                          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isAssistant ? "rounded-tl-md bg-secondary text-foreground" : "rounded-tr-md bg-primary text-primary-foreground"}`}>
                            {textParts}
                          </div>
                          {isAssistant && isDone && msgIdx !== 0 && (
                            <div className="flex items-center gap-1 pl-1">
                              {voted ? (
                                <span className="text-[10px] text-muted-foreground">Thanks for your feedback!</span>
                              ) : (
                                <>
                                  <button type="button" onClick={() => sendFeedback(msg.id, "up")}
                                    className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-primary" aria-label="Helpful">
                                    <ThumbsUp className="h-3 w-3" />
                                  </button>
                                  <button type="button" onClick={() => sendFeedback(msg.id, "down")}
                                    className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-destructive" aria-label="Not helpful">
                                    <ThumbsDown className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
                    <div className="flex gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="rounded-2xl rounded-tl-md bg-secondary px-4 py-3">
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Context-aware quick replies */}
              <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2 scrollbar-none">
                {suggestions.map((s) => (
                  <button key={s.label} type="button" onClick={() => handleSend(s.action)} disabled={isStreaming}
                    className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40">
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="border-t border-border px-4 py-3">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(input) }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/40">
                  <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" disabled={isStreaming} />
                  <button type="submit" disabled={!input.trim() || isStreaming}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
                    <Send className="h-4 w-4" />
                  </button>
                </form>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Powered by sightseeing.lu</p>
              </div>
            </>
          )}
        </div>

        {/* ───── CENTER: Results Area ───── */}
        <div className="relative flex-1 overflow-y-auto">
          {/* Mobile / tablet toggles (chat hidden < sm, cart hidden < xl) */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm xl:hidden">
            {!sidebarOpen ? (
              <button type="button" onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground sm:hidden">
                <PanelLeftOpen className="h-4 w-4" /> Chat
              </button>
            ) : <span className="sm:hidden" />}
            <button type="button" onClick={() => setCartOpen(true)}
              className="relative ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground">
              <ShoppingBag className="h-4 w-4" /> My Trip
              {totalItems > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{totalItems}</span>}
            </button>
          </div>

          {/* ── Trip Canvas header ──
              Single label for the whole center column (Map View + the
              swap below: Recommended for you / Day Itinerary). The chat
              and the system prompt both refer to this region as
              "Trip Canvas" so the assistant can say things like
              "I've updated the Trip Canvas" without ambiguity. */}
          <div className="hidden items-center gap-2 border-b border-border bg-background/95 px-6 py-2 sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Trip Canvas
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {centerItinerary && centerItineraryOpen
                ? "Map + your Day Itinerary"
                : selectedTrip
                  ? "Trip detail"
                  : showResults
                    ? "Map + Recommended for you"
                    : "Map + suggestions appear here"}
            </span>
          </div>

          {/* Inline Day Itinerary takes over the center column whenever
              the plan is open — regardless of whether we're in the
              welcome state, a trip detail, or results. The Map View is
              still rendered at the top so users can see the route +
              numbered pins alongside the timeline. */}
          {centerItinerary && centerItineraryOpen ? (
            <div className="flex flex-col">
              <div className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setMapExpanded(!mapExpanded)}
                  className="flex w-full items-center justify-between px-6 py-2.5 text-left transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Map View</span>
                    <span className="text-xs text-muted-foreground">{centerItinerary.steps.length} stops</span>
                  </div>
                  {mapExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                <div className={`border-t border-border ${mapExpanded ? "" : "hidden"}`}>
                  <SightseeingMap
                    trips={resultTrips}
                    onSelect={handleTripSelect}
                    visible={mapExpanded}
                    suppressFullscreen
                    itineraryTrips={itineraryMapTrips}
                  />
                </div>
              </div>
              <ItineraryPanel
                itinerary={centerItinerary}
                onClose={handleCloseItinerary}
                onRegenerate={handleRegenerateItinerary}
                regenerating={itineraryRegenerating}
              />
            </div>
          ) : !showResults ? (
            /* ── Welcome / Waiting ── */
            <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
              <div className={`rounded-2xl bg-gradient-to-br ${wx === "rainy" ? "from-blue-50 to-slate-100" : wx === "sunny" ? "from-amber-50 to-orange-50" : "from-slate-50 to-sky-50"} p-5 lg:p-6`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-card/80 shadow-sm ${wxColor(wx)}`}>
                      <WxIcon condition={wx} className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{temp}°C</p>
                      <p className="text-sm text-muted-foreground">{condition} in Luxembourg</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Droplets className="h-3.5 w-3.5 text-blue-400" />{humidity}%</span>
                    <span className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-sky-400" />{wind} km/h</span>
                    <span className="flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5 text-red-400" />Feels {temp - 2}°C</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 max-w-3xl sm:mt-8">
                <h1 className="text-balance text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
                  {prefs ? "Finding your perfect trips..." : "Plan your perfect day"}<br />
                  <span className="text-primary">in Luxembourg</span>
                </h1>
                <p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
                  {prefs
                    ? "Our AI is matching experiences to your preferences and today's weather. Results will appear here momentarily."
                    : "Answer a few quick questions in the chat panel, and our AI will curate the perfect itinerary based on your interests and today's weather."}
                </p>
              </div>
              {!prefs && (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-3">
                  {[
                    { icon: Sparkles, title: "AI-Powered", desc: "Smart recommendations based on your preferences" },
                    { icon: CloudSun, title: "Weather-Aware", desc: "Adapts to current conditions automatically" },
                    { icon: MapPin, title: "Local Experts", desc: "Curated by passionate local guides" },
                  ].map((f) => (
                    <div key={f.title} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><f.icon className="h-5 w-5 text-primary" /></div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedTrip ? (
            /* ── Trip Detail View (closable) ── */
            <div className="flex flex-col">
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-sm">
                <button type="button" onClick={() => setSelectedTrip(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors hover:bg-secondary" aria-label="Close detail">
                  <X className="h-4 w-4" />
                </button>
                <p className="truncate text-sm font-semibold text-foreground">{selectedTrip.title}</p>
              </div>
              <SightseeingAlbum
                trip={selectedTrip}
                onBook={() => { addItem(selectedTrip) }}
              />
              {/* Booking iframe */}
              <div className="border-t border-border px-4 py-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Book this experience</h3>
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="booking-iframe-wrap">
                    <iframe
                      src="https://sightseeingluxembourg.palisis.com/?book-direct=r-8146"
                      title={`Book ${selectedTrip.title}`}
                      className="booking-iframe"
                      allow="payment"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
              {/* Public transport planner */}
              <div className="border-t border-border px-4 py-5">
                <MobiliteitPlanner />
              </div>
            </div>
          ) : (
            /* ── Results: Map + Grid ── */
            <div className="flex flex-col">
              {/* Header bar */}
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
                <div className={`inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 ${wx === "rainy" ? "bg-blue-50" : wx === "sunny" ? "bg-amber-50" : "bg-slate-50"}`}>
                  <WxIcon condition={wx} className={`h-3.5 w-3.5 ${wxColor(wx)}`} />
                  <span className="text-xs font-medium text-foreground">{temp}°C &bull; {condition}</span>
                </div>
                {prefs && (
                  <div className="flex flex-wrap gap-1.5">
                    {prefs.startDate && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                        <Calendar className="h-3 w-3" />{formatYMDPretty(prefs.startDate)}
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize">{prefs.group}</span>
                    {prefs.interests.map((i) => (
                      <span key={i} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize">{i}</span>
                    ))}
                  </div>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{resultTrips.length} experiences</span>
              </div>

              {/* Expandable Map */}
              <div className="border-b border-border">
                <button
                  type="button"
                  onClick={() => setMapExpanded(!mapExpanded)}
                  className="flex w-full items-center justify-between px-6 py-2.5 text-left transition-colors hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Map View</span>
                    <span className="text-xs text-muted-foreground">{resultTrips.length} locations</span>
                  </div>
                  {mapExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {/* Keep map mounted always so Mapbox persists and fitBounds fires immediately on result changes */}
                <div className={`border-t border-border ${mapExpanded ? "" : "hidden"}`}>
                  <SightseeingMap
                    trips={resultTrips}
                    onSelect={handleTripSelect}
                    visible={mapExpanded}
                    suppressFullscreen={!!centerItinerary}
                    itineraryTrips={itineraryMapTrips}
                  />
                </div>
              </div>

              {/* Results Grid (the inline Day Itinerary is rendered at
                  a higher level — see the top-level guard above — so
                  this branch only renders when no plan is open). */}
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">Recommended for you</h2>
                </div>
                <div className="flex flex-col gap-3">
                  {resultTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} onSelect={handleTripSelect} />
                  ))}
                </div>

                {/* Travel partner offers */}
                <div className="mt-8 border-t border-border pt-6">
                  <TravelOffers compact />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ───── RIGHT: Cart (desktop) — always the cart, even when the
            itinerary panel is open in the center. The Build/View
            Itinerary CTA at the bottom controls the center panel. */}
        <div className="hidden w-80 flex-col border-l border-border bg-card xl:flex">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">My Trip</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TripCart />
          </div>
          <div className="shrink-0">
            <SidebarItinerary onOpenItinerary={handleOpenItinerary} existingItinerary={centerItinerary} />
          </div>
        </div>

        {/* Mobile / tablet cart drawer */}
        {cartOpen && (
          <div className="fixed inset-0 z-50 xl:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setCartOpen(false)} onKeyDown={() => {}} role="button" tabIndex={0} aria-label="Close cart" />
            <div className="absolute inset-y-0 right-0 flex w-full flex-col bg-card shadow-xl sm:w-96">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">My Trip</span>
                </div>
                <button type="button" onClick={() => setCartOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TripCart />
              </div>
              <div className="shrink-0">
                <SidebarItinerary onOpenItinerary={handleOpenItinerary} existingItinerary={centerItinerary} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
