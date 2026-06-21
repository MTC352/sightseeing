"use client"

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai"
import type { PlannerMessage } from "@/app/api/planner/route"
import { Navbar } from "@/components/site-navbar"
import { TripCart } from "@/components/planner/trip-cart"
import { SightseeingMap } from "@/components/chatgpt-widgets/sightseeing-map"
import { SightseeingAlbum } from "@/components/chatgpt-widgets/sightseeing-album"
import { SidebarItinerary, ItineraryPanel, recommendedTravelMethod, type Itinerary, type TravelMethod, type SidebarPrefsView, type PlanConflictPayload, type ItineraryFailurePayload, type AlternativeDate } from "@/components/sidebar-itinerary"
import { useCart } from "@/lib/cart-context"
import { usePlannerList } from "@/lib/planner-list-context"
import { weatherData, type Trip } from "@/lib/data"
import { substitutePlaceholders, buildPalisisBookingUrl } from "@/lib/booking-url"
import { parseDurationHoursMin } from "@/lib/duration-parser"
import { cn } from "@/lib/utils"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

// Fail-closed: NEVER bootstrap the AI planner with static seed data — it
// would expose archived/draft trips that have been removed from the DB.
// The planner starts empty and is populated by /api/planner/trips (publicOnly).
const staticTripsFallback: Trip[] = []
import Image from "next/image"
import Link from "next/link"
import {
  Send, Bot, User, PanelLeftClose, PanelLeftOpen, ShoppingBag,
  MapPin, Compass, Utensils, Bike, Landmark, Star, X, Sparkles,
  CloudSun, CloudRain, Sun, Thermometer, Droplets, Wind,
  Users, Heart, Baby, UserRound, Minus, Plus,
  Clock, DollarSign, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, RotateCcw, Check, Ticket, Copy, Calendar,
  CloudLightning, Umbrella, Camera, Share2, UserPlus, Route, ThumbsUp, ThumbsDown,
  Maximize2, Loader2, Bookmark, Download,
} from "lucide-react"
import { downloadItineraryPdf } from "@/lib/planner/itinerary-pdf"
import type { LucideIcon } from "lucide-react"

/* ─── Cookie helpers ─── */
const PREFS_COOKIE = "sightseeing_prefs"
// Mirror of the prefs cookie in localStorage. Some environments (Replit's
// iframed dev preview, third-party-cookie blockers, strict ITP) drop the
// cookie across reloads — without this mirror, the user is bounced through
// onboarding on every refresh.
const PREFS_LOCAL_KEY = "sightseeing_prefs_v1"
// Session marker (sessionStorage). Present = same browser session (i.e. a page
// reload); absent = a FRESH browser session (the tab/browser was closed &
// reopened). We use it to wipe the planner's persisted chat/canvas/prefs/list
// once per browser session so each new visit starts a clean conversation
// instead of loading a mix of stale threads (which also bloats the AI token
// budget and muddies context). sessionStorage survives reloads but is cleared
// on browser/tab close — exactly the lifetime we want.
const PLANNER_SESSION_KEY = "sightseeing_planner_session"
const MAX_AGE = 60 * 60 * 24 * 7
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${MAX_AGE};SameSite=Lax`
  // Mirror to localStorage so prefs survive even when the cookie is stripped.
  if (name === PREFS_COOKIE) {
    try { window.localStorage.setItem(PREFS_LOCAL_KEY, value) } catch { /* ignore */ }
    // Notify in-tab listeners (e.g. the cart's party-size sync) that prefs changed.
    try { window.dispatchEvent(new Event("sightseeing:prefs")) } catch { /* ignore */ }
  }
}
function getCookie(name: string): string | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))
    if (match) return decodeURIComponent(match.split("=").slice(1).join("="))
  } catch { /* fall through */ }
  // Fall back to the localStorage mirror.
  if (name === PREFS_COOKIE) {
    try { return window.localStorage.getItem(PREFS_LOCAL_KEY) } catch { /* ignore */ }
  }
  return null
}

/* ─── Preferences ─── */
/** A single user-supplied meal/break preference. The planner enforces ONE
 *  entry per `type`, so that a chat update like "actually push lunch to
 *  13:00" UPDATES the existing lunch entry instead of stacking a second,
 *  conflicting one (real-planner semantics). */
export interface MealBreakPref {
  type: "lunch" | "dinner" | "coffee"
  /** Earliest acceptable start time, HH:MM (24h). */
  earliest: string
  /** Latest acceptable start time, HH:MM (24h). */
  latest: string
  /** Desired break length in minutes. */
  durationMinutes: number
}
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
  /** Chat-supplied meal/break windows. Keyed by `type` — at most one
   *  entry per type so updates merge rather than duplicate. */
  mealBreaks?: MealBreakPref[]
  /** Free-form scheduling constraints, e.g. "no-early-morning". Sent to
   *  /api/itinerary which derives excludeEarlyMorning from it. */
  exclusions?: string[]
}
const EMPTY_PREFS: Preferences = { group: "", interests: [], duration: "", budget: "", startDate: "", adults: 1, children: 0, dayCount: 1 }
/** Hard cap on the combined party size (adults + children). */
const MAX_PARTY = 10

/** Normalize/clamp a meal-break pref coming from the AI tool input. Returns
 *  null if the entry is malformed. */
function sanitizeMealBreak(raw: unknown): MealBreakPref | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const type = r.type === "lunch" || r.type === "dinner" || r.type === "coffee" ? r.type : null
  if (!type) return null
  const hhmm = (v: unknown, fallback: string): string => {
    if (typeof v !== "string") return fallback
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
    if (!m) return fallback
    const h = Math.max(0, Math.min(23, parseInt(m[1], 10)))
    const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)))
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  }
  const defaults: Record<MealBreakPref["type"], { earliest: string; latest: string; duration: number }> = {
    lunch: { earliest: "12:00", latest: "14:00", duration: 60 },
    dinner: { earliest: "18:30", latest: "20:30", duration: 75 },
    coffee: { earliest: "15:00", latest: "16:30", duration: 20 },
  }
  const d = defaults[type]
  const dur = typeof r.durationMinutes === "number" && r.durationMinutes > 0
    ? Math.min(180, Math.floor(r.durationMinutes))
    : d.duration
  return {
    type,
    earliest: hhmm(r.earliest, d.earliest),
    latest: hhmm(r.latest, d.latest),
    durationMinutes: dur,
  }
}

/** Merge a chat-supplied list of meal-break patches into the existing
 *  prefs.mealBreaks list, REPLACING any entry with the same `type` (so
 *  "move lunch to 13:00" updates the existing lunch row instead of
 *  creating a second one). Unknown/malformed entries are silently
 *  dropped. */
function mergeMealBreaks(existing: MealBreakPref[] | undefined, incoming: unknown): MealBreakPref[] {
  const base = Array.isArray(existing) ? [...existing] : []
  if (!Array.isArray(incoming)) return base
  for (const raw of incoming) {
    const sanitized = sanitizeMealBreak(raw)
    if (!sanitized) continue
    const idx = base.findIndex((m) => m.type === sanitized.type)
    if (idx >= 0) base[idx] = sanitized
    else base.push(sanitized)
  }
  // Stable order: lunch → dinner → coffee, for predictable UI rendering.
  const order: Record<MealBreakPref["type"], number> = { lunch: 0, dinner: 1, coffee: 2 }
  base.sort((a, b) => order[a.type] - order[b.type])
  return base
}
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
/** The next weekend day (Sat or Sun) that is NOT today and NOT
 *  tomorrow — so the "This weekend" planner option always lands on a
 *  distinct, additional date relative to the "Today" / "Tomorrow"
 *  buttons. Falls back to the nearest weekend day overall if today is
 *  somehow already on a future weekend (defensive). */
function nextWeekendYMD(): string {
  const today = ymdLocal(new Date())
  const tmrw = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return ymdLocal(x) })()
  // Scan the next 14 days for the first Sat/Sun that isn't today/tomorrow.
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dow = d.getDay() // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) continue
    const ymd = ymdLocal(d)
    if (ymd === today || ymd === tmrw) continue
    return ymd
  }
  // Defensive fallback: next Saturday (or today if today is Saturday).
  const d = new Date()
  const dow = d.getDay()
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

/* ─── Onboarding option fallbacks ───
 * Admin can rename labels and reorder options from /admin/ai-systems/chat
 * (planner onboarding form section). Values are stable slugs that the AI
 * tools and the cookie rely on — they're NOT admin-renamable.
 * Icons stay client-side: admin edits labels/order; we resolve the icon
 * from the value via the maps below. Unknown values fall back to a sane
 * generic icon so a custom slug never crashes the form.
 */
const GROUP_ICONS: Record<string, LucideIcon> = {
  solo: UserRound,
  couple: Heart,
  family: Baby,
  friends: Users,
}
const INTEREST_ICONS: Record<string, LucideIcon> = {
  food: Utensils,
  culture: Landmark,
  outdoor: Compass,
  night: Star,
  sport: Bike,
  indoor: MapPin,
}
const DEFAULT_GROUP_OPTIONS = [
  { value: "solo", label: "Solo" },
  { value: "couple", label: "Couple" },
  { value: "family", label: "Family with kids" },
  { value: "friends", label: "Friends group" },
]
const DEFAULT_INTEREST_OPTIONS = [
  { value: "food", label: "Food & Drinks" },
  { value: "culture", label: "History & Culture" },
  { value: "outdoor", label: "Outdoor & Nature" },
  { value: "night", label: "Nightlife" },
  { value: "sport", label: "Active & Sports" },
  { value: "indoor", label: "Hidden Gems" },
]
const DEFAULT_DURATION_OPTIONS = [
  { value: "1-2h", label: "1-2 hours" },
  { value: "half-day", label: "Half day" },
  { value: "full-day", label: "Full day" },
]

/** Max trip length (in hours) the visitor can fit, derived from the
 *  "time available" preference. Returns null = no cap (full-day, multi-day,
 *  "any", empty, or any admin-custom option we don't recognise). Used to hide
 *  recommendations that are physically too long for the selected window
 *  (e.g. an 8-hour day tour when the visitor only has 1-2 hours). */
function durationCapHours(duration: string | null | undefined): number | null {
  switch (duration) {
    case "1-2h":
      return 2
    case "half-day":
      return 4
    default:
      return null
  }
}
const DEFAULT_BUDGET_OPTIONS = [
  { value: "casual", label: "Keep it casual" },
  { value: "mid-range", label: "Mid-range" },
  { value: "premium", label: "Treat ourselves" },
]
type EnabledSteps = {
  groups: boolean
  interests: boolean
  durations: boolean
  budgets: boolean
  dates: boolean
}
type FormOptions = {
  groups: { value: string; label: string }[]
  interests: { value: string; label: string }[]
  durations: { value: string; label: string }[]
  budgets: { value: string; label: string }[]
  maxMultiDayDays: number
  maxInterests: number
  maxChatTurns: number
  enabledSteps: EnabledSteps
}
const DEFAULT_ENABLED_STEPS: EnabledSteps = {
  groups: true, interests: true, durations: true, budgets: true, dates: true,
}
const DEFAULT_FORM_OPTIONS: FormOptions = {
  groups: DEFAULT_GROUP_OPTIONS,
  interests: DEFAULT_INTEREST_OPTIONS,
  durations: DEFAULT_DURATION_OPTIONS,
  budgets: DEFAULT_BUDGET_OPTIONS,
  maxMultiDayDays: 2,
  maxInterests: 3,
  maxChatTurns: 0,
  enabledSteps: DEFAULT_ENABLED_STEPS,
}

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
  label, sub, icon, value, min, onDec, onInc, incDisabled,
}: {
  label: string; sub: string; icon: React.ReactNode;
  value: number; min: number;
  onDec: () => void; onInc: () => void; incDisabled?: boolean;
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
          disabled={incDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" /> Back
    </button>
  )
}

/* ────────────────────────────────────── */
/* ONBOARDING                              */
/* ────────────────────────────────────── */
function Onboarding({ onComplete, formOptions }: { onComplete: (prefs: Preferences) => void; formOptions: FormOptions }) {
  const { groups: GROUP_OPTIONS, interests: INTEREST_OPTIONS, durations: DURATION_OPTIONS_RAW, budgets: BUDGET_OPTIONS, maxMultiDayDays, maxInterests, enabledSteps } = formOptions
  // Multi-day planning is hidden for now — single-day itineraries only. Filter
  // here so it's gone whether the options come from admin config or the static
  // fallback, and the day-count step can never trigger.
  const DURATION_OPTIONS = DURATION_OPTIONS_RAW.filter((o) => o.value !== "multi-day")

  // Step indices: 0=groups 1=interests 2=durations 3=budgets 4=dates.
  // Admin can disable any of them from /admin/ai-systems/planner-chat;
  // disabled steps are skipped and their fields fall back to sensible
  // defaults so the AI still receives a complete Preferences object.
  const STEP_KEYS = ["groups", "interests", "durations", "budgets", "dates"] as const
  const stepEnabled = (i: number) => enabledSteps[STEP_KEYS[i]]
  const enabledIdxs = [0, 1, 2, 3, 4].filter(stepEnabled)

  function defaultsForSkippedStep(i: number, p: Preferences): Preferences {
    switch (STEP_KEYS[i]) {
      case "groups":    { const dp = defaultPartyFor("solo"); return { ...p, group: "solo", adults: dp.adults, children: dp.children } }
      case "interests": return { ...p, interests: [] }
      case "durations": return { ...p, duration: "any", dayCount: 1 }
      case "budgets":   return { ...p, budget: "any" }
      case "dates":     return { ...p, startDate: todayYMD() }
    }
  }

  // First enabled step (or -1 if every step is disabled — in which case
  // we complete immediately with a fully-defaulted Preferences object).
  const initialStep = enabledIdxs[0] ?? -1

  // Pre-fill defaults for every step that's disabled *before* the first
  // enabled one — otherwise those fields would stay empty (e.g. an empty
  // `group` slug breaks the AI's group-aware tooling) since `goNext`
  // only fills steps it walks past.
  const initialPrefs: Preferences = (() => {
    let merged = EMPTY_PREFS
    const upTo = initialStep === -1 ? 5 : initialStep
    for (let i = 0; i < upTo; i++) merged = defaultsForSkippedStep(i, merged)
    return merged
  })()

  const [step, setStep] = useState(initialStep)
  const [prefs, setPrefs] = useState<Preferences>(initialPrefs)
  const [askDays, setAskDays] = useState(false)
  const [askParty, setAskParty] = useState(false)

  // Edge case: every step disabled → bypass wizard with defaults.
  useEffect(() => {
    if (initialStep !== -1) return
    onComplete(initialPrefs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Move past step `from`. Skipped steps are filled with defaults so
   *  the AI still has a complete Preferences object even when the
   *  admin hides a question. */
  function goNext(from: number, basePrefs: Preferences) {
    let merged = basePrefs
    for (let i = from + 1; i < 5; i++) {
      if (stepEnabled(i)) {
        setPrefs(merged)
        setStep(i)
        return
      }
      merged = defaultsForSkippedStep(i, merged)
    }
    setPrefs(merged)
    onComplete(merged)
  }

  /** Move back to the previous enabled step. Disabled steps are walked over,
   *  and already-filled field values are preserved. */
  function goPrev(from: number) {
    for (let i = from - 1; i >= 0; i--) {
      if (stepEnabled(i)) { setStep(i); return }
    }
  }
  const hasPrev = (i: number) => enabledIdxs.some((e) => e < i)

  /** Skip ONLY the current step: apply its sensible default and advance to
   *  the next enabled step (or finish). Other steps' selections are untouched. */
  function skipStep() {
    setAskParty(false)
    setAskDays(false)
    goNext(step, defaultsForSkippedStep(step, prefs))
  }

  /** Skip the current step AND all remaining ones — jump straight to the chat.
   *  Any step the visitor already answered keeps its value; only empty fields
   *  get a default so the AI still receives a complete Preferences object. */
  function skipAll() {
    let merged: Preferences = { ...prefs }
    for (let i = step; i < 5; i++) {
      if (!stepEnabled(i)) continue
      switch (STEP_KEYS[i]) {
        case "groups":
          if (!merged.group) { const dp = defaultPartyFor("solo"); merged = { ...merged, group: "solo", adults: dp.adults, children: dp.children } }
          break
        case "interests":
          break // keep whatever (if anything) was already chosen
        case "durations":
          if (!merged.duration) merged = { ...merged, duration: "any", dayCount: 1 }
          break
        case "budgets":
          if (!merged.budget) merged = { ...merged, budget: "any" }
          break
        case "dates":
          if (!merged.startDate) merged = { ...merged, startDate: todayYMD() }
          break
      }
    }
    setAskParty(false)
    setAskDays(false)
    onComplete(merged)
  }

  function selectGroup(value: string) {
    const party = defaultPartyFor(value)
    const next = { ...prefs, group: value, adults: party.adults, children: party.children }
    setPrefs(next)
    if (value === "family" || value === "friends") {
      setAskParty(true)
    } else {
      setAskParty(false)
      setTimeout(() => goNext(0, next), 200)
    }
  }
  function bumpAdults(delta: number) {
    setPrefs((p) => {
      const adults = Math.max(1, p.adults + delta)
      if (adults + p.children > MAX_PARTY) return p
      return { ...p, adults }
    })
  }
  function bumpChildren(delta: number) {
    setPrefs((p) => {
      const children = Math.max(0, p.children + delta)
      if (p.adults + children > MAX_PARTY) return p
      return { ...p, children }
    })
  }
  function confirmParty() {
    setAskParty(false)
    goNext(0, prefs)
  }
  function toggleInterest(value: string) {
    setPrefs((p) => {
      const has = p.interests.includes(value)
      return { ...p, interests: has ? p.interests.filter((v) => v !== value) : p.interests.length < maxInterests ? [...p.interests, value] : p.interests }
    })
  }
  function selectDuration(value: string) {
    const next = { ...prefs, duration: value, dayCount: value === "multi-day" ? Math.max(2, prefs.dayCount || 2) : 1 }
    setPrefs(next)
    if (value === "multi-day") {
      setAskDays(true)
    } else {
      setAskDays(false)
      setTimeout(() => goNext(2, next), 200)
    }
  }
  function bumpDays(delta: number) {
    setPrefs((p) => ({ ...p, dayCount: Math.max(2, Math.min(maxMultiDayDays, (p.dayCount || 2) + delta)) }))
  }
  function confirmDays() {
    setAskDays(false)
    goNext(2, prefs)
  }
  function selectBudget(value: string) {
    const updated = { ...prefs, budget: value }
    setPrefs(updated)
    setTimeout(() => goNext(3, updated), 200)
  }
  function selectStartDate(value: string) {
    const updated = { ...prefs, startDate: value }
    setPrefs(updated)
    setTimeout(() => goNext(4, updated), 300)
  }

  const questions = [
    "Hey there! Let me help plan your perfect day in Luxembourg. First -- who's joining today?",
    `Great choice! Now, what sounds good to you? Pick up to ${maxInterests} interest${maxInterests === 1 ? "" : "s"}.`,
    "How much time do you have for exploring?",
    "What's your vibe for the day?",
    "When are you visiting? I'll match real timeslots and any current deals to your date.",
  ]
  const partyQuestion = prefs.group === "family"
    ? "Got it — how many adults and kids are coming?"
    : "Awesome — how many of you are in the group?"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 px-4 pt-4">
        {enabledIdxs.map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      {/* Shared navigation bar — Back (when there's a previous step) on the
          left, Skip / Skip all on the right. Hidden during the party / days
          sub-steppers, which carry their own Back + Continue controls. */}
      {!(step === 0 && askParty) && !(step === 2 && askDays) && step >= 0 && (
        <div className="flex items-center justify-between px-4 pt-3">
          {hasPrev(step) ? (
            <BackButton onClick={() => goPrev(step)} />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={skipStep}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="onboarding-skip-step"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={skipAll}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="onboarding-skip-all"
            >
              Skip all
            </button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
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
            {GROUP_OPTIONS.map((opt) => {
              const Icon = GROUP_ICONS[opt.value] ?? Users
              return (
                <button key={opt.value} type="button" onClick={() => selectGroup(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-sm font-medium transition-all ${prefs.group === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                  <Icon className="h-6 w-6" /><span>{opt.label}</span>
                </button>
              )
            })}
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
              incDisabled={prefs.adults + prefs.children >= MAX_PARTY}
            />
            <PartyStepper
              label="Children"
              sub="Ages 0-12"
              icon={<Baby className="h-5 w-5" />}
              value={prefs.children}
              min={0}
              onDec={() => bumpChildren(-1)}
              onInc={() => bumpChildren(+1)}
              incDisabled={prefs.adults + prefs.children >= MAX_PARTY}
            />
            <p className="px-1 text-[10px] text-muted-foreground">Up to {MAX_PARTY} people total</p>
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
                const Icon = INTEREST_ICONS[opt.value] ?? Sparkles
                return (
                  <button key={opt.value} type="button" onClick={() => toggleInterest(opt.value)}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all ${selected ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-foreground hover:border-primary/30"}`}>
                    <Icon className="h-4 w-4 shrink-0" /><span className="text-left text-xs">{opt.label}</span>
                    {selected && <Check className="ml-auto h-3.5 w-3.5" />}
                  </button>
                )
              })}
            </div>
            <p className="text-center text-[10px] text-muted-foreground" data-testid="interest-count">{prefs.interests.length}/{maxInterests} selected</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" disabled={prefs.interests.length === 0} onClick={() => goNext(1, prefs)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
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
            {/* De-dupe by value so calendar collisions (e.g. tomorrow IS
                the weekend, or today IS the weekend) don't render two
                buttons with the same key. First occurrence wins so the
                more specific label ("Today"/"Tomorrow") is preferred
                over the generic "This weekend". */}
            {(() => {
              const raw = [
                { value: todayYMD(),       label: "Today" },
                { value: tomorrowYMD(),    label: "Tomorrow" },
                { value: nextWeekendYMD(), label: "This weekend" },
              ]
              const seen = new Set<string>()
              return raw.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
            })().map((opt) => (
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
function TripCard({
  trip,
  onSelect,
  isInCart,
  onAdd,
  isBookmarked,
  onToggleBookmark,
  availableDates,
}: {
  trip: Trip
  onSelect: (trip: Trip) => void
  /** Whether the trip is in the working planner ("My Trip") list. */
  isInCart: boolean
  onAdd: (trip: Trip) => void
  /** Whether the trip is in the site-wide Saved Trips library (bookmark). */
  isBookmarked: boolean
  onToggleBookmark: (trip: Trip) => void
  /** When provided, render the trip's bookable dates (within the scan window)
   *  as small chips — used for the "Available on other dates" group. */
  availableDates?: string[]
}) {
  // One-tick guard: cart state is render-time, so a fast double-click /
  // double-tap could fire onAdd twice before isInCart re-renders. We flip
  // a local "pending" flag synchronously on the first activation and use
  // it to disable the button until the next render.
  const [adding, setAdding] = useState(false)

  function handleAddClick(e: React.MouseEvent) {
    // Stop the click from bubbling to the parent <div role=button> so the
    // trip detail panel doesn't also open.
    e.stopPropagation()
    e.preventDefault()
    if (isInCart || adding) return
    setAdding(true)
    onAdd(trip)
  }
  function handleBookmarkClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    onToggleBookmark(trip)
  }
  function handleCardKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect(trip)
    }
  }
  return (
    // Switched from <button> to <div role=button> so we can nest the
    // hover "Add to My Trip" pill (which is itself interactive) without
    // producing invalid nested-button HTML.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(trip)}
      onKeyDown={handleCardKey}
      data-testid={`planner-trip-card-${trip.id}`}
      data-in-cart={isInCart ? "true" : "false"}
      className="group relative flex flex-col items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:flex-row"
    >
      {/* Thumbnail — full-width on top for mobile (stacked), side column on tablet/desktop */}
      <div className="relative h-44 w-full shrink-0 overflow-hidden md:h-auto md:w-44">
        <Image src={trip.image} alt={trip.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(min-width: 768px) 180px, 100vw" />
        {trip.badge && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">{trip.badge}</span>
        )}

        {/* Top-left bookmark control (Saved Trips library). A clean circular
            badge with a centered outline bookmark; it fills solid when saved,
            and only appears on hover/focus (or always, on touch) otherwise. */}
        <button
          type="button"
          onClick={handleBookmarkClick}
          data-testid={`planner-trip-bookmark-${trip.id}`}
          aria-pressed={isBookmarked}
          aria-label={isBookmarked ? `Remove ${trip.title} from saved trips` : `Save ${trip.title} to saved trips`}
          title={isBookmarked ? "Saved Trip" : "Save to My Trips"}
          className={`absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-slate-900/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            isBookmarked ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          }`}
        >
          <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-white" : "fill-none"}`} strokeWidth={2} />
        </button>
      </div>

      {/* Tablet/desktop (md+): top-right hover overlay for the "Add to planner list"
          control (the working "My Trip" list). On mobile this is hidden in favour
          of a permanent full-width button below the content. */}
      <div className="absolute right-2 top-2 z-10 hidden items-center gap-1.5 md:flex">
        {isInCart ? (
          <span
            className="pointer-events-none flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            data-testid={`planner-trip-added-${trip.id}`}
            aria-label="Added to planner list"
          >
            <Check className="h-3 w-3" /> Added to list
          </span>
        ) : (
          <button
            type="button"
            onClick={handleAddClick}
            disabled={adding}
            data-testid={`planner-trip-add-${trip.id}`}
            aria-label={`Add ${trip.title} to planner list`}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <Plus className="h-3 w-3" /> Add to planner list
          </button>
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground">
            <span className="flex shrink-0 items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{trip.rating}</span>
            <span className="flex shrink-0 items-center gap-0.5"><Clock className="h-3 w-3" />{trip.duration}</span>
            {trip.city && <span className="flex min-w-0 items-center gap-0.5"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{trip.city}</span></span>}
          </div>
          <div className="flex shrink-0 items-baseline gap-1.5">
            {trip.originalPrice && <span className="text-xs text-muted-foreground line-through">{trip.originalPrice.toFixed(0)}&euro;</span>}
            <span className="text-base font-bold text-foreground">{trip.price > 0 ? `${trip.price.toFixed(0)}\u20AC` : "Free"}</span>
          </div>
        </div>
        {availableDates && availableDates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" data-testid={`planner-trip-dates-${trip.id}`}>
            <span className="text-[10px] font-medium text-muted-foreground">Available:</span>
            {availableDates.slice(0, 4).map((d) => (
              <span key={d} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{formatYMDPretty(d)}</span>
            ))}
            {availableDates.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{availableDates.length - 4} more</span>
            )}
          </div>
        )}

        {/* Mobile: permanent, full-width "Add to planner list" action so no hover
            is needed and it never overlaps the title. Hidden on tablet/desktop,
            where the top-right hover overlay is used instead. */}
        <div className="md:hidden">
          {isInCart ? (
            <span
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
              data-testid={`planner-trip-added-mobile-${trip.id}`}
              aria-label="Added to planner list"
            >
              <Check className="h-3.5 w-3.5" /> Added to list
            </span>
          ) : (
            <button
              type="button"
              onClick={handleAddClick}
              disabled={adding}
              data-testid={`planner-trip-add-mobile-${trip.id}`}
              aria-label={`Add ${trip.title} to planner list`}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:bg-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> Add to planner list
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────── */
/*  EDITABLE PREFERENCE BAR                */
/*  Each pill opens a Popover that edits   */
/*  ONLY that field (single-pref editing). */
/*  Patches go through applyDirectPref so   */
/*  recs rebuild deterministically and chat */
/*  history is preserved.                    */
/* ────────────────────────────────────── */
function PrefPill({
  label,
  value,
  icon: Icon,
  testid,
  contentClassName,
  children,
}: {
  label: string
  value: string
  icon?: LucideIcon
  testid?: string
  contentClassName?: string
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          title={`Edit ${label.toLowerCase()}`}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-foreground capitalize transition-colors hover:bg-secondary/70 hover:ring-1 hover:ring-primary/40"
        >
          {Icon && <Icon className="h-3 w-3" />}
          {value}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-56 p-2", contentClassName)}>
        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

function EditablePrefsBar({
  prefs,
  formOptions,
  onPatch,
  onReset,
}: {
  prefs: Preferences
  formOptions: FormOptions
  onPatch: (patch: Partial<Preferences>) => void
  onReset: () => void
}) {
  const groupLabel = formOptions.groups.find((g) => g.value === prefs.group)?.label ?? prefs.group
  const partyTotal = Math.max(1, prefs.adults || 1) + Math.max(0, prefs.children || 0)
  const durationLabel = formOptions.durations.find((d) => d.value === prefs.duration)?.label ?? prefs.duration
  const budgetLabel = formOptions.budgets.find((b) => b.value === prefs.budget)?.label ?? prefs.budget
  const interestLabel = (v: string) => formOptions.interests.find((i) => i.value === v)?.label ?? v

  const toggleInterest = (val: string) => {
    const has = prefs.interests.includes(val)
    const next = has
      ? prefs.interests.filter((v) => v !== val)
      : prefs.interests.length < formOptions.maxInterests
        ? [...prefs.interests, val]
        : prefs.interests
    onPatch({ interests: next })
  }

  const optionRow = (active: boolean, onClick: () => void, label: string, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs capitalize hover:bg-secondary",
        active && "bg-secondary font-medium text-primary",
      )}
    >
      <span>{label}</span>
      {active && <Check className="h-3.5 w-3.5" />}
    </button>
  )

  return (
    <div
      data-testid="planner-prefs-bar"
      className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2"
    >
      {/* Date */}
      {formOptions.enabledSteps.dates && (
        <PrefPill
          label="Visit date"
          value={prefs.startDate ? formatYMDPretty(prefs.startDate) : "Any date"}
          icon={Calendar}
          testid="prefpill-date"
        >
          {(close) => (
            <div className="flex flex-col gap-1.5">
              <input
                type="date"
                min={todayYMD()}
                value={prefs.startDate || ""}
                onChange={(e) => {
                  if (e.target.value) onPatch({ startDate: e.target.value })
                }}
                data-testid="prefpill-date-input"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
              <div className="grid grid-cols-3 gap-1">
                {([["Today", todayYMD()], ["Tomorrow", tomorrowYMD()], ["Weekend", nextWeekendYMD()]] as const).map(
                  ([lbl, val]) =>
                    optionRow(prefs.startDate === val, () => { onPatch({ startDate: val }); close() }, lbl, lbl),
                )}
              </div>
            </div>
          )}
        </PrefPill>
      )}

      {/* Group */}
      {formOptions.enabledSteps.groups && (
        <PrefPill label="Who's coming" value={groupLabel} testid="prefpill-group">
          {(close) => (
            <div className="flex flex-col gap-0.5">
              {formOptions.groups.map((g) =>
                optionRow(prefs.group === g.value, () => { onPatch({ group: g.value }); close() }, g.label, g.value),
              )}
            </div>
          )}
        </PrefPill>
      )}

      {/* Group size (party) — display + adjustable, capped at MAX_PARTY */}
      {formOptions.enabledSteps.groups && (
        <PrefPill
          label="Group size"
          value={`${partyTotal} ${partyTotal === 1 ? "person" : "people"}`}
          icon={Users}
          testid="prefpill-party"
          contentClassName="w-72"
        >
          {() => (
            <div className="flex flex-col gap-2">
              <PartyStepper
                label="Adults"
                sub="Ages 13+"
                icon={<UserRound className="h-5 w-5" />}
                value={prefs.adults}
                min={1}
                onDec={() => onPatch({ adults: Math.max(1, prefs.adults - 1) })}
                onInc={() => { if (partyTotal < MAX_PARTY) onPatch({ adults: prefs.adults + 1 }) }}
                incDisabled={partyTotal >= MAX_PARTY}
              />
              <PartyStepper
                label="Children"
                sub="Ages 0-12"
                icon={<Baby className="h-5 w-5" />}
                value={prefs.children}
                min={0}
                onDec={() => onPatch({ children: Math.max(0, prefs.children - 1) })}
                onInc={() => { if (partyTotal < MAX_PARTY) onPatch({ children: prefs.children + 1 }) }}
                incDisabled={partyTotal >= MAX_PARTY}
              />
              <p className="px-1 text-[10px] text-muted-foreground">Up to {MAX_PARTY} people total</p>
            </div>
          )}
        </PrefPill>
      )}

      {/* Interests (multi-select toggle) */}
      {formOptions.enabledSteps.interests &&
        prefs.interests.map((i) => (
          <PrefPill key={i} label="Interests" value={interestLabel(i)} testid={`prefpill-interest-${i}`}>
            {() => (
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                <p className="px-1 pb-1 text-[10px] text-muted-foreground">
                  Pick up to {formOptions.maxInterests}
                </p>
                {formOptions.interests.map((opt) =>
                  optionRow(
                    prefs.interests.includes(opt.value),
                    () => toggleInterest(opt.value),
                    opt.label,
                    opt.value,
                  ),
                )}
              </div>
            )}
          </PrefPill>
        ))}

      {/* Duration */}
      {formOptions.enabledSteps.durations && (
        <PrefPill label="Time available" value={durationLabel} testid="prefpill-duration">
          {(close) => (
            <div className="flex flex-col gap-0.5">
              {formOptions.durations.map((d) =>
                optionRow(prefs.duration === d.value, () => { onPatch({ duration: d.value }); close() }, d.label, d.value),
              )}
            </div>
          )}
        </PrefPill>
      )}

      {/* Budget */}
      {formOptions.enabledSteps.budgets && (
        <PrefPill label="Budget" value={budgetLabel} testid="prefpill-budget">
          {(close) => (
            <div className="flex flex-col gap-0.5">
              {formOptions.budgets.map((b) =>
                optionRow(prefs.budget === b.value, () => { onPatch({ budget: b.value }); close() }, b.label, b.value),
              )}
            </div>
          )}
        </PrefPill>
      )}

      <button
        type="button"
        onClick={onReset}
        className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground"
        title="Reset preferences"
        data-testid="planner-prefs-reset"
      >
        <RotateCcw className="h-3 w-3" />
      </button>
    </div>
  )
}

/* ────────────────────────────────────── */
/*  MAIN PAGE                              */
/* ────────────────────────────────────── */
export default function PlannerPage() {
  const wx = useMemo(deriveWx, [])
  const { temp, humidity, wind, condition } = weatherData.current
  // Working "My Trip" list (planner-local, persists across refreshes) — the
  // itinerary builds from THIS. Separate from the site-wide Saved Trips library.
  const planner = usePlannerList()
  const { addItem, totalItems, items, removeItem, clearList, hydrated: cartHydrated } = planner
  const isInCart = planner.isInList
  // Site-wide Saved Trips library (the bookmark button) — long-lived collection.
  const savedLibrary = useCart()
  // Trip ids disabled in the working list (no timeslots on the planned date).
  // Mirrored into a ref so the async build paths declared above can exclude them.
  const plannerDisabledIdsRef = useRef<Set<string>>(new Set<string>())

  /* State */
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [hydrated, setHydrated] = useState(false)
  // Onboarding form (group/interest/duration/budget options + multi-day cap)
  // is admin-managed from /admin/ai-systems/chat. Loaded once on mount from
  // the public /api/planner/form-config endpoint so admin changes flow
  // through without a deploy. Falls back to bundled defaults on error.
  const [formOptions, setFormOptions] = useState<FormOptions>(DEFAULT_FORM_OPTIONS)
  // Public-visibility gate. The admin can hide the planner from non-logged-in
  // visitors. `null` = still checking, `true` = hidden for this visitor.
  const [plannerHidden, setPlannerHidden] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/planner/visibility", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hidden?: boolean } | null) => {
        if (!cancelled) setPlannerHidden(data?.hidden === true)
      })
      .catch(() => { if (!cancelled) setPlannerHidden(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    fetch("/api/planner/form-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Partial<FormOptions> | null) => {
        if (cancelled || !data) return
        const sane = (arr: unknown, fb: { value: string; label: string }[]) =>
          Array.isArray(arr) && arr.length > 0
            ? arr.filter((o): o is { value: string; label: string } => !!o && typeof o === "object" && typeof (o as { value?: unknown }).value === "string" && typeof (o as { label?: unknown }).label === "string")
            : fb
        const days = Number(data.maxMultiDayDays)
        const maxI = Number(data.maxInterests)
        const maxTurns = Number(data.maxChatTurns)
        setFormOptions({
          groups: sane(data.groups, DEFAULT_GROUP_OPTIONS),
          interests: sane(data.interests, DEFAULT_INTEREST_OPTIONS),
          durations: sane(data.durations, DEFAULT_DURATION_OPTIONS),
          budgets: sane(data.budgets, DEFAULT_BUDGET_OPTIONS),
          maxMultiDayDays: Number.isFinite(days) && days >= 2 && days <= 14 ? days : 2,
          maxInterests: Number.isFinite(maxI) && maxI >= 1 ? Math.floor(maxI) : 3,
          maxChatTurns: Number.isFinite(maxTurns) && maxTurns >= 0 ? Math.floor(maxTurns) : 0,
          enabledSteps: (() => {
            const raw = (data as { enabledSteps?: Partial<EnabledSteps> }).enabledSteps
            if (!raw || typeof raw !== "object") return DEFAULT_ENABLED_STEPS
            const pick = (k: keyof EnabledSteps) =>
              typeof raw[k] === "boolean" ? (raw[k] as boolean) : DEFAULT_ENABLED_STEPS[k]
            return { groups: pick("groups"), interests: pick("interests"), durations: pick("durations"), budgets: pick("budgets"), dates: pick("dates") }
          })(),
        })
      })
      .catch(() => { /* keep defaults */ })
    return () => { cancelled = true }
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cartOpen, setCartOpen] = useState(false)
  const [input, setInput] = useState("")
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "up" | "down">>({})
  const [centerItinerary, setCenterItinerary] = useState<Itinerary | null>(null)
  // Per-leg travel mode (Car / Cycling / Walking) keyed by the from-step's FULL
  // index in centerItinerary.steps — the same index space the sidebar selector
  // and the canvas map use. Seeded from each leg's recommended mode whenever the
  // plan's trip set changes, then overridable per leg. Drives the canvas route,
  // the PDF map AND the maps deep link so all three stay identical.
  const [legMethods, setLegMethods] = useState<Record<number, TravelMethod>>({})
  const handleLegMethodChange = useCallback((legIndex: number, method: TravelMethod) => {
    setLegMethods((prev) => ({ ...prev, [legIndex]: method }))
  }, [])
  // Read centerItinerary through a ref inside the seeding effect so the effect
  // re-seeds ONLY when the trip set changes (fingerprint), not on every benign
  // object-identity change — which would wipe the visitor's per-leg overrides.
  const centerItineraryRef = useRef<Itinerary | null>(centerItinerary)
  useEffect(() => { centerItineraryRef.current = centerItinerary }, [centerItinerary])
  const itineraryLegFingerprint = useMemo(
    () => (centerItinerary?.steps ?? []).map((s) => s.tripId).join("|"),
    [centerItinerary],
  )
  useEffect(() => {
    const it = centerItineraryRef.current
    if (!it || it.steps.length === 0) {
      setLegMethods({})
      return
    }
    const seed: Record<number, TravelMethod> = {}
    it.steps.forEach((s, i) => {
      if (!it.steps[i + 1]) return
      seed[i] = recommendedTravelMethod(s.travelLeg)
    })
    setLegMethods(seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryLegFingerprint])
  // PDF export of the active/latest day itinerary (canvas + chat-card buttons).
  // Always prefers the full plan loaded on the Trip Canvas (it carries map
  // coords, tips, prices); falls back to a chat card's lighter plan only when
  // nothing is loaded yet.
  const [downloadingItineraryPdf, setDownloadingItineraryPdf] = useState(false)
  const handleDownloadItineraryPdf = useCallback(async (fallback?: Itinerary | null) => {
    if (downloadingItineraryPdf) return
    const target = centerItinerary ?? fallback ?? null
    if (!target) return
    setDownloadingItineraryPdf(true)
    try {
      // Pass the per-leg modes so the PDF map + deep link match the canvas —
      // but only when exporting the on-canvas plan the modes belong to (a
      // lighter chat-card fallback has its own, unrelated leg indices).
      await downloadItineraryPdf(target, target === centerItinerary ? { legMethods } : undefined)
    } catch {
      /* swallow — a failed export must never break the planner */
    } finally {
      setDownloadingItineraryPdf(false)
    }
  }, [downloadingItineraryPdf, centerItinerary, legMethods])
  // Visibility of the full-screen modal is now decoupled from the
  // itinerary DATA. Closing the modal previously cleared centerItinerary,
  // which (a) wiped localStorage and (b) flipped the sidebar back to
  // "Build" even though the plan was already built. We now only flip
  // this flag on close and keep the data intact for re-opening / reload.
  const [centerItineraryOpen, setCenterItineraryOpen] = useState(false)
  // Confirmation gate for the "reset chat" button — wiping the chat, prefs,
  // trip list and itinerary is destructive, so we ask first.
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [itineraryRegenerating, setItineraryRegenerating] = useState(false)
  const itineraryRestoredRef = useRef(false)
  // Bidirectional list↔map sync. activeStopIndex/activeLegIndex are indexed
  // against itineraryMapTrips / itineraryMapCoords (the rendered stop list),
  // which is what the map and the panel agree on.
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null)
  const [activeLegIndex, setActiveLegIndex] = useState<number | null>(null)
  const mapSectionRef = useRef<HTMLDivElement | null>(null)
  // List → map: clicking a stop's location focuses its pin (and expands +
  // scrolls the map into view so the highlight is visible).
  const handleFocusStop = useCallback((index: number) => {
    setActiveLegIndex(null)
    setActiveStopIndex(index)
    setMapExpanded(true)
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])
  const handleFocusLeg = useCallback((index: number) => {
    setActiveStopIndex(null)
    setActiveLegIndex(index)
    setMapExpanded(true)
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])
  // Map → list: clicking a pin/route updates active state; the panel's own
  // effect scrolls the matching card into view.
  const handleMapStopClick = useCallback((index: number) => {
    setActiveLegIndex(null)
    setActiveStopIndex(index)
  }, [])
  const handleMapLegClick = useCallback((index: number) => {
    setActiveStopIndex(null)
    setActiveLegIndex(index)
  }, [])
  // Reset focus whenever the itinerary changes or the panel closes.
  useEffect(() => {
    setActiveStopIndex(null)
    setActiveLegIndex(null)
  }, [centerItinerary, centerItineraryOpen])
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

  // ── Viewport-fit height ────────────────────────────────────────────────────
  // The planner is a fixed-height, internally-scrolling app shell. It sits BELOW
  // the global announcement banner (a normal-flow block of dynamic height), so a
  // plain `h-screen` (100vh) overflows the viewport by exactly the banner height
  // — pushing the chat input and the smart-itinerary panel off-screen. We size
  // the shell to the space actually left under the banner: 100dvh minus whatever
  // is stacked above the planner root. Recomputed on resize and whenever the
  // banner appears/disappears or changes size (ResizeObserver on <body>).
  const shellRef = useRef<HTMLDivElement>(null)
  const [shellHeight, setShellHeight] = useState<string>("100dvh")
  useLayoutEffect(() => {
    const measure = () => {
      const el = shellRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const avail = Math.max(0, window.innerHeight - top)
      setShellHeight(`${avail}px`)
    }
    measure()
    window.addEventListener("resize", measure)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure)
      ro.observe(document.body)
    }
    return () => {
      window.removeEventListener("resize", measure)
      ro?.disconnect()
    }
    // The shell's top offset only changes when the banner above it changes
    // size/visibility — the ResizeObserver on <body> + resize listener cover
    // that, so we bind once and avoid rebind churn on every prefs change.
  }, [])

  const handleOpenItinerary = useCallback((itinerary: Itinerary) => {
    setCenterItinerary(itinerary)
    setCenterItineraryOpen(true)
    // On mobile/tablet the right-side cart drawer is the only surface
    // that can host the itinerary panel — make sure it's open so the
    // panel is actually visible after build / view. On desktop the
    // canvas lives in the center column and the cart drawer is a
    // separate slide-over, so opening it on every "View Itinerary"
    // click is unwanted UI noise (user complaint, May 2026). Gate the
    // auto-open behind a viewport check so mobile still works.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setCartOpen(true)
    }
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
  // Ordered list of Trip objects matching the itinerary's steps — fed to
  // the map so it can render numbered pins (1..N) and connect them with
  // a driving route polyline. Only shown while the itinerary panel is
  // actually open so closing the panel returns the map to "search
  // results" mode.
  // Single source of truth for the itinerary map: trips, per-stop coords, and
  // the FULL-STEP index each rendered marker maps back to — all three skip the
  // same unresolved steps so they stay aligned with each other AND with the
  // panel (which indexes by full itinerary.steps). `stepIndices[k]` is the full
  // step index of the k-th rendered marker; when every step resolves this is
  // the identity [0,1,2,…].
  const itineraryMap = useMemo<{
    trips: Trip[]
    coords: ([number, number] | null)[]
    stepIndices: number[]
  } | undefined>(() => {
    if (!centerItinerary || !centerItineraryOpen) return undefined
    const byId = new Map<string, Trip>()
    for (const t of allTrips) byId.set(t.id, t)
    for (const ci of items) byId.set(ci.trip.id, ci.trip)
    const trips: Trip[] = []
    const coords: ([number, number] | null)[] = []
    const stepIndices: number[] = []
    centerItinerary.steps.forEach((s, fullIdx) => {
      const t = byId.get(s.tripId)
      if (!t) return
      trips.push(t)
      coords.push(
        typeof s.lat === "number" && typeof s.lng === "number"
          ? [s.lng, s.lat]
          : null,
      )
      stepIndices.push(fullIdx)
    })
    return trips.length > 0 ? { trips, coords, stepIndices } : undefined
  }, [centerItinerary, centerItineraryOpen, allTrips, items])
  const itineraryMapTrips = itineraryMap?.trips
  const itineraryMapCoords = itineraryMap?.coords
  const itineraryMapStepIndices = itineraryMap?.stepIndices

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

  // Forward-declared so it can be referenced by callbacks above the
  // useChat declaration. Re-assigned right after useChat resolves.
  const lastAutoBuiltToolCallIdRef = useRef<string | null>(null)
  /* Synchronous lock — set the instant a tool-buildItinerary effect run
     begins its async work, cleared in the finally. Without this lock,
     every intermediate state change inside the async chain (addItem
     calls updating `items`, setItineraryRegenerating, etc.) re-triggers
     the effect, which then passes the `lastAutoBuiltToolCallIdRef`
     guard (still null until success) and spawns ANOTHER concurrent
     async flight for the same toolCallId. With ~10 trips and ~7
     state-change retriggers, a single chat plan can end up calling
     addItem 70+ times, multiplying cart quantities to absurd values
     (visitor reported "21 counts on multiple trips"). The completed-
     build ref is the long-lived "we already finished this plan" lock;
     this ref is the short-lived "an async run is currently in flight
     for this toolCallId" lock. */
  const inFlightAutoBuildToolCallIdRef = useRef<string | null>(null)
  /* Composite-key marker for preflight NEEDS_DECISION outcomes. The
     simple toolCallId-only marker above can't distinguish "already
     built successfully" from "already preflighted and waiting for the
     visitor to resolve a conflict" — when the visitor THEN changes
     prefs (e.g. picks full-day) or cart (drops a trip), the same
     toolCallId is still in the chat but the inputs have changed and a
     fresh preflight is warranted. Key = `${toolCallId}|${prefsFp}|
     ${cartFp}` so any change to prefs or cart invalidates it. */
  const preflightFailedKeyRef = useRef<string | null>(null)
  /* Per-toolCallId UI state for the inline chat card that renders the AI's
     buildItinerary sketch. While the preflight is running we replace the
     card's "Your Day Itinerary" + View button with a "Checking availability"
     stub so the visitor never sees a confident-looking plan card next to a
     "this can't be built" question. Once preflight settles:
       • READY        → entry deleted, card renders the live steps + View button.
       • NEEDS_DECISION → entry set to "decision", card shows a one-liner
                          pointing the visitor at the chat question above it. */
  const [preflightCardState, setPreflightCardState] = useState<Record<string, "checking" | "decision" | "ready">>({})
  /* Forward reference to useChat's `setMessages` so earlier handlers
     (handleOpenOrRebuildFromChat, handleRegenerateItinerary) can push
     truthful failure messages into the chat without forcing useChat —
     and all its tool callbacks — to be declared above them. Assigned in
     an effect just after useChat below. */
  const setMessagesRef = useRef<((updater: (prev: PlannerMessage[]) => PlannerMessage[]) => void) | null>(null)

  /* Push a concise assistant "note" into the chat so MANUAL interactions
     (adding a trip from the canvas/modal, changing the date or a preference
     in the filter bar) are mirrored in the conversation — the same way an
     AI-driven change leaves a trace. These notes also become part of the
     message history sent to /api/planner on the next turn, reinforcing the
     model's awareness of the current trip list + preferences. De-dupes an
     identical back-to-back note so rapid clicks don't stack copies. */
  const notifyChat = useCallback((text: string, idPrefix: string) => {
    setMessagesRef.current?.((prev) => {
      const last = prev[prev.length - 1]
      const lastText =
        last && last.role === "assistant" && last.parts?.[0]?.type === "text"
          ? (last.parts[0] as { text?: string }).text
          : undefined
      if (lastText === text) return prev
      return [
        ...prev,
        { id: `${idPrefix}-${Date.now()}`, role: "assistant", parts: [{ type: "text", text }] } as PlannerMessage,
      ]
    })
  }, [])

  /* Manual "add to My Trip list" from a canvas card or the trip-detail
     modal. Wraps the raw `addItem` so the chat gets a note — but ONLY for
     genuinely new additions (skips re-adds) so the AI knows the trip list
     grew. AI-driven adds (onToolCall / chat build) keep using raw addItem
     so they don't double-announce. */
  const handleManualAddTrip = useCallback((trip: Trip) => {
    const already = planner.isInList(trip.id)
    addItem(trip)
    if (!already) {
      // Sync the transport ref synchronously so a chat send fired in the same
      // tick as the click already carries the newly added trip.
      cartSummaryForApiRef.current = [...cartSummaryForApiRef.current, { id: trip.id, title: trip.title }]
      notifyChat(`Added **${trip.title}** to your trip list.`, "manual-add")
    }
  }, [addItem, notifyChat, planner])

  /* Called from the "View Itinerary on Trip Canvas" button on the inline
     chat itinerary card. If we already have a real itinerary loaded for
     these exact trips, just open the Canvas. Otherwise (or if the cart
     drifted since the last build) trigger a fresh build via /api/itinerary
     and then open. This guarantees the button always does something
     useful — never a silent no-op like before. */
  const handleOpenOrRebuildFromChat = useCallback(async (planTripIds: string[]) => {
    const existing = centerItinerary
    const existingIds = new Set(existing?.steps.map((s) => s.tripId) ?? [])
    const wanted = new Set(planTripIds)
    const sameSet = existing
      && existingIds.size === wanted.size
      && [...wanted].every((id) => existingIds.has(id))
    // Date-drift guard: only shortcut to "just open" when the loaded plan was
    // built for the SAME date the visitor currently has selected. If the date
    // changed since the last build, the loaded plan is stale (timeslots,
    // weather, day-of-week logic all hinge on the date) — fall through to a
    // fresh rebuild so the Canvas reflects real availability for the new date
    // instead of silently re-opening yesterday's plan.
    const currentDate = prefsRef.current?.startDate || todayYMD()
    const dateMatches = !existing?.visitDate || existing.visitDate === currentDate
    if (sameSet && existing && dateMatches) {
      handleOpenItinerary(existing)
      return
    }
    // Build from the AI plan's trip ids directly — NOT a cart intersection.
    // The chat may have built an itinerary from trips the visitor never
    // added to the cart (e.g. AI recommendations). /api/itinerary now
    // hydrates id-only trips from the DB so this works for any trip id
    // in our catalog. Cart trips with extra fields (title/city/…) are
    // still preferred so we forward those when available.
    // Defensive: drop meal-break placeholder ids (lunch/dinner/coffee/
    // meal_*) — these aren't real trips and would surface as "tcms_lunch
    // unavailable" in the sidebar. Mirrors the auto-build effect filter.
    const isMealBreakId = (id: string) =>
      id === "lunch" || id === "dinner" || id === "coffee"
      || id.startsWith("meal_") || id.startsWith("tcms_lunch")
      || id.startsWith("tcms_dinner") || id.startsWith("tcms_coffee")
    const cleanPlanTripIds = planTripIds.filter((id) => id && !isMealBreakId(id) && !plannerDisabledIdsRef.current.has(id))
    const cartById = new Map(items.map((i) => [i.trip.id, i.trip]))
    const tripsForApi = cleanPlanTripIds.map((id) => {
      const t = cartById.get(id)
      return t ? {
        id: t.id, title: t.title, city: t.city,
        duration: t.duration, category: t.category,
      } : { id }
    })
    if (tripsForApi.length === 0) return
    setItineraryRegenerating(true)
    const visitDate = prefsRef.current?.startDate || todayYMD()
    /* T001: honesty-on-failure shared inline pusher. We don't reach for
       the centralized handlePlanConflict/handleItineraryFailure handlers
       here because they're declared later in the file and pulling them
       up would force a wider refactor. The message shape is identical
       to handleItineraryFailure / handlePlanConflict so the chat reads
       consistently across all four build paths. */
    const pushFailure = (msg: string, alternativeDates: AlternativeDate[] = []) => {
      const lines: string[] = [msg]
      if (alternativeDates.length > 0) {
        const top = alternativeDates.slice(0, 3)
          .map((a) => `**${formatYMDPretty(a.date)}** (${a.tripCount} of your trips open)`)
          .join(", ")
        lines.push(`**Best alternative dates:** ${top}. Want me to rebuild for one of these?`)
      }
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `itinerary-failed-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: lines.join("\n\n") }] } as PlannerMessage,
      ]))
    }
    const pushConflict = (msg: string, conflict: PlanConflictPayload["conflict"]) => {
      const optionLines = conflict.options
        .map((o, i) => `${i + 1}. **${o.label}** — ${o.description}`)
        .join("\n")
      const text = `${msg}\n\n**Options:**\n${optionLines}\n\nTap one in the sidebar, or tell me which you'd like.`
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `plan-conflict-${Date.now()}`, role: "assistant", parts: [{ type: "text", text }] } as PlannerMessage,
      ]))
    }
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trips: tripsForApi,
          startDate: visitDate,
          preferences: prefsRef.current,
        }),
      })
      const data = await res.json().catch(() => null) as
        | (Itinerary & { error?: string; message?: string; alternativeDates?: AlternativeDate[]; conflict?: PlanConflictPayload["conflict"] })
        | null
      if (!res.ok || !data) {
        if (data?.error === "PLAN_CONFLICT" && data.conflict) {
          pushConflict(data.message || "These trips don't fit your chosen duration.", data.conflict)
        } else {
          pushFailure(
            data?.message || "Couldn't open the live itinerary — please try again.",
            data?.alternativeDates || [],
          )
        }
        return
      }
      if (!data?.steps?.length) {
        const allDropped = Array.isArray((data as { unavailableTrips?: unknown }).unavailableTrips)
          ? ((data as { unavailableTrips: ItineraryFailurePayload["unavailableTrips"] }).unavailableTrips)
          : []
        if (allDropped.length > 0) {
          const dateLbl = formatYMDPretty((data as { visitDate?: string }).visitDate || visitDate)
          const names = allDropped.slice(0, 3).map((u) => `**"${u.title}"**`).join(", ")
          const extra = allDropped.length > 3 ? ` (+${allDropped.length - 3} more)` : ""
          pushFailure(
            `None of your trips have a bookable slot on **${dateLbl}** (${names}${extra}), so there's nothing to schedule for that day.`,
            data.alternativeDates || [],
          )
        } else {
          pushFailure(data.message || "The plan came back empty for this date — try a different day.", data.alternativeDates || [])
        }
        return
      }
      setCenterItinerary(data)
      handleOpenItinerary(data)
      // Partial-success honesty: same surfacing as the auto-build effect.
      // Conflicts (saved trips overshoot the visitor's duration) now come
      // back on the success response — surface the prefs-change options
      // in chat so the visitor knows why the canvas has fewer stops than
      // their cart.
      const viewConflict = (data as { conflict?: PlanConflictPayload["conflict"] | null }).conflict
      if (viewConflict) {
        handlePlanConflict({
          message:
            `Your saved trips need more time than your **${viewConflict.currentDuration}** plan allows ` +
            `(${Math.round(viewConflict.estimatedMinutes / 60 * 10) / 10}h needed vs ` +
            `${Math.round(viewConflict.availableMinutes / 60 * 10) / 10}h available). ` +
            `Trip Canvas is showing the **${data.steps.length} stop${data.steps.length === 1 ? "" : "s"}** that fit your current preferences — change duration, pick a different date, or drop a trip to include the rest.`,
          visitDate: (data as { visitDate?: string }).visitDate || visitDate,
          conflict: viewConflict,
        })
        return
      }
      const droppedView = Array.isArray((data as { unavailableTrips?: unknown }).unavailableTrips)
        ? ((data as { unavailableTrips: ItineraryFailurePayload["unavailableTrips"] }).unavailableTrips)
        : []
      if (droppedView.length > 0) {
        const dateLbl = formatYMDPretty((data as { visitDate?: string }).visitDate || visitDate)
        const names = droppedView.slice(0, 2).map((u) => `**"${u.title}"**`).join(" and ")
        const extra = droppedView.length > 2 ? ` (+${droppedView.length - 2} more)` : ""
        const lines = [
          `Heads up — ${droppedView.length} of your requested trip${droppedView.length === 1 ? "" : "s"} ${droppedView.length === 1 ? "isn't" : "aren't"} available on **${dateLbl}** (${names}${extra}), so the Trip Canvas shows ${data.steps.length} stop${data.steps.length === 1 ? "" : "s"} instead.`,
        ]
        const alts = (data as { alternativeDates?: AlternativeDate[] }).alternativeDates || []
        if (alts.length > 0) {
          const top = alts.slice(0, 3).map((a) => `**${formatYMDPretty(a.date)}** (${a.tripCount} of your trips open)`).join(", ")
          lines.push(`**Best alternative dates:** ${top}. Want me to rebuild for one of these?`)
        }
        setMessagesRef.current?.((prev) => ([
          ...prev,
          { id: `itinerary-partial-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: lines.join("\n\n") }] } as PlannerMessage,
        ]))
      }
    } catch {
      pushFailure("Network hiccup while opening your itinerary — please try again in a moment.")
    } finally {
      setItineraryRegenerating(false)
    }
  }, [centerItinerary, items, handleOpenItinerary])

  const handleRegenerateItinerary = useCallback(async () => {
    setItineraryRegenerating(true)
    const visitDate = prefsRef.current?.startDate || todayYMD()
    const pushFailure = (msg: string, alternativeDates: AlternativeDate[] = []) => {
      const lines: string[] = [msg]
      if (alternativeDates.length > 0) {
        const top = alternativeDates.slice(0, 3)
          .map((a) => `**${formatYMDPretty(a.date)}** (${a.tripCount} of your trips open)`)
          .join(", ")
        lines.push(`**Best alternative dates:** ${top}. Want me to rebuild for one of these?`)
      }
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `itinerary-failed-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: lines.join("\n\n") }] } as PlannerMessage,
      ]))
    }
    const pushConflict = (msg: string, conflict: PlanConflictPayload["conflict"]) => {
      const optionLines = conflict.options
        .map((o, i) => `${i + 1}. **${o.label}** — ${o.description}`)
        .join("\n")
      const text = `${msg}\n\n**Options:**\n${optionLines}\n\nTap one in the sidebar, or tell me which you'd like.`
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `plan-conflict-${Date.now()}`, role: "assistant", parts: [{ type: "text", text }] } as PlannerMessage,
      ]))
    }
    try {
      // Exclude trips disabled (no timeslots on the planned date) so we never
      // post known-unbookable trips — matches the sidebar + chat build paths.
      const trips = items
        .filter((i) => !plannerDisabledIdsRef.current.has(i.trip.id))
        .map(i => ({
          id: i.trip.id,
          title: i.trip.title,
          city: i.trip.city,
          duration: i.trip.duration,
          category: i.trip.category,
        }))
      // Always re-read the latest prefs at call time — the dependency array
      // intentionally tracks `prefs` so onboarding changes flow through, but
      // this guards against any stale-closure edge case as well.
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips, startDate: visitDate, preferences: prefsRef.current ?? undefined }),
      })
      const data = await res.json().catch(() => null) as
        | (Itinerary & { error?: string; message?: string; alternativeDates?: AlternativeDate[]; conflict?: PlanConflictPayload["conflict"] })
        | null
      if (!res.ok || !data) {
        if (data?.error === "PLAN_CONFLICT" && data.conflict) {
          pushConflict(data.message || "These trips don't fit your chosen duration.", data.conflict)
        } else {
          pushFailure(
            data?.message || "Couldn't rebuild the itinerary — please try again.",
            data?.alternativeDates || [],
          )
        }
        return
      }
      if (!data?.steps?.length) {
        const allDropped = Array.isArray((data as { unavailableTrips?: unknown }).unavailableTrips)
          ? ((data as { unavailableTrips: ItineraryFailurePayload["unavailableTrips"] }).unavailableTrips)
          : []
        if (allDropped.length > 0) {
          const dateLbl = formatYMDPretty((data as { visitDate?: string }).visitDate || visitDate)
          const names = allDropped.slice(0, 3).map((u) => `**"${u.title}"**`).join(", ")
          const extra = allDropped.length > 3 ? ` (+${allDropped.length - 3} more)` : ""
          pushFailure(
            `None of your trips have a bookable slot on **${dateLbl}** (${names}${extra}), so there's nothing to schedule for that day.`,
            data.alternativeDates || [],
          )
        } else {
          pushFailure(data.message || "The rebuild came back empty for this date — try a different day.", data.alternativeDates || [])
        }
        return
      }
      setCenterItinerary(data)
      // Conflict-on-success: surface prefs-change options if the cart
      // overshot the duration window (canvas already shows best-fit subset).
      const regenConflict = (data as { conflict?: PlanConflictPayload["conflict"] | null }).conflict
      if (regenConflict) {
        pushConflict(
          `Your saved trips need more time than your **${regenConflict.currentDuration}** plan allows ` +
          `(${Math.round(regenConflict.estimatedMinutes / 60 * 10) / 10}h needed vs ` +
          `${Math.round(regenConflict.availableMinutes / 60 * 10) / 10}h available). ` +
          `Trip Canvas is showing the **${data.steps.length} stop${data.steps.length === 1 ? "" : "s"}** that fit your current preferences — change duration, pick a different date, or drop a trip to include the rest.`,
          regenConflict,
        )
      }
    } catch {
      pushFailure("Network hiccup while rebuilding your itinerary — please try again in a moment.")
    } finally {
      setItineraryRegenerating(false)
    }
  }, [items])

  /* ─── Direct single-preference update (no AI round-trip) ──────────────────
     Date / duration / constraint chips patch ONE field on the current prefs,
     persist them, and — only when a plan is already on the canvas — rebuild
     the itinerary deterministically. Reads/writes prefsRef.current
     synchronously so the immediate rebuild sees the new value (React state +
     the prefsRef sync effect are both async). */
  const applyDirectPref = useCallback((patch: Partial<Preferences>) => {
    const base: Preferences = prefsRef.current ?? EMPTY_PREFS
    const next: Preferences = { ...base }
    if (typeof patch.duration === "string" && patch.duration) {
      next.duration = patch.duration
      // Couple dayCount to duration the same way the AI path does.
      next.dayCount = patch.duration === "multi-day" ? Math.max(2, base.dayCount || 2) : 1
    }
    if (typeof patch.dayCount === "number" && patch.dayCount >= 1) {
      next.dayCount = Math.min(14, Math.floor(patch.dayCount))
    }
    if (typeof patch.startDate === "string" && patch.startDate) next.startDate = patch.startDate
    if (typeof patch.budget === "string" && patch.budget) next.budget = patch.budget
    if (typeof patch.group === "string" && patch.group) next.group = patch.group
    if (typeof patch.adults === "number" && patch.adults >= 1) {
      next.adults = Math.max(1, Math.min(MAX_PARTY, Math.floor(patch.adults)))
    }
    if (typeof patch.children === "number" && patch.children >= 0) {
      next.children = Math.max(0, Math.floor(patch.children))
    }
    // Enforce the combined party cap (≥1 adult, ≤MAX_PARTY total).
    next.children = Math.min(next.children, MAX_PARTY - next.adults)
    // Interests is the one array field a single-pref edit can REPLACE wholesale
    // (incl. emptying it). The caller computes the next list (toggle add/remove).
    if (Array.isArray(patch.interests)) {
      // Defense-in-depth: even though this path's callers pass canonical UI
      // values, constrain to the available tag vocabulary so interests can
      // never drift to a non-existent tag. Empty stays empty (clears).
      const valid = new Set(formOptions.interests.map((o) => o.value))
      next.interests = Array.from(
        new Set(patch.interests.filter((v): v is string => typeof v === "string" && valid.has(v))),
      ).slice(0, formOptions.maxInterests)
    }
    if (Array.isArray(patch.exclusions)) {
      next.exclusions = patch.exclusions.filter((e): e is string => typeof e === "string").slice(0, 10)
    }

    const arrKey = (a?: string[]) => (a ?? []).slice().sort().join("|")
    const unchanged =
      next.duration === base.duration &&
      next.dayCount === base.dayCount &&
      next.startDate === base.startDate &&
      next.budget === base.budget &&
      next.group === base.group &&
      next.adults === base.adults &&
      next.children === base.children &&
      arrKey(next.interests) === arrKey(base.interests) &&
      arrKey(next.exclusions) === arrKey(base.exclusions)
    if (unchanged) return

    prefsRef.current = next
    // Sync the transport ref synchronously (not just via the useEffect) so a
    // chat send fired in the same tick as the click can't transmit the
    // pre-change preferences.
    prefsForApiRef.current = next
    setPrefs(next)
    try { setCookie(PREFS_COOKIE, JSON.stringify(next)) } catch { /* ignore */ }

    // Mirror the manual preference change into the chat so the conversation
    // reflects what the visitor did in the filter bar / suggestion chips —
    // and so the next /api/planner turn carries it in history. Describe ONLY
    // the field(s) that actually changed.
    const changed: string[] = []
    if (next.startDate !== base.startDate && next.startDate) {
      changed.push(`visit date to **${formatYMDPretty(next.startDate)}**`)
    }
    if (next.adults !== base.adults || next.children !== base.children) {
      const total = next.adults + next.children
      changed.push(`group to **${total} ${total === 1 ? "person" : "people"}**`)
    }
    if (next.group !== base.group && next.group) changed.push(`group type to **${next.group}**`)
    if (next.duration !== base.duration && next.duration) changed.push(`trip length to **${next.duration}**`)
    if (next.budget !== base.budget && next.budget) changed.push(`budget to **${next.budget}**`)
    if (arrKey(next.interests) !== arrKey(base.interests)) changed.push("your interests")
    if (changed.length > 0) {
      const list =
        changed.length === 1
          ? changed[0]
          : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`
      const tail = centerItinerary ? " — rebuilding your itinerary now." : "."
      notifyChat(`Updated ${list}${tail}`, "manual-pref")
    }

    // Only rebuild if a plan is already on the canvas; otherwise just keep
    // the updated prefs for the next build the user triggers.
    if (centerItinerary) void handleRegenerateItinerary()
  }, [centerItinerary, handleRegenerateItinerary, notifyChat])

  const sendFeedback = useCallback(async (messageId: string, vote: "up" | "down") => {
    setFeedbackGiven((prev) => ({ ...prev, [messageId]: vote }))
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, vote, source: "planner", timestamp: new Date().toISOString() }),
    })
  }, [])

  const handleTripSelect = useCallback((trip: Trip) => setSelectedTrip(trip), [])

  /* Hydrate prefs with a layered fallback:
   *   1. prefs cookie
   *   2. localStorage mirror (handled inside getCookie)
   *   3. persisted chat history — scan the most recent `updatePreferences`
   *      tool call for the actual saved values (chat persists even in
   *      cookie-hostile environments)
   *   4. persisted itinerary — if a built itinerary exists we know the user
   *      already finished onboarding, so synthesize sensible defaults from
   *      `EMPTY_PREFS` rather than re-prompting them
   * Without this layering, visitors in iframe/strict-cookie contexts were
   * bounced through onboarding on every refresh even though their chat,
   * cart, and itinerary were all still on disk. */
  useEffect(() => {
    function buildPrefs(parsed: Partial<Preferences>): Preferences | null {
      if (!parsed.group || !parsed.interests?.length || !parsed.duration || !parsed.budget) return null
      const today = todayYMD()
      const startDate = parsed.startDate && parsed.startDate >= today ? parsed.startDate : today
      const party = defaultPartyFor(parsed.group)
      // Multi-day is hidden — coerce any legacy persisted "multi-day" pref
      // (old cookie/localStorage state) to a single full-day plan so the
      // hidden mode can never be reintroduced through stale storage.
      const duration = parsed.duration === "multi-day" ? "full-day" : parsed.duration
      return {
        group: parsed.group,
        interests: parsed.interests,
        duration,
        budget: parsed.budget,
        startDate,
        adults: typeof parsed.adults === "number" && parsed.adults >= 1 ? parsed.adults : party.adults,
        children: typeof parsed.children === "number" && parsed.children >= 0 ? parsed.children : party.children,
        dayCount: 1,
      }
    }

    /** Walk persisted UI messages newest→oldest and MERGE every
     *  `updatePreferences` tool input — the AI is instructed to send
     *  only the fields that actually changed, so any single tool call
     *  typically holds a partial patch. We accumulate patches until
     *  the required core fields are all present (or we run out of
     *  history). Returns null when nothing usable was found. */
    function extractPrefsFromChat(): { merged: Partial<Preferences> | null; sawTool: boolean } {
      const acc: Partial<Preferences> = {}
      let sawTool = false
      try {
        const raw = window.localStorage.getItem("sightseeing_chat_v1")
        if (!raw) return { merged: null, sawTool: false }
        const msgs = JSON.parse(raw) as Array<{ parts?: Array<Record<string, unknown>> }>
        if (!Array.isArray(msgs)) return { merged: null, sawTool: false }
        const isComplete = (a: Partial<Preferences>) =>
          !!(a.group && a.interests?.length && a.duration && a.budget)
        outer:
        for (let i = msgs.length - 1; i >= 0; i--) {
          const parts = msgs[i]?.parts
          if (!Array.isArray(parts)) continue
          for (let j = parts.length - 1; j >= 0; j--) {
            const p = parts[j] ?? {}
            const t = String(p.type ?? "")
            const toolName = (p as { toolName?: string }).toolName
            const isPrefsTool =
              t === "tool-updatePreferences" ||
              (t === "tool-call" && toolName === "updatePreferences") ||
              (t === "tool" && toolName === "updatePreferences")
            if (!isPrefsTool) continue
            sawTool = true
            // `input` may be an object (AI SDK v5) or a JSON string (legacy
            // tool-call shapes). Be defensive on both.
            let raw: unknown = p.input ?? (p as { args?: unknown }).args
            if (typeof raw === "string") {
              try { raw = JSON.parse(raw) } catch { raw = null }
            }
            if (!raw || typeof raw !== "object") continue
            const patch = raw as Partial<Preferences>
            // Newest-wins merge: only fill fields we haven't already taken
            // from a more-recent patch.
            if (patch.group && !acc.group) acc.group = patch.group
            // Validate restored interests against the available tag vocabulary —
            // a persisted AI tool call may hold a non-canonical tag (e.g.
            // "culture") that matches zero trips. Only take VALID values; if
            // none survive, leave acc.interests unset so a cleaner source can
            // fill it (mirrors the live onToolCall guard).
            if (patch.interests?.length && !acc.interests?.length) {
              const valid = new Set(formOptions.interests.map((o) => o.value))
              const mapped = Array.from(
                new Set(patch.interests.filter((v): v is string => typeof v === "string" && valid.has(v))),
              ).slice(0, formOptions.maxInterests)
              if (mapped.length) acc.interests = mapped
            }
            if (patch.duration && !acc.duration) acc.duration = patch.duration
            if (patch.budget && !acc.budget) acc.budget = patch.budget
            if (patch.startDate && !acc.startDate) acc.startDate = patch.startDate
            if (typeof patch.adults === "number" && acc.adults == null) acc.adults = patch.adults
            if (typeof patch.children === "number" && acc.children == null) acc.children = patch.children
            if (typeof patch.dayCount === "number" && acc.dayCount == null) acc.dayCount = patch.dayCount
            if (isComplete(acc)) break outer
          }
        }
      } catch { /* ignore */ }
      return { merged: Object.keys(acc).length ? acc : null, sawTool }
    }

    /** Strong proof that the visitor finished onboarding in a previous
     *  session — used as the gate for synthesising default prefs when
     *  every persistence layer is empty. We require either:
     *    - a built itinerary persisted (signed off on full onboarding), OR
     *    - at least one `updatePreferences` tool call was recorded
     *  Mere chat length is NOT sufficient (architect feedback: a stray
     *  prior conversation should not bypass onboarding). */
    function hasStrongPriorActivity(sawPrefsTool: boolean): boolean {
      if (sawPrefsTool) return true
      try {
        const itin = window.localStorage.getItem("sightseeing_itinerary_v2")
        if (itin) {
          const parsed = JSON.parse(itin) as { steps?: unknown[] }
          if (Array.isArray(parsed?.steps) && parsed.steps.length > 0) return true
        }
      } catch { /* ignore */ }
      return false
    }

    // 1+2: cookie / localStorage mirror
    let restored: Preferences | null = null
    const saved = getCookie(PREFS_COOKIE)
    if (saved) {
      try { restored = buildPrefs(JSON.parse(saved) as Partial<Preferences>) } catch { /* ignore */ }
    }

    // 3: recover from chat history by merging every updatePreferences
    //     patch newest→oldest until we have a complete set.
    const { merged, sawTool } = extractPrefsFromChat()
    if (!restored && merged) {
      restored = buildPrefs(merged)
    }

    // 4: last-ditch — we have STRONG proof the user was onboarded before
    //    (a persisted itinerary, or a recorded prefs tool call), but no
    //    persistence layer holds a complete preference set. Fall back to
    //    sensible defaults so we don't re-prompt and lose their context.
    if (!restored && hasStrongPriorActivity(sawTool)) {
      restored = buildPrefs({
        group: "friends",
        interests: ["culture", "food"],
        duration: "full-day",
        budget: "mid-range",
        startDate: todayYMD(),
      })
    }

    if (restored) {
      setPrefs(restored)
      // Re-mirror to BOTH layers so subsequent refreshes don't need the
      // fallback path at all.
      try { setCookie(PREFS_COOKIE, JSON.stringify(restored)) } catch { /* ignore */ }
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Defense-in-depth: any time `prefs` changes (onboarding completion,
   *  AI tool update, party-size tweak, etc.) mirror to BOTH the cookie
   *  and the localStorage backup. This guarantees the persistence layer
   *  stays current even if some future code path forgets to call
   *  `setCookie()` after mutating `prefs`. */
  useEffect(() => {
    if (!hydrated || !prefs) return
    try { setCookie(PREFS_COOKIE, JSON.stringify(prefs)) } catch { /* ignore */ }
  }, [hydrated, prefs])

  /* AI Chat */
  const cartSummary = useMemo(() => items.map(i => ({ id: i.trip.id, title: i.trip.title })), [items])

  // Mirror centerItinerary into a ref so the transport's prepare callback
  // (captured once when DefaultChatTransport is created) always reads the
  // latest plan without forcing the transport to recreate on every change
  // — recreating the transport mid-conversation breaks the useChat stream.
  const itineraryForApiRef = useRef<Itinerary | null>(null)
  useEffect(() => { itineraryForApiRef.current = centerItinerary }, [centerItinerary])
  // Mirror the live preferences + working "My Trip" list into refs for the
  // SAME reason as itineraryForApiRef above: the transport's prepare callback
  // is captured ONCE (the transport is created with empty deps so we never
  // recreate it mid-conversation — that breaks the useChat stream). Without
  // these refs the chat would send whatever prefs/cart existed when the
  // transport was first built (often an empty cart) — which is exactly why
  // the AI thought "your cart is empty" after the user manually added trips.
  const prefsForApiRef = useRef<Preferences | null>(prefs)
  useEffect(() => { prefsForApiRef.current = prefs }, [prefs])
  const cartSummaryForApiRef = useRef<{ id: string; title: string }[]>(cartSummary)
  useEffect(() => { cartSummaryForApiRef.current = cartSummary }, [cartSummary])

  // Live on-screen Trip Canvas count (Gap 1). Declared here so the transport
  // closure below can read it; the value is computed + synced lower down (after
  // resultTrips / plannerAvail exist).
  const canvasCountForApiRef = useRef<{ count: number; date: string | null; ready: boolean }>({
    count: 0,
    date: null,
    ready: false,
  })

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/planner",
      prepareSendMessagesRequest: ({ id, messages: msgs }) => {
        const it = itineraryForApiRef.current
        const itinerarySummary = it ? {
          visitDate: it.visitDate,
          summary: it.summary,
          steps: it.steps.map(s => ({
            tripId: s.tripId,
            tripTitle: s.tripTitle,
            time: s.time,
            durationMinutes: s.durationMinutes,
          })),
        } : null
        return {
          body: {
            id,
            messages: msgs,
            // Read from refs so every turn sends the CURRENT prefs + My Trip
            // list, even though the transport is created only once.
            preferences: prefsForApiRef.current,
            cartItems: cartSummaryForApiRef.current,
            itinerarySummary,
            // Live on-screen Trip Canvas count so the AI can quote the EXACT
            // number the visitor sees instead of the inflated searchTrips total.
            canvas: canvasCountForApiRef.current,
          },
        }
      },
    }),
    []
  )

  // ── Per-browser-session reset ──
  // The planner persists chat history, the canvas itinerary, onboarding prefs
  // and the "My Trip" working list across hard refreshes (good UX). But across a
  // full browser CLOSE+REOPEN we want a CLEAN slate so a new visit doesn't load
  // a mix of stale conversations. We detect "new browser session" via a
  // sessionStorage marker (survives reloads, cleared on browser/tab close).
  //
  // This runs SYNCHRONOUSLY in the component body (ref-guarded, once) so the
  // wipe lands BEFORE any restore path reads storage:
  //   - chat restore (synchronous, just below this block)
  //   - prefs / itinerary restore (useEffects — fire after the body)
  //   - "My Trip" list restore (PlannerListProvider useEffect — a PARENT effect,
  //     which fires AFTER this child's render+effects → it reads the wiped key)
  // Fail-safe: if sessionStorage is unavailable we DON'T wipe (preserve the
  // refresh-survives behavior rather than nuking data on every load).
  const sessionResetRef = useRef(false)
  if (typeof window !== "undefined" && !sessionResetRef.current) {
    sessionResetRef.current = true
    try {
      if (!window.sessionStorage.getItem(PLANNER_SESSION_KEY)) {
        // Fresh browser session → wipe the planner's persisted session state.
        // (Site-wide stores — Saved Trips library `sightseeing_cart_v2` and
        // `recently_viewed` — are intentionally LEFT untouched.)
        try { document.cookie = `${PREFS_COOKIE}=;path=/;max-age=0` } catch { /* ignore */ }
        try { window.localStorage.removeItem(PREFS_LOCAL_KEY) } catch { /* ignore */ }
        try { window.localStorage.removeItem("sightseeing_chat_v1") } catch { /* ignore */ }
        try { window.localStorage.removeItem("sightseeing_itinerary_v2") } catch { /* ignore */ }
        // "My Trip" working list (lib/planner-list-context STORAGE_KEY).
        try { window.localStorage.removeItem("sightseeing_planner_list_v1") } catch { /* ignore */ }
        window.sessionStorage.setItem(PLANNER_SESSION_KEY, "1")
      }
    } catch { /* sessionStorage unavailable — do NOT wipe (fail-safe) */ }
  }

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

  // Declared BEFORE useChat so the onError handler below can flip the
  // first-turn gate. (Render order is unconditional, so hoisting these
  // useState calls is hook-safe.)
  const [committedAiTrips, setCommittedAiTrips] = useState<Trip[]>([])
  // Becomes true once the AI completes its first streaming turn. Until then
  // (including the brief 300ms gap between prefs being stored and the chat
  // auto-submission firing), we show the loading state rather than the
  // client-scored fallback grid so there's no premature 4-trip flash.
  const [hasCompletedFirstAiTurn, setHasCompletedFirstAiTurn] = useState(false)

  const { messages, sendMessage, addToolOutput, status, setMessages } = useChat<PlannerMessage>({
    transport,
    messages: initialMessagesRef.current,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError(error) {
      // AI turn failed. The cause is EITHER a real credential problem (route
      // forwards the token "AI_AUTH") OR a transient/retryable issue — model
      // overload (429/529), network blip, idle/heartbeat timeout, abort, or a
      // cold start (route forwards "AI_TEMP", the default). Older/edge errors
      // may arrive without a token. Without this handler the stream-end
      // transition that flips `hasCompletedFirstAiTurn` may never fire, pinning
      // the canvas on "Finding your perfect trips…". Flip the gate so the
      // canvas fails soft to the deterministic fallback grid.
      setHasCompletedFirstAiTurn(true)
      // Release any in-flight build lock so the composer never stays
      // disabled after a failed turn.
      setItineraryRegenerating(false)
      // Only blame the API key when the server actually reported an auth
      // failure — otherwise we wrongly tell visitors the (valid) key is
      // invalid on every transient hiccup. Default to a retry message.
      const raw = error instanceof Error ? error.message : String(error ?? "")
      const isAuth = /\bAI_AUTH\b|invalid x-api-key|authentication|unauthor|invalid api key|api[_ ]?key|not configured/i.test(raw)
      // Beacon the failure to the server so EVERY "couldn't reach the AI"
      // event is logged under /admin/logs (source ai:planner) — including
      // purely client-side failures (network drop, proxy stream timeout,
      // abort) that no server handler ever sees. Fire-and-forget; never block
      // or throw from the error path.
      try {
        void fetch("/api/planner/log-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: raw.slice(0, 500), kind: isAuth ? "auth" : "temp" }),
          keepalive: true,
        }).catch(() => { /* ignore */ })
      } catch { /* ignore */ }
      const errText = isAuth
        ? "⚠️ The AI assistant is unavailable right now — its API key looks invalid or expired. You can still browse trips, add them to your day, and build an itinerary on the Trip Canvas. Ask the site admin to update the AI key in the admin panel to re-enable chat."
        : "⚠️ I couldn't reach the AI assistant just now — please try again in a moment. You can still browse trips, add them to your day, and build an itinerary on the Trip Canvas."
      // Surface a friendly assistant bubble so the chat doesn't look frozen.
      setMessagesRef.current?.((prev) => {
        const last = prev[prev.length - 1]
        const lastText = last?.role === "assistant"
          ? last.parts.find((p) => (p as { type?: string }).type === "text") as { text?: string } | undefined
          : undefined
        // Avoid stacking duplicate error bubbles on repeated failures.
        if (lastText?.text?.startsWith("⚠️")) return prev
        return ([
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            parts: [{
              type: "text",
              text: errText,
            }],
          } as PlannerMessage,
        ])
      })
    },
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
          // Constrain AI-set interests to the AVAILABLE tag vocabulary
          // (the onboarding form's interest options). The model is told to
          // map free-text themes onto these canonical values, but nothing
          // stopped it sending a non-existent tag (e.g. "culture") that
          // matches zero trips and silently breaks the canvas filter. Drop
          // any value not in the catalog; if the patch had interests but
          // none were valid, keep the existing list rather than wiping it.
          interests: Array.isArray(patch.interests)
            ? (() => {
                const valid = new Set(formOptions.interests.map((o) => o.value))
                const mapped = patch.interests.filter(
                  (v): v is string => typeof v === "string" && valid.has(v),
                )
                const deduped = Array.from(new Set(mapped)).slice(0, formOptions.maxInterests)
                return deduped.length > 0 || patch.interests.length === 0 ? deduped : base.interests
              })()
            : base.interests,
          duration: typeof patch.duration === "string" && patch.duration ? patch.duration : base.duration,
          budget: typeof patch.budget === "string" && patch.budget ? patch.budget : base.budget,
          startDate: typeof patch.startDate === "string" && patch.startDate ? patch.startDate : base.startDate,
          adults: typeof patch.adults === "number" && patch.adults >= 1 ? Math.min(MAX_PARTY, patch.adults) : base.adults,
          children: typeof patch.children === "number" && patch.children >= 0 ? Math.min(MAX_PARTY, patch.children) : base.children,
          // Preserve / clamp dayCount on AI-driven updates. If the AI is
          // switching to multi-day, snap to at least 2 days; switching
          // away from multi-day collapses back to 1.
          dayCount: typeof patch.dayCount === "number" && patch.dayCount >= 1
            ? Math.min(14, Math.floor(patch.dayCount))
            : (patch.duration === "multi-day"
                ? Math.max(2, base.dayCount || 2)
                : (patch.duration && patch.duration !== "multi-day" ? 1 : base.dayCount)),
          // Meal/break prefs: merge-by-type so an update to lunch never
          // duplicates the lunch row or wipes out dinner. If the AI did
          // NOT include `mealBreaks` in this patch, preserve the
          // existing list verbatim — partial patches are the norm.
          mealBreaks: "mealBreaks" in patch
            ? mergeMealBreaks(base.mealBreaks, (patch as { mealBreaks?: unknown }).mealBreaks)
            : base.mealBreaks,
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

        // Enforce the combined party cap: ≥1 adult, ≤MAX_PARTY people total.
        next.adults = Math.max(1, Math.min(MAX_PARTY, next.adults))
        next.children = Math.max(0, Math.min(MAX_PARTY - next.adults, next.children))

        // No-op short-circuit: skip churn if nothing actually changed.
        const mealBreaksKey = (mb: MealBreakPref[] | undefined) =>
          (mb ?? []).map((m) => `${m.type}:${m.earliest}-${m.latest}@${m.durationMinutes}`).join("|")
        const unchanged =
          next.group === base.group &&
          next.duration === base.duration &&
          next.budget === base.budget &&
          next.startDate === base.startDate &&
          next.adults === base.adults &&
          next.children === base.children &&
          next.interests.length === base.interests.length &&
          next.interests.every((v, i) => v === base.interests[i]) &&
          mealBreaksKey(next.mealBreaks) === mealBreaksKey(base.mealBreaks)

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
        const { tripId, tripTitle } = toolCall.input as { tripId: string; tripTitle: string }
        // Resolve ROBUSTLY so the My Trip list always reflects what the chat
        // claims it saved (the bug was the chat reporting "Saved X" while the
        // list stayed blank because the id didn't match the catalog). Read from
        // refs — useChat captures onToolCall's closure on mount, so direct
        // `allTrips` / `aiTrips` reads would see stale values after the DB
        // hydration replaces the catalog.
        const pools = [allTripsRef.current, aiTripsRef.current]
        const normTitle = (s: string) =>
          s.trim().toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ")
        const findById = (id: string): Trip | undefined => {
          if (!id) return undefined
          for (const pool of pools) {
            const hit =
              pool.find((t) => t.id === id) ??
              // The model sometimes passes a raw Palisis id ("5") instead of the
              // internal "tcms_5" — try the prefixed form before giving up.
              (id.startsWith("tcms_") ? undefined : pool.find((t) => t.id === `tcms_${id}`))
            if (hit) return hit
          }
          return undefined
        }
        const findByTitle = (title?: string): Trip | undefined => {
          if (!title) return undefined
          const n = normTitle(title)
          for (const pool of pools) {
            const hit =
              pool.find((t) => normTitle(t.title) === n) ??
              pool.find((t) => normTitle(t.title).includes(n) || n.includes(normTitle(t.title)))
            if (hit) return hit
          }
          return undefined
        }
        const trip = findById(tripId) ?? findByTitle(tripTitle)
        if (trip) {
          addItem(trip)
          // Descriptive success label naming the actually-saved trip.
          addToolOutput({
            tool: "addToCart",
            toolCallId: toolCall.toolCallId,
            output: `Saved “${trip.title}” to your trip list` as never,
          })
        } else {
          // HONEST failure — never claim a save we didn't make. The model relays
          // this so it stops telling the user a trip was added when it wasn't.
          addToolOutput({
            tool: "addToCart",
            toolCallId: toolCall.toolCallId,
            output:
              `Could not add “${tripTitle || tripId}” — I couldn't match it to a trip in the catalog. Search for it first, then I'll save it.` as never,
          })
        }
      }

      if (toolCall.toolName === "removeFromCart") {
        const { tripId, tripTitle } = toolCall.input as { tripId?: string; tripTitle: string }
        // Resolve the target against the LIVE My Trip list (the authoritative
        // membership the route also receives), not the catalog — we can only
        // remove what's actually in the list. Match by id first, then by a
        // normalised title (substring either direction) so "the boat cruise"
        // resolves to "Boat Cruise on the Moselle".
        const normTitle = (s: string) =>
          s.trim().toLowerCase().replace(/['']/g, "").replace(/\s+/g, " ")
        const list = cartSummaryForApiRef.current
        let target = tripId ? list.find((c) => c.id === tripId || c.id === `tcms_${tripId}`) : undefined
        if (!target && tripTitle) {
          const n = normTitle(tripTitle)
          target =
            list.find((c) => normTitle(c.title) === n) ??
            list.find((c) => normTitle(c.title).includes(n) || n.includes(normTitle(c.title)))
        }
        if (target) {
          removeItem(target.id)
          addToolOutput({
            tool: "removeFromCart",
            toolCallId: toolCall.toolCallId,
            output: `Removed “${target.title}” from the trip list` as never,
          })
        } else {
          // HONEST failure — the trip wasn't in the list, so nothing changed.
          addToolOutput({
            tool: "removeFromCart",
            toolCallId: toolCall.toolCallId,
            output:
              `“${tripTitle || tripId}” isn't in the trip list, so nothing was removed.` as never,
          })
        }
      }

      if (toolCall.toolName === "clearCart") {
        const count = cartSummaryForApiRef.current.length
        if (count > 0) {
          clearList()
          addToolOutput({
            tool: "clearCart",
            toolCallId: toolCall.toolCallId,
            output: `Cleared all ${count} trip${count === 1 ? "" : "s"} from the trip list` as never,
          })
        } else {
          addToolOutput({
            tool: "clearCart",
            toolCallId: toolCall.toolCallId,
            output: `The trip list is already empty — nothing to clear.` as never,
          })
        }
      }
    },
  })

  // Keep the forward-ref in sync with useChat's setMessages so earlier
  // handlers (handleOpenOrRebuildFromChat, handleRegenerateItinerary)
  // can push truthful failure messages without ordering gymnastics.
  useEffect(() => { setMessagesRef.current = (updater) => setMessages(updater) }, [setMessages])

  /* DEDUPE BY id — the AI SDK's streaming + auto-tool-loop (and restored
     localStorage history) can occasionally land two message objects that
     share the same generated id in `messages`. Rendering them directly
     throws React's "two children with the same key" error AND visually
     duplicates whatever the message contains (e.g. the showWeatherAlert
     "Perfect Day…" card stacks up every time the chat re-renders, such as
     when the trip-detail modal opens). Collapse duplicates to the FIRST
     occurrence before we render or persist so the key is always unique and
     each card appears exactly once. */
  const dedupedMessages = useMemo(() => {
    const seen = new Set<string>()
    const out: PlannerMessage[] = []
    for (const m of messages) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      out.push(m)
    }
    return out
  }, [messages])

  /* Restored-session rehydration: when the chat is reloaded from
     localStorage, every previously-built itinerary card is historical and
     already cleared preflight in a past session. The preflight state map is
     volatile (resets to {} on refresh), so without this those cards would be
     stuck rendering the "Checking availability" stub forever. Mark each
     restored buildItinerary card as "ready" so it renders the real itinerary,
     and seed the auto-build guard with the latest one so the effect doesn't
     redundantly re-run /api/itinerary for a plan we already built. */
  const restoredCardsRehydratedRef = useRef(false)
  useEffect(() => {
    if (restoredCardsRehydratedRef.current) return
    restoredCardsRehydratedRef.current = true
    const restored = initialMessagesRef.current
    if (!restored.length) return
    const ids: string[] = []
    for (const m of restored) {
      for (const part of m.parts) {
        const p = part as { type?: string; state?: string; toolCallId?: string }
        if (p?.type === "tool-buildItinerary" && p?.state === "output-available" && p?.toolCallId) {
          ids.push(String(p.toolCallId))
        }
      }
    }
    if (ids.length === 0) return
    setPreflightCardState((prev) => {
      const next = { ...prev }
      for (const id of ids) if (next[id] === undefined) next[id] = "ready"
      return next
    })
    // Treat the most recent restored plan as already auto-built so the
    // auto-build effect leaves it alone (it only fires for NEW toolCallIds).
    lastAutoBuiltToolCallIdRef.current = ids[ids.length - 1]
  }, [])

  /* The toolCallId of the MOST RECENT buildItinerary card in the chat. Only
     this card renders the full expanded "Your Day Itinerary" timeline; any
     earlier itinerary cards (from prior rebuilds) collapse to a one-line
     "superseded" note so the chat never shows two competing day plans. */
  const lastItineraryToolCallId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      for (const part of messages[i].parts) {
        const p = part as { type?: string; state?: string; toolCallId?: string }
        if (p?.type === "tool-buildItinerary" && p?.state === "output-available" && p?.toolCallId) {
          return String(p.toolCallId)
        }
      }
    }
    return null
  }, [messages])

  // The FIRST weather-alert tool call across the whole conversation. The AI
  // can emit `showWeatherAlert` on several turns (and the same card can appear
  // in re-renders), which previously stacked duplicate weather cards in the
  // chat. We render the card only for this first occurrence.
  const firstWeatherToolCallId = useMemo(() => {
    for (const msg of dedupedMessages) {
      for (const part of msg.parts) {
        const p = part as { type?: string; state?: string; toolCallId?: string }
        if (p?.type === "tool-showWeatherAlert" && p?.state === "output-available" && p?.toolCallId) {
          return String(p.toolCallId)
        }
      }
    }
    return null
  }, [dedupedMessages])

  /* Apply a prefs patch coming from the sidebar's plan-conflict buttons
     ("Make it a full-day trip" / "Spread across N days"). We mirror the
     same persist+propagate flow used by onboarding so the next /api/
     itinerary request picks the new prefs up. */
  const handleSidebarPrefsUpdate = useCallback((patch: Partial<SidebarPrefsView>) => {
    setPrefs((prev) => {
      if (!prev) return prev
      const next: Preferences = { ...prev, ...patch } as Preferences
      try { setCookie(PREFS_COOKIE, JSON.stringify(next)) } catch { /* cookie quota — ignore */ }
      return next
    })
  }, [])

  /* Echo a plan-conflict (overpacked cart) into chat so the conversation
     mirrors what the visitor sees in the sidebar. We do NOT auto-apply
     an option here — the user can click an option button in the sidebar
     OR tell the AI which one they prefer. Declared above the auto-build
     useEffect so the effect can reference it without a TDZ error. */
  const handlePlanConflict = useCallback((payload: PlanConflictPayload) => {
    const optionLines = payload.conflict.options
      .map((o, i) => `${i + 1}. **${o.label}** — ${o.description}`)
      .join("\n")
    const text = `${payload.message}\n\n**Options:**\n${optionLines}\n\nTap one in the sidebar, or tell me which you'd like.`
    setMessages((prev) => ([
      ...prev,
      { id: `plan-conflict-${Date.now()}`, role: "assistant", parts: [{ type: "text", text }] } as PlannerMessage,
    ]))
  }, [setMessages])

  /* Echo a build failure (NO_AVAILABILITY etc.) into chat so the
     assistant doesn't appear to ignore the error. Includes the top
     suggested alternative dates so the visitor can act without
     hunting in the sidebar. */
  const handleItineraryFailure = useCallback((payload: ItineraryFailurePayload) => {
    const lines: string[] = [payload.message]
    if (payload.alternativeDates && payload.alternativeDates.length > 0) {
      const top = payload.alternativeDates.slice(0, 3)
        .map((a) => `**${formatYMDPretty(a.date)}** (${a.tripCount} of your trips open)`)
        .join(", ")
      lines.push(`**Best alternative dates:** ${top}. Want me to rebuild for one of these?`)
    } else if (payload.unavailableTrips && payload.unavailableTrips.length > 0) {
      const names = payload.unavailableTrips.slice(0, 2).map((u) => `**"${u.title}"**`).join(" and ")
      lines.push(`Trips without slots on **${formatYMDPretty(payload.visitDate)}**: ${names}.`)
    }
    setMessages((prev) => ([
      ...prev,
      { id: `itinerary-failed-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: lines.join("\n\n") }] } as PlannerMessage,
    ]))
  }, [setMessages])

  /* ─── Auto-build the REAL itinerary when the AI calls buildItinerary ───
     The AI's buildItinerary tool only returns a lightweight sketch
     (titles + suggested times). The Trip Canvas needs the full plan
     produced by /api/itinerary (live Palisis timeslots + Mapbox routing).
     When we see a new tool-buildItinerary output land in the chat, we
     immediately POST to /api/itinerary using the cart trips that match
     the AI's plan, then set centerItinerary + open the Canvas so the
     chat's "Day Itinerary is live on the Trip Canvas" line is actually
     true. Tracked by toolCallId so each AI invocation fires exactly once. */
  useEffect(() => {
    if (!hydrated) return
    let latest: { toolCallId: string; tripIds: string[] } | null = null
    outer: for (let i = messages.length - 1; i >= 0; i--) {
      for (const part of messages[i].parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = part as any
        if (p?.type === "tool-buildItinerary" && p?.state === "output-available") {
          const out = p.output as { steps?: { tripId?: string }[] } | undefined
          // Filter meal-break placeholders out of the trip-id list. The AI
          // emits steps with tripId "lunch"/"dinner"/"coffee" (or any id
          // starting with "meal_") for break stops — these aren't real
          // trips and would surface in /api/itinerary as "tcms_lunch — no
          // openings in 21 days". Same filter is applied defensively on
          // the server in /api/itinerary.
          const isMealBreakId = (id: string) =>
            id === "lunch" || id === "dinner" || id === "coffee" || id.startsWith("meal_") || id.startsWith("tcms_lunch") || id.startsWith("tcms_dinner") || id.startsWith("tcms_coffee")
          const ids = (out?.steps ?? [])
            .map((s) => (s?.tripId ? String(s.tripId) : ""))
            .filter((id) => id && !isMealBreakId(id))
          if (ids.length > 0 && p.toolCallId) {
            latest = { toolCallId: String(p.toolCallId), tripIds: ids }
            break outer
          }
        }
      }
    }
    if (!latest) return
    if (lastAutoBuiltToolCallIdRef.current === latest.toolCallId) return
    /* Concurrency guard — if a previous render already started the
       async chain for this exact toolCallId, do nothing. The async run
       will flip lastAutoBuiltToolCallIdRef on success or clear the
       in-flight ref on failure, and the resulting render will hit the
       correct branch above. Without this guard, addItem calls inside
       the chain re-fire the effect mid-flight and we'd double-build. */
    if (inFlightAutoBuildToolCallIdRef.current === latest.toolCallId) return
    /* Compute a composite fingerprint so a preflight NEEDS_DECISION
       outcome doesn't permanently block rebuilds for this toolCallId.
       When the visitor resolves the conflict (changes prefs, drops a
       trip from the cart, picks a different date), the fingerprint
       shifts → preflight re-runs → if now READY, the real build
       proceeds. Note: lastAutoBuiltToolCallIdRef is now ONLY set after
       a successful build (further down), so the simple-key guard above
       is the "skip if I already built this exact plan" lock. */
    /* Read from the `prefs` STATE (which is in this effect's deps), not
       from prefsRef.current — the ref is updated by a separate effect
       declared later in the file, so on the render right after setPrefs
       this effect would otherwise see stale prefs and bail on the old
       preflightKey. (Architect feedback: prevents the "Make it full-day"
       resolution from being silently ignored.) */
    const prefsFp = JSON.stringify({
      d: prefs?.duration,
      s: prefs?.startDate,
      a: prefs?.adults,
      c: prefs?.children,
    })
    const cartFp = items.map((i) => i.trip.id).sort().join(",")
    const preflightKey = `${latest.toolCallId}|${prefsFp}|${cartFp}`
    if (preflightFailedKeyRef.current === preflightKey) return

    // Build from the AI plan's trip ids directly so the auto-built
    // itinerary matches what the chat card showed — even when those
    // trips aren't in the cart (AI recommendations, "create itinerary
    // from recommended trips" flow). /api/itinerary hydrates id-only
    // payloads from the DB. Cart trips with extra fields are still
    // preferred so we forward those when available.
    const cartById = new Map(items.map((i) => [i.trip.id, i.trip]))
    const tripsForApi = latest.tripIds.map((id) => {
      const t = cartById.get(id)
      return t ? {
        id: t.id, title: t.title, city: t.city,
        duration: t.duration, category: t.category,
      } : { id }
    })
    if (tripsForApi.length === 0) return

    // Use the live `prefs` state (in deps) — see prefsFp comment above.
    const visitDate = prefs?.startDate || todayYMD()
    // Claim the in-flight slot synchronously, BEFORE any state change
    // (setItineraryRegenerating triggers a render → effect re-run).
    // Cleared in the finally block below.
    inFlightAutoBuildToolCallIdRef.current = latest.toolCallId
    setItineraryRegenerating(true)
    // Switch the inline chat card into "checking" mode IMMEDIATELY so the
    // visitor never sees a confident plan card while preflight is still
    // verifying availability. Cleared in finally / on NEEDS_DECISION below.
    setPreflightCardState((prev) => ({ ...prev, [latest.toolCallId]: "checking" }))
    void (async () => {
      try {
        /* ─── Preflight gate ───────────────────────────────────────────
           Ask /api/itinerary to run trip hydration + TourCMS availability
           + duration-vs-time-budget conflict detection WITHOUT calling
           the AI. If the preflight surfaces a duration conflict or any
           unavailable trips, push the decision question to chat and
           bail — do NOT load anything onto the Trip Canvas. The
           visitor's chosen resolution (change duration, switch date,
           drop a trip) triggers a fresh build via the prefs-drift
           handler. This ordering matches the product requirement: ASK
           FIRST, build after. Without this gate the visitor would see
           a partial itinerary appear AND a conflict question at the
           same time, which is confusing.                                */
        const pre = await fetch("/api/itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "preflight", trips: tripsForApi, startDate: visitDate, preferences: prefs }),
        })
        const preData = await pre.json().catch(() => null) as {
          kind?: "preflight"
          status?: "READY" | "NEEDS_DECISION"
          conflict?: PlanConflictPayload["conflict"] | null
          unavailableTrips?: ItineraryFailurePayload["unavailableTrips"]
          alternativeDates?: ItineraryFailurePayload["alternativeDates"]
          visitDate?: string
          autoDroppedForFullDay?: Array<{ tripId: string; title: string; reason: string }>
        } | null
        // Freshness check (architect race-fix): a newer tool-buildItinerary
        // may have arrived while preflight was awaited. If so, this run is
        // stale — bail without mutating any state. The newer run owns the
        // in-flight slot now and will run its own preflight.
        if (inFlightAutoBuildToolCallIdRef.current !== latest.toolCallId) return
        const preIsReady =
          pre.ok && preData?.kind === "preflight" && preData.status === "READY"
        const preIsDecision =
          pre.ok && preData?.kind === "preflight" && preData.status === "NEEDS_DECISION"
        // STRICT GATE (architect T004 fix): only continue to the real AI
        // build when preflight explicitly returned READY. Any other shape
        // — NEEDS_DECISION, non-OK HTTP, malformed body — must NOT touch
        // the canvas. On NEEDS_DECISION we ask the user; on malformed we
        // surface a generic failure rather than silently proceeding.
        if (!preIsReady) {
          // Always clear any stale canvas so the visitor cannot perceive
          // a "built" plan while we're asking them to resolve a conflict
          // (architect T004 fix: canvas-must-be-empty on decision).
          setCenterItinerary(null)
          setCenterItineraryOpen(false)
          if (preIsDecision) {
            // Flip the card into the "decision" stub state so it stops
            // showing the AI's confident sketch + View button while the
            // visitor is being asked to resolve the conflict.
            setPreflightCardState((prev) => ({ ...prev, [latest.toolCallId]: "decision" }))
            if (preData!.conflict) {
              handlePlanConflict({
                message:
                  `Your saved trips need more time than your **${preData!.conflict!.currentDuration}** plan allows ` +
                  `(${Math.round(preData!.conflict!.estimatedMinutes / 60 * 10) / 10}h needed vs ` +
                  `${Math.round(preData!.conflict!.availableMinutes / 60 * 10) / 10}h available). ` +
                  `Pick how to resolve this before I load the Trip Canvas:`,
                visitDate: preData!.visitDate || visitDate,
                conflict: preData!.conflict!,
              })
            } else {
              const dropped = preData!.unavailableTrips ?? []
              handleItineraryFailure({
                message: `Before I load the Trip Canvas — ${dropped.length} of your ${dropped.length === 1 ? "trip isn't" : "trips aren't"} bookable on **${formatYMDPretty(preData!.visitDate || visitDate)}**. Want to pick a different date, drop those trips, or carry on with just the bookable ones?`,
                error: "PREFLIGHT_AVAILABILITY",
                visitDate: preData!.visitDate || visitDate,
                unavailableTrips: dropped,
                alternativeDates: preData!.alternativeDates ?? [],
              })
            }
          } else {
            // Malformed / non-OK preflight — surface honestly, don't build.
            handleItineraryFailure({
              message: "Could not verify availability for these trips — please try again in a moment.",
              error: "PREFLIGHT_FAILED",
              visitDate,
              unavailableTrips: [],
              alternativeDates: [],
            })
          }
          // Record this preflight outcome against the composite key so
          // the effect doesn't loop preflight-calls on every render but
          // WILL re-run as soon as prefs/cart change (composite key
          // shifts).
          preflightFailedKeyRef.current = preflightKey
          setItineraryRegenerating(false)
          // IMPORTANT: do NOT setCenterItinerary, do NOT open canvas.
          // The visitor's chosen resolution (via the chat buttons) will
          // mutate prefs/cart and the drift-rebuild path will re-fire.
          return
        }
        /* Preflight passed (READY) — proceed to the real AI build.
           If the visitor's full-day intent triggered the server-side
           auto-drop branch, surface a chat note about what was dropped
           so they aren't surprised when the canvas has fewer trips than
           their cart. They can object in chat and the AI can rebuild. */
        const autoDropped = preData?.autoDroppedForFullDay ?? []
        if (autoDropped.length > 0) {
          const names = autoDropped.map((d) => `**"${d.title}"**`).join(" and ")
          setMessages((prev) => ([
            ...prev,
            {
              id: `auto-drop-${latest.toolCallId}`,
              role: "assistant",
              parts: [{
                type: "text",
                text:
                  `Your saved trips needed more time than a single full-day window allows, so I dropped ${names} to fit. ` +
                  `Tell me if you'd rather keep them and spread across days instead — I'll rebuild.`,
              }],
            } as PlannerMessage,
          ]))
        }
        const r = await fetch("/api/itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trips: tripsForApi, startDate: visitDate, preferences: prefs }),
        })
        const data = await r.json().catch(() => null) as
          | (Itinerary & { error?: string; message?: string; conflict?: PlanConflictPayload["conflict"]; unavailableTrips?: ItineraryFailurePayload["unavailableTrips"]; alternativeDates?: ItineraryFailurePayload["alternativeDates"]; visitDate?: string })
          | null
        if (!r.ok || !data) {
          // Auto-build failure: route through the same chat-failure path as
          // the manual sidebar build so the assistant never appears to
          // silently swallow a failed live build. (Architect review T001.)
          if (data?.error === "PLAN_CONFLICT" && data.conflict) {
            handlePlanConflict({
              message: data.message || "These trips don't fit your chosen duration.",
              visitDate: data.visitDate || visitDate,
              conflict: data.conflict,
            })
          } else {
            handleItineraryFailure({
              message: data?.message || "Could not build the live itinerary for these trips on this date.",
              error: data?.error || "ITINERARY_FAILED",
              visitDate: data?.visitDate || visitDate,
              unavailableTrips: data?.unavailableTrips || [],
              alternativeDates: data?.alternativeDates || [],
            })
          }
          return
        }
        if (!data?.steps?.length) {
          // Zero-step success: don't silently swallow it. Route through the
          // same failure path as the other build surfaces so the visitor
          // gets a distinct all-dropped / empty-date message with trip names
          // and alternative dates. (Architect review.)
          const allDropped = Array.isArray(data?.unavailableTrips) ? data.unavailableTrips : []
          handleItineraryFailure({
            message: allDropped.length > 0
              ? "None of your trips have a bookable slot on this date, so there's nothing to schedule for that day."
              : "The plan came back empty for this date — try a different day.",
            error: "ITINERARY_EMPTY",
            visitDate: data?.visitDate || visitDate,
            unavailableTrips: allDropped,
            alternativeDates: data?.alternativeDates || [],
          })
          return
        }
        // Freshness check #2 (architect race-fix): a newer tool-buildItinerary
        // may have arrived during the real-build fetch. If the in-flight
        // owner has shifted, this run is stale — abort BEFORE mutating
        // centerItinerary / cart / canvas, otherwise we'd overwrite the
        // newer run's preflight-decision state with stale steps.
        if (inFlightAutoBuildToolCallIdRef.current !== latest.toolCallId) return
        // ─── Auto-add chat-built trips to the cart ───────────────────────
        // The drift guard (~line 942) nukes centerItinerary the instant a
        // step's trip isn't in the cart. For chat-built itineraries the
        // visitor typically hasn't manually added these trips, so without
        // this step the canvas panel would flash open and immediately
        // close itself. Adding them also makes the linkage explicit:
        // chat-planned trips show up in My Trip just like cart-built ones,
        // and removing them from the cart cleanly clears the itinerary.
        // Dedupe across this single loop run AND against the current
        // cart. (`isInCart` uses the cart-context's live `items`, so it
        // also catches trips the user manually added between effect
        // start and this point.) The in-flight ref guarantees this loop
        // doesn't run twice for the same toolCallId, so quantities can
        // no longer multiply per chat plan.
        const addedThisRun = new Set<string>()
        for (const step of data.steps) {
          if (!step.tripId) continue
          if (addedThisRun.has(step.tripId)) continue
          // Read LIVE cart state from the ref — not the closure-captured
          // `items` or `isInCart` — so manual cart additions made during
          // the preflight + real-build awaits aren't re-added (which
          // would bump quantity to 2).
          const inCartLive = cartItemsRef.current.some((i) => i.trip.id === step.tripId)
          if (inCartLive) continue
          const trip = allTripsRef.current.find((t) => t.id === step.tripId)
          if (trip) {
            addItem(trip)
            addedThisRun.add(step.tripId)
          }
        }
        setCenterItinerary(data)
        setCenterItineraryOpen(true)
        // Mobile-only auto-open of the cart drawer (same rationale as
        // handleOpenItinerary). On desktop the canvas lives in the
        // center column, so popping the right-side cart drawer on every
        // chat build is noisy.
        if (typeof window !== "undefined" && window.innerWidth < 768) {
          setCartOpen(true)
        }
        setMapExpanded(true)
        /* Mark this toolCallId as fully built so subsequent renders
           (e.g. cart adds via the loop above) don't re-trigger the
           effect for the same plan. Set ONLY on success — failed
           preflights record on preflightFailedKeyRef instead so a
           prefs/cart change can retrigger. */
        lastAutoBuiltToolCallIdRef.current = latest!.toolCallId
        // ─── Reconcile chat ↔ canvas ────────────────────────────────────
        // The AI's sketch (tool-buildItinerary output) often has hallucinated
        // times and may list trips that turned out to be unavailable on the
        // chosen date. Now that we have the LIVE /api/itinerary result,
        // overwrite that exact tool output so the chat card reflects the same
        // steps, real timeslots, real visit date, and real summary that the
        // Trip Canvas shows. This prevents the bug where chat says "Sunday,
        // 3 stops" while the canvas shows "Thu 28 May, 1 stop".
        const liveSteps = data.steps.map((s) => ({
          time: s.time,
          tripTitle: s.tripTitle ?? "",
          tripId: s.tripId,
          durationMinutes: s.durationMinutes,
          travelToNext: s.travelToNext ?? undefined,
        }))
        const liveOutput = {
          steps: liveSteps,
          summary: data.summary || "Day plan loaded on the Trip Canvas.",
          visitDate: data.visitDate || visitDate,
        }
        setMessages((prev) => prev.map((m) => ({
          ...m,
          parts: m.parts.map((part) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = part as any
            if (p?.type === "tool-buildItinerary" && p?.toolCallId === latest!.toolCallId) {
              return { ...p, output: liveOutput }
            }
            return part
          }),
        })))
        // ─── Partial-success honesty ────────────────────────────────────
        // Two sources of "fewer stops on canvas than the chat asked for":
        //   (a) Palisis had no timeslot for the trip on the chosen date
        //   (b) Visitor's saved duration prefs couldn't fit every trip
        // The /api/itinerary route now folds both into `unavailableTrips`
        // (reason: "NO_SLOTS"/"NO_PALISIS_LINK" vs "DOES_NOT_FIT_DURATION")
        // and carries a structured `conflict` payload with concrete prefs
        // change suggestions. We branch the chat message so duration
        // conflicts explicitly call out "change duration or date" instead
        // of the generic "no availability" line.
        const dropped = Array.isArray(data.unavailableTrips) ? data.unavailableTrips : []
        const conflict = (data as { conflict?: PlanConflictPayload["conflict"] | null }).conflict
        if (conflict) {
          handlePlanConflict({
            message:
              `Your saved trips need more time than your **${conflict.currentDuration}** plan allows ` +
              `(${Math.round(conflict.estimatedMinutes / 60 * 10) / 10}h needed vs ` +
              `${Math.round(conflict.availableMinutes / 60 * 10) / 10}h available). ` +
              `Trip Canvas is showing the **${data.steps.length} stop${data.steps.length === 1 ? "" : "s"}** that fit your current preferences — change duration, pick a different date, or drop a trip to include the rest.`,
            visitDate: data.visitDate || visitDate,
            conflict,
          })
        } else if (dropped.length > 0) {
          handleItineraryFailure({
            message: `Heads up — ${dropped.length} of your requested trip${dropped.length === 1 ? "" : "s"} ${dropped.length === 1 ? "isn't" : "aren't"} available on **${formatYMDPretty(data.visitDate || visitDate)}**, so the Trip Canvas shows ${data.steps.length} stop${data.steps.length === 1 ? "" : "s"} instead.`,
            error: "PARTIAL_AVAILABILITY",
            visitDate: data.visitDate || visitDate,
            unavailableTrips: dropped,
            alternativeDates: Array.isArray(data.alternativeDates) ? data.alternativeDates : [],
          })
        }
      } catch {
        handleItineraryFailure({
          message: "Network hiccup while building your itinerary — please try again in a moment.",
          error: "NETWORK_ERROR",
          visitDate,
          unavailableTrips: [],
          alternativeDates: [],
        })
      } finally {
        setItineraryRegenerating(false)
        /* Release the in-flight slot. If we set lastAutoBuiltToolCallIdRef
           on success, the longer-lived guard above takes over and the
           effect still won't re-build. If we hit a failure/preflight-
           needs-decision path, releasing the slot lets a later prefs/
           cart change re-enter and try again. */
        if (inFlightAutoBuildToolCallIdRef.current === latest!.toolCallId) {
          inFlightAutoBuildToolCallIdRef.current = null
        }
        /* Promote the per-toolCallId card from "checking" to "ready" so
           the renderer flips from the stub to the full "Your Day Itinerary"
           + View button. We KEEP a "decision" marker — that was set
           explicitly above on NEEDS_DECISION and stays until prefs/cart
           change triggers a fresh preflight (which sets it back to
           "checking" first). The renderer defaults to a stub for any
           toolCallId without an explicit "ready" status, so even failure
           paths surface as "checking" → "ready" once the failure message
           lands in chat. */
        setPreflightCardState((prev) => {
          if (prev[latest!.toolCallId] === "decision") return prev
          return { ...prev, [latest!.toolCallId]: "ready" }
        })
      }
    })()
    // `prefs` is in deps so that when the visitor resolves a preflight
    // NEEDS_DECISION outcome by changing duration/date, the composite
    // preflight key shifts and the effect re-runs.
  }, [messages, items, hydrated, prefs, handlePlanConflict, handleItineraryFailure])

  /* Called by SidebarItinerary after a manual build succeeds. We push a
     synthetic assistant message into the chat so the conversation log
     reflects that an itinerary now exists on the canvas — and so the
     chat's context (which is sent as itinerarySummary on the next user
     turn) is consistent with what the visitor is looking at. */
  const handleItineraryBuilt = useCallback((built: Itinerary) => {
    const stops = built.steps?.length ?? 0
    if (stops === 0) return
    const dateLabel = built.visitDate ? formatYMDPretty(built.visitDate) : "your visit date"
    // Partial-success awareness: when some cart trips couldn't fit on the
    // chosen date the chat must reflect that truth instead of cheerfully
    // claiming "N stops now live".
    const unavail = built.unavailableTrips ?? []
    const skippedCount = unavail.length
    const totalRequested = stops + skippedCount
    // Distinguish "dropped because no Palisis slot on this date" vs
    // "dropped because the visitor's duration pref couldn't fit it". The
    // dedicated conflict chat message already explains the duration case
    // with concrete options, so the itinerary-built summary stays neutral
    // when EVERY dropped trip is a duration-conflict drop (avoids the
    // contradictory "try another day" wording the architect flagged).
    const durationDrops = unavail.filter((u) => u.reason === "DOES_NOT_FIT_DURATION").length
    const availabilityDrops = skippedCount - durationDrops
    let summary: string
    if (availabilityDrops > 0) {
      const availUnavail = unavail.filter((u) => u.reason !== "DOES_NOT_FIT_DURATION")
      const names = availUnavail.slice(0, 2).map((u) => `"${u.title}"`).join(" and ")
      const extra = availUnavail.length > 2 ? ` (+${availUnavail.length - 2} more)` : ""
      summary = `Itinerary built for ${dateLabel} — ${stops} of ${totalRequested} stops on the Trip Canvas. ` +
        `Couldn't fit ${names}${extra} on this date — try another day to fit them all.`
    } else if (durationDrops > 0) {
      summary = `Itinerary built for ${dateLabel} — ${stops} of ${totalRequested} stops on the Trip Canvas. ` +
        `See the message above for how to fit the rest.`
    } else {
      summary = `Active day for ${dateLabel} with ${stops} stop${stops === 1 ? "" : "s"}. Ask me to swap, reorder, or add a break anywhere.`
    }
    // Push a synthetic `tool-buildItinerary` part so the existing chat
    // renderer surfaces the "Your Day Itinerary" timeline card with the
    // View Itinerary button (or "Loaded on Trip Canvas" badge when it's
    // already the active panel) — exactly the same UX as when the AI
    // calls buildItinerary itself.
    //
    // CRITICAL: pre-claim this toolCallId in the auto-build ref BEFORE
    // appending the message. The auto-build effect listens for new
    // `tool-buildItinerary` outputs and would otherwise re-fire
    // /api/itinerary against the just-built plan (and possibly overwrite
    // the real result or surface a contradictory failure). The "manual-"
    // prefix also makes the intent obvious in logs.
    const syntheticToolCallId = `manual-${Date.now()}`
    lastAutoBuiltToolCallIdRef.current = syntheticToolCallId
    // Pre-mark this synthetic message as "ready" BEFORE pushing it so the
    // renderer's default-deny gate doesn't flash a "Checking availability"
    // stub for a build that already completed. Both setState calls are
    // batched, so the next render sees both updates atomically.
    setPreflightCardState((prev) => ({ ...prev, [syntheticToolCallId]: "ready" }))
    setMessages((prev) => ([
      ...prev,
      {
        id: `itinerary-built-${Date.now()}`,
        role: "assistant",
        parts: [
          {
            type: "tool-buildItinerary",
            toolCallId: syntheticToolCallId,
            state: "output-available",
            input: undefined,
            output: {
              summary,
              // Carry the build date so the chat card's date-staleness check
              // (cardStale) can fire for manual sidebar builds too — without
              // it the card could never detect a later date change and would
              // keep offering a plain "View"/"Loaded" for a stale plan.
              visitDate: built.visitDate,
              steps: built.steps.map((s) => ({
                time: s.time,
                tripTitle: s.tripTitle,
                tripId: s.tripId,
                durationMinutes: s.durationMinutes,
                travelToNext: s.travelToNext ?? undefined,
              })),
            },
          },
        ],
      } as unknown as PlannerMessage,
    ]))
  }, [setMessages])

  /* Auto-scroll chat */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, status])

  /* Persist messages whenever they change — survives hard refresh. */
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (dedupedMessages.length > 0) {
        window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(dedupedMessages))
      } else {
        window.localStorage.removeItem(CHAT_STORAGE_KEY)
      }
    } catch { /* quota / privacy-mode — silently skip */ }
  }, [dedupedMessages, CHAT_STORAGE_KEY])

  /* Send initial message after onboarding */
  const didSendInitial = useRef(false)
  // Gate the auto-seed on the FIRST /api/planner/availability scan settling
  // (or a 6s fail-safe), so the canvas's authoritative availability count +
  // GROUND-TRUTH line reaches the AI on turn 1. Previously the seed fired
  // ~300ms after onboarding — BEFORE the 1–3s availability scan — so the AI
  // saw no canvas count and free-wheeled a "no trips available today" claim
  // that contradicted the canvas "Available on Today: N" badge. The setter is
  // also called from the availability effect's `.finally` below.
  const [seedAvailReady, setSeedAvailReady] = useState(false)
  // Re-arming fail-safe: whenever the gate is CLOSED (initial mount AND after a
  // resetPrefs/"start over" — which sets it back to false), open it after 6s so
  // a slow/never-settling availability scan can't permanently block the seed.
  // The availability effect's `.finally` opens it sooner in the normal case.
  useEffect(() => {
    if (seedAvailReady) return
    const t = setTimeout(() => setSeedAvailReady(true), 6000)
    return () => clearTimeout(t)
  }, [seedAvailReady])
  // If we restored prior chat history from localStorage on mount, do NOT
  // re-fire the "Find the best trips for me…" seed message — otherwise
  // every refresh would tack a duplicate onto the bottom of the chat.
  if (initialMessagesRef.current.length > 0) didSendInitial.current = true
  useEffect(() => {
    if (hydrated && prefs && seedAvailReady && !didSendInitial.current && messages.length === 0 && status === "ready") {
      didSendInitial.current = true
      const t = setTimeout(() => {
        const visitDate = prefs.startDate || todayYMD()
        const isToday = visitDate === todayYMD()
        const datePhrase = isToday ? "today" : `on ${formatYMDPretty(visitDate)} (${visitDate})`
        sendMessage({ text: `Find the best trips for me ${datePhrase} based on my preferences and the weather. Analyse each trip's description and details (day vs night activities, opening hours, indoor vs outdoor) to match trips that genuinely fit my visit date and time-of-day. The Trip Canvas already shows which trips are bookable on ${visitDate} — recommend from those and never tell me nothing is available when the canvas lists trips.` })
      }, 300)
      return () => clearTimeout(t)
    }
  }, [hydrated, prefs, seedAvailReady, messages.length, sendMessage, status])

  function handleOnboardingComplete(newPrefs: Preferences) {
    setCookie(PREFS_COOKIE, JSON.stringify(newPrefs))
    // Re-close the auto-seed availability gate at the moment fresh prefs are
    // committed. While prefs were null (initial load or post-reset) the
    // availability effect runs an empty-date scan whose `.finally` opens the
    // gate; without re-closing here, the auto-seed for the NEW prefs/date could
    // fire before that date's scan settles — the exact turn-1 canvas↔chat
    // race we're eliminating. The new scan (or the 6s fail-safe) reopens it.
    setSeedAvailReady(false)
    setPrefs(newPrefs)
  }
  function resetPrefs() {
    setPrefs(null)
    didSendInitial.current = false
    // Re-close the auto-seed availability gate so the next onboarding cycle's
    // seed waits for the FRESH availability scan to settle (re-armed fail-safe
    // above re-opens it after 6s). Without this the latch stayed true and the
    // post-reset seed could fire before the new scan, re-opening the turn-1
    // canvas↔chat contradiction window.
    setSeedAvailReady(false)
    // CRITICAL: also clear the initial-messages ref. Line above re-arms
    // `didSendInitial`, but the render-time guard `if (initialMessagesRef
    // .current.length > 0) didSendInitial.current = true` runs on EVERY
    // render and would immediately flip it back to true (because the ref
    // was populated from localStorage at mount). That permanently blocked
    // the post-reset auto-send, so the AI never re-ran "Find the best
    // trips for me…" with the new prefs and the "Recommended for you"
    // panel stayed on stale aiTrips from before the reset.
    initialMessagesRef.current = []
    document.cookie = `${PREFS_COOKIE}=;path=/;max-age=0`
    // Clear persisted chat history too — a fresh onboarding shouldn't show
    // the previous visitor's conversation in the background.
    try {
      window.localStorage.removeItem(PREFS_LOCAL_KEY)
      window.localStorage.removeItem(CHAT_STORAGE_KEY)
      setMessages([])
    } catch { /* ignore */ }
    // Wipe the per-toolCallId preflight card state so any stale "ready"
    // markers from the prior chat don't leak into the next session.
    setPreflightCardState({})
    // Reset the first-turn gate so the canvas shows the loading state
    // (not the fallback grid) while the AI runs its first recommendation.
    setHasCompletedFirstAiTurn(false)
    // Synchronously wipe any committed trips from the prior session so
    // the canvas can't flash the old results before the useEffect syncs.
    setCommittedAiTrips([])
    // Neutralise the streaming-transition ref so that if a stream was still
    // in flight when reset was called, its eventual stream-end event cannot
    // re-fire setHasCompletedFirstAiTurn(true) and undo the reset above.
    prevStreamingRef.current = false
    // Reset the auto-build guards so the next AI buildItinerary in the
    // new chat isn't blocked by the previous toolCallId markers.
    lastAutoBuiltToolCallIdRef.current = null
    inFlightAutoBuildToolCallIdRef.current = null
    preflightFailedKeyRef.current = null
    // Close and clear the Trip Canvas itinerary. Critical for "chat context
    // has all the updated details" — prepareSendMessagesRequest forwards
    // `itinerarySummary` from centerItinerary on every send, so a stale
    // plan from the prior prefs session would otherwise still steer the
    // new AI conversation. Also wipes its localStorage persistence.
    setCenterItinerary(null)
    setCenterItineraryOpen(false)
    try { window.localStorage.removeItem("sightseeing_itinerary_v2") } catch { /* ignore */ }
    // Wipe the working "My Trip" list too — a true fresh start keeps the
    // chat, canvas and trip list in sync (an empty chat with a populated
    // trip list would otherwise immediately re-seed recommendations).
    clearList()
    setShowResetConfirm(false)
  }

  /* ── Remove a single stop from the itinerary ──
     Removing a stop from the Day Itinerary also removes that trip from the
     working "My Trip" list (3-way sync: chat / canvas / list). The drift
     guard then clears the canvas plan; we re-build it from the remaining
     trips on the next render once the list state has settled (or clear it
     outright when nothing is left). */
  const pendingItineraryRebuildRef = useRef(false)
  const handleRemoveItineraryStep = useCallback((tripId: string) => {
    if (!tripId) return
    pendingItineraryRebuildRef.current = true
    removeItem(tripId)
  }, [removeItem])
  useEffect(() => {
    if (!pendingItineraryRebuildRef.current) return
    pendingItineraryRebuildRef.current = false
    if (items.length > 0) {
      void handleRegenerateItinerary()
    } else {
      setCenterItinerary(null)
      setCenterItineraryOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

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
        // When the user is asking about ONE specific trip ("tell me about the
        // Casemates tour", "what's included in X"), the model calls
        // getTripDetails instead of searchTrips. Pin the canvas to that trip so
        // the map + "Recommended for you" reflect what the chat is discussing.
        else if (part.type === "tool-getTripDetails" && part.state === "output-available") {
          const out = part.output as { ok?: boolean; id?: string; title?: string }
          if (out?.ok && (out.id || out.title)) {
            const byId = out.id
              ? (allTrips.find((t) => t.id === out.id) ??
                 (out.id.startsWith("tcms_") ? undefined : allTrips.find((t) => t.id === `tcms_${out.id}`)))
              : undefined
            const focus = byId ?? (out.title
              ? allTrips.find((t) => t.title.trim().toLowerCase() === out.title!.trim().toLowerCase())
              : undefined)
            if (focus) {
              found.length = 0
              seen.clear()
              seen.add(focus.id)
              found.push(focus)
            }
          }
        }
      }
    }
    return found
  }, [messages, allTrips])

  /* Client-side fallback trips — score every trip against the visitor's
     interests/budget/weather and return ALL trips that match at least
     one interest (i.e. their tag list intersects with the picked
     interests). The previous hard `slice(0, 8)` was capping the grid
     regardless of how many real matches existed, which made the panel
     look static. When the visitor has no interests yet, callers render
     the empty-state instead so the no-match fallback only kicks in if
     they DID pick interests but nothing in the catalog matched. */
  const fallbackTrips = useMemo(() => {
    if (!prefs) return []
    const wxCond = deriveWx()
    const hasInterests = prefs.interests.length > 0
    /* Time-available cap: hide trips that can't fit the visitor's selected
       duration. "1-2h" → ≤2h, "half-day" → ≤4h. Full-day / multi-day / any /
       custom options impose no cap. Trips with an unparseable duration are
       kept (we don't hide what we can't classify). Uses the SHORTEST option
       of multi-option trips so e.g. "Full Day:7H / Half Day:4H" still fits a
       half-day cap. */
    const capH = durationCapHours(prefs.duration)
    const fitsCap = (t: Trip) => {
      if (capH == null) return true
      const minH = parseDurationHoursMin(t.duration)
      return minH == null || minH <= capH
    }
    const scored = allTrips.map((t) => {
      let score = 0
      let interestHits = 0
      for (const interest of prefs.interests) {
        if (t.tags.includes(interest)) { score += 10; interestHits++ }
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
      return { trip: t, score, interestHits }
    })
    scored.sort((a, b) => b.score - a.score)
    // NO interests picked → recommend the ENTIRE catalog (still within the
    // duration cap), score-ordered. The visitor told us nothing to narrow on,
    // so the canvas + chat should surface every available trip rather than a
    // tiny rating-only slice (an empty `tags`/`budget=any` profile otherwise
    // leaves only the 4.7★ trips with score>0). This keeps the canvas in sync
    // with a chat that says "all trips".
    if (!hasInterests) {
      return scored.filter((s) => fitsCap(s.trip)).map((s) => s.trip)
    }
    // Interests picked → prefer trips that match at least one picked interest
    // tag. Duration cap is applied AFTER scoring so over-long trips never
    // surface.
    const matched = scored
      .filter((s) => s.interestHits > 0)
      .filter((s) => fitsCap(s.trip))
    if (matched.length > 0) return matched.map((s) => s.trip)
    // Nothing matched the interests — show top-scored trips (still within the
    // duration cap) so the panel is never empty after a visitor finishes
    // onboarding.
    return scored.filter((s) => fitsCap(s.trip)).slice(0, 8).map((s) => s.trip)
  }, [prefs, allTrips])

  /* ── Planner availability (window scan) ───────────────────────────────
     Drives the canvas "Recommended for you" ordering + date grouping.
     Decoupled from the AI chat: the canvas shows EVERY preference-matching
     trip, sorted by availability-on-selected-date then match score. The AI
     chat remains a separate helper (it can still adjust prefs, which flows
     back into this list). Window length is admin-configurable. */
  const selectedDateForAvail = prefs?.startDate ?? ""
  // Party size feeds the availability scan so a slot that can't seat the whole
  // group is NOT counted as bookable here — keeping the disabled map +
  // recommendations honest against the itinerary scheduler's party filter.
  const partyForAvail = Math.max(1, prefs?.adults ?? 1) + Math.max(0, prefs?.children ?? 0)
  const [plannerAvail, setPlannerAvail] = useState<Record<string, { availableOnSelectedDate: boolean; availableDates: string[] }>>({})
  const [availLoading, setAvailLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    setAvailLoading(true)
    // Clear stale availability for the PREVIOUS date so grouping never reflects
    // an old selection while the new window scan is in flight (or if it fails).
    setPlannerAvail({})
    const params = new URLSearchParams()
    if (selectedDateForAvail) params.set("date", selectedDateForAvail)
    params.set("party", String(partyForAvail))
    const qs = params.toString() ? `?${params.toString()}` : ""
    fetch(`/api/planner/availability${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { trips?: Record<string, { availableOnSelectedDate: boolean; availableDates: string[] }> } | null) => {
        if (cancelled) return
        // Fail-soft: on a null/failed response leave availability empty so cards
        // simply omit date chips rather than showing stale data.
        setPlannerAvail(data?.trips ?? {})
      })
      .catch(() => { if (!cancelled) setPlannerAvail({}) /* fail-soft: no date chips */ })
      .finally(() => { if (!cancelled) { setAvailLoading(false); setSeedAvailReady(true) } })
    return () => { cancelled = true }
  }, [selectedDateForAvail, partyForAvail])

  /* Full preference-matched recommendation list, sorted by availability then
     match score. `fallbackTrips` already returns ALL trips whose tags match
     the visitor's interests (score-ordered); here we layer availability on
     top so trips bookable on the selected date float to the top. */
  const hasSelectedDate = !!prefs?.startDate
  const recommendedTrips = useMemo(() => {
    // NOTE: do NOT bail when `prefs.interests` is empty. Skipping all
    // onboarding leaves interests empty by design, but `fallbackTrips` already
    // degrades gracefully in that case (weather/budget-scored top trips), so it
    // is non-empty whenever any trips exist. Returning [] here was what pinned
    // the canvas on "Finding your perfect trips…" with nothing rendered even
    // though the AI chat said the canvas had options.
    if (!prefs || fallbackTrips.length === 0) return []
    const arr = fallbackTrips.map((trip, idx) => {
      const av = plannerAvail[trip.id]
      return {
        trip,
        idx,
        availableOnDate: hasSelectedDate && !!av?.availableOnSelectedDate,
        soonest: av?.availableDates?.[0] ?? null,
      }
    })
    arr.sort((a, b) => {
      if (hasSelectedDate && a.availableOnDate !== b.availableOnDate) return a.availableOnDate ? -1 : 1
      if (!hasSelectedDate && a.soonest !== b.soonest) {
        if (!a.soonest) return 1
        if (!b.soonest) return -1
        return a.soonest < b.soonest ? -1 : 1
      }
      return a.idx - b.idx
    })
    return arr.map((m) => m.trip)
  }, [prefs, fallbackTrips, plannerAvail, hasSelectedDate])

  /* ── Planner working-list availability gating ─────────────────────────────
     Trips in the working "My Trip" list with NO bookable timeslot on the
     visitor's planned date are disabled (greyed + overlay) so the user sees
     what won't work before building. Derived from the live `plannerAvail` scan
     which refetches whenever the date changes — so answering the date prompt in
     chat re-checks automatically. Only trips we actually have availability data
     for are disabled; trips we can't check stay enabled rather than be wrongly
     blocked. */
  const plannerDisabledMap = useMemo(() => {
    const map: Record<string, { reason?: string }> = {}
    if (!hasSelectedDate || !prefs?.startDate) return map
    const pretty = formatYMDPretty(prefs.startDate)
    for (const it of items) {
      const av = plannerAvail[it.trip.id]
      if (av && !av.availableOnSelectedDate) {
        map[it.trip.id] = { reason: `No timeslots on ${pretty}` }
      }
    }
    return map
  }, [items, plannerAvail, hasSelectedDate, prefs?.startDate])
  const plannerDisabledIds = useMemo(() => Object.keys(plannerDisabledMap), [plannerDisabledMap])
  useEffect(() => { plannerDisabledIdsRef.current = new Set(plannerDisabledIds) }, [plannerDisabledIds])

  // Fingerprint of the trips the itinerary ACTUALLY builds from — i.e. the
  // working list MINUS disabled (unavailable-on-date) trips. Must match the
  // sidebar's build-input fingerprint format (dedupe → sort → join "|"),
  // identical to `fingerprintFromItinerary` in components/sidebar-itinerary.tsx,
  // or the drift guard will think the plan is stale right after a fresh build.
  const cartFingerprint = useMemo(
    () => [...new Set(items.filter((i) => !plannerDisabledMap[i.trip.id]).map((i) => i.trip.id).filter(Boolean))].sort().join("|"),
    [items, plannerDisabledMap],
  )

  // Bookmark toggle → Saved Trips library (separate from the working list).
  const toggleBookmark = useCallback((trip: Trip) => {
    if (savedLibrary.isInCart(trip.id)) savedLibrary.removeItem(trip.id)
    else savedLibrary.addItem(trip)
  }, [savedLibrary])

  // "Load saved trips" → merge the Saved Trips library into the working list,
  // then (reactively) gate by availability. If no date is set yet, ask in chat.
  const awaitingDateForLoadRef = useRef(false)
  const loadSavedIntoPlanner = useCallback(() => {
    const saved = savedLibrary.items.map((i) => i.trip)
    if (saved.length === 0) return
    planner.loadFromSaved(saved)
    const d = prefsRef.current?.startDate
    const hasDate = !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    if (!hasDate) {
      awaitingDateForLoadRef.current = true
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `load-saved-date-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: "I've added your saved trips to your planner list. Which date are you planning to visit? Once you pick a date I'll check each trip's availability and flag any that can't be booked that day." }] } as PlannerMessage,
      ]))
    }
  }, [savedLibrary, planner])

  // When the visitor answers the date prompt (chat or date picker), confirm the
  // recheck in chat. The actual gating happens reactively via plannerDisabledMap.
  useEffect(() => {
    if (!awaitingDateForLoadRef.current) return
    const d = prefs?.startDate
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      awaitingDateForLoadRef.current = false
      setMessagesRef.current?.((prev) => ([
        ...prev,
        { id: `load-saved-checking-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: `Got it — checking availability for ${formatYMDPretty(d)}. Any trips in your list without timeslots that day are now greyed out so you can swap them before building.` }] } as PlannerMessage,
      ]))
    }
  }, [prefs?.startDate])

  // Mirror aiTrips into a ref so onToolCall (addToCart) can resolve DB-only
  // trips (tcms_*) that aren't in the static catalog. useChat's onToolCall
  // closure captures stale values, so we read latest via this ref.
  const aiTripsRef = useRef<Trip[]>([])
  useEffect(() => { aiTripsRef.current = aiTrips }, [aiTrips])
  // Same staleness issue for the DB-hydrated catalog — mirror it into a ref.
  const allTripsRef = useRef<Trip[]>(staticTripsFallback)
  useEffect(() => { allTripsRef.current = allTrips }, [allTrips])
  /* Live cart-items ref. Read inside async chains (auto-build loop) so
     we see manual cart additions that happened DURING the awaits —
     `isInCart` and `items` captured at effect-render time would miss
     those and re-add via `addItem`, which would bump quantity to 2. */
  const cartItemsRef = useRef(items)
  useEffect(() => { cartItemsRef.current = items }, [items])
  // Latest prefs snapshot — read synchronously by the updatePreferences
  // tool handler so the merged value it returns to the model is never
  // stale (React state updates are async, but the tool-loop fires the
  // next request immediately after addToolOutput).
  const prefsRef = useRef<Preferences | null>(null)
  useEffect(() => { prefsRef.current = prefs }, [prefs])
  const isStreaming = status === "streaming" || status === "submitted"

  /* Gate canvas updates on streaming completion so the visitor doesn't
     see the "Recommended for you" panel flash between intermediate
     shortlists during a single AI turn (the prior 4 → 7 flash). The AI
     may call `searchTrips` more than once per turn — first a broad scan,
     then a narrowed final pick — and we only want to commit the final
     result. While the AI is mid-turn we keep showing the LAST committed
     set (or nothing if this is the visitor's first turn).
     NOTE: `committedAiTrips` and `hasCompletedFirstAiTurn` are declared
     above useChat (so onError can flip the gate). */
  const prevStreamingRef = useRef(isStreaming)
  useEffect(() => {
    // Stream just ended → commit whatever aiTrips ended up as the final.
    if (prevStreamingRef.current && !isStreaming) {
      setCommittedAiTrips(aiTrips)
      setHasCompletedFirstAiTurn(true)
    } else if (!isStreaming && hasCompletedFirstAiTurn) {
      // Non-stream `aiTrips` change (e.g. visitor pinned via a sidebar
      // action, or the messages array was rebuilt outside a chat turn).
      // Keep `committedAiTrips` in sync so the next stream starts from
      // the real current canvas, not a stale snapshot.
      // Guard: only sync AFTER the first AI turn has fully landed so
      // that a brief status flip to idle mid-multi-step-tool-chain
      // (between tool invocations within a single turn) cannot
      // prematurely commit an intermediate 4-trip result and cause the
      // 4 → 7 flash we specifically want to prevent.
      const sameLen = committedAiTrips.length === aiTrips.length
      const sameIds = sameLen && committedAiTrips.every((t, i) => t.id === aiTrips[i]?.id)
      if (!sameIds) setCommittedAiTrips(aiTrips)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, aiTrips, committedAiTrips, hasCompletedFirstAiTurn])
  // While streaming, show the last committed set (or empty if none yet).
  // Once streaming ends we use the live aiTrips so the useEffect above
  // and the render stay in sync within the same render pass.
  const displayedAiTrips = isStreaming ? committedAiTrips : aiTrips
  // `discoveringPrefs` is true when the visitor has set interests but the
  // AI hasn't completed its first recommendation turn yet. This covers the
  // ~300 ms gap between handleOnboardingComplete() and the auto-submit timer
  // as well as the full streaming window before the first result lands.
  // We compute it here (before canvasIsDiscovering below) so we can also
  // suppress the map/header fallback — otherwise the map would briefly show
  // client-scored fallback pins while the trip-list showed the loading card.
  const discoveringPrefs = prefs !== null && prefs.interests.length > 0 && !hasCompletedFirstAiTurn
  // The Trip Canvas reflects the trips the chat is CURRENTLY discussing whenever
  // the AI has pinned a set (searchTrips list, or a single getTripDetails focus)
  // — that's `displayedAiTrips`. When the AI hasn't pinned anything (fresh load,
  // restored chat with no search, or pure browsing) we fall back to the
  // deterministic preference-matched `recommendedTrips`. Keeping that fallback is
  // what eliminates the reload hang (previously the canvas could stay empty
  // forever when a restored chat suppressed the auto-send) — the canvas is never
  // gated on an in-flight AI turn.
  const resultTrips: Trip[] = displayedAiTrips.length > 0 ? displayedAiTrips : recommendedTrips
  const showResults = resultTrips.length > 0

  /* ── Live Trip Canvas count (Gap 1 — chat↔canvas count parity) ──
     The EXACT number of trip cards the visitor sees on the canvas: when a visit
     date is set it's the "Available on <date>" group (onDate), otherwise the
     whole result list. Mirror it (plus the date it reflects and whether the
     availability scan has finished) into a ref so every chat turn can send the
     real on-screen number to the route — the AI then quotes that instead of the
     inflated searchTrips `total`. Must use the SAME filter as the JSX above. */
  const canvasCount = useMemo(
    () =>
      hasSelectedDate
        ? resultTrips.filter((t) => plannerAvail[t.id]?.availableOnSelectedDate).length
        : resultTrips.length,
    [hasSelectedDate, resultTrips, plannerAvail],
  )
  useEffect(() => {
    canvasCountForApiRef.current = {
      count: canvasCount,
      date: hasSelectedDate ? (prefs?.startDate ?? null) : null,
      // "ready" only once the availability scan has settled AND we actually have
      // results to count — a loading/empty canvas count must never be quoted.
      ready: !availLoading && showResults,
    }
  }, [canvasCount, hasSelectedDate, prefs?.startDate, availLoading, showResults])

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
    type Chip = { label: string; action: string; patch?: Partial<Preferences> }
    const chips: Chip[] = []
    const turns = messages.filter((m) => m.role === "user").length

    // Phase 0: A plan is on the canvas -- offer DIRECT single-pref tweaks that
    // patch one field and rebuild deterministically (no AI round-trip).
    if (centerItinerary) {
      const dur = prefs?.duration ?? ""
      if (dur !== "half-day") chips.push({ label: "Make it half-day", action: "", patch: { duration: "half-day" } })
      if (dur !== "full-day") chips.push({ label: "Make it full-day", action: "", patch: { duration: "full-day" } })
      const hasNoEarly = (prefs?.exclusions ?? []).includes("no-early-morning")
      if (hasNoEarly) {
        chips.push({ label: "Allow early starts", action: "", patch: { exclusions: (prefs?.exclusions ?? []).filter((e) => e !== "no-early-morning") } })
      } else {
        chips.push({ label: "No early starts", action: "", patch: { exclusions: [...(prefs?.exclusions ?? []), "no-early-morning"] } })
      }
      const hasNoLunch = (prefs?.exclusions ?? []).includes("no-lunch")
      if (hasNoLunch) {
        chips.push({ label: "Add lunch break", action: "", patch: { exclusions: (prefs?.exclusions ?? []).filter((e) => e !== "no-lunch") } })
      } else {
        chips.push({ label: "Skip lunch break", action: "", patch: { exclusions: [...(prefs?.exclusions ?? []), "no-lunch"] } })
      }
      const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
      if ((prefs?.startDate || todayYMD()) !== tomorrow) chips.push({ label: "Try tomorrow", action: "", patch: { startDate: tomorrow } })
      return chips.slice(0, 4)
    }

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
  }, [messages, prefs, selectedTrip, totalItems, resultTrips, centerItinerary])

  // ── Per-session chat turn limit (admin-configurable) ──
  // Admin sets `maxChatTurns` in AI Systems → Trip Planner Chat (0 = unlimited).
  // We count the visitor's OWN messages (role "user") — including the initial
  // auto-seed — and once the cap is hit we block further chat and prompt a
  // reset, keeping the conversation (and AI token budget) bounded so the model
  // doesn't lose the thread. Also enforced server-side in /api/planner.
  const userTurnCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  )
  const chatLimitReached = formOptions.maxChatTurns > 0 && userTurnCount >= formOptions.maxChatTurns

  function handleSend(text: string) {
    // Once the admin-configured per-session chat limit is reached the visitor
    // must reset to continue — drop any further sends (typed input or pills).
    if (chatLimitReached) return
    // Block ONLY while a turn is actively in flight. Previously this required
    // status === "ready", which meant that after an AI error (status becomes
    // "error", e.g. an invalid Anthropic key) EVERY subsequent send was
    // silently dropped — typed messages AND recommendation pills (which route
    // through handleSend). Allowing sends from the "error" state lets the user
    // retry and lets non-patch pills work again.
    if (!text.trim() || status === "streaming" || status === "submitted") return
    setSelectedTrip(null)
    sendMessage({ text })
    setInput("")
  }

  if (!hydrated) return null

  // Wait for the visibility check before rendering the planner so a hidden
  // planner never flashes to a non-logged-in visitor (and the gate is
  // deterministic for tests).
  if (plannerHidden === null) {
    return (
      <div ref={shellRef} style={{ height: shellHeight }} className="flex flex-col bg-background">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
            aria-label="Loading"
          />
        </div>
      </div>
    )
  }

  // Admin hid the planner from the public — show an "unavailable" screen to
  // non-logged-in visitors (the visibility endpoint already lets admins through).
  if (plannerHidden === true) {
    return (
      <div ref={shellRef} style={{ height: shellHeight }} className="flex flex-col bg-background">
        <Navbar />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Trip Planner unavailable</h1>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            The Trip Planner isn&apos;t available right now. Browse our experiences or
            check back soon.
          </p>
          <Link
            href="/"
            className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  /* ────────────────────────── */
  /* RENDER                     */
  /* ────────────────────────── */
  return (
    <div ref={shellRef} style={{ height: shellHeight }} className="flex flex-col bg-background">
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
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Show Trip Canvas" className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary sm:hidden">
              <PanelLeftClose className="h-4 w-4" /> Trip Canvas
            </button>
          </div>

          {!hydrated ? (
            // While we're still reading the prefs cookie/localStorage on
            // mount, show a lightweight skeleton rather than flashing the
            // Onboarding wizard. Without this guard, returning visitors
            // see a full onboarding form for a frame and (when cookies
            // are dropped by the iframe) get bounced through it.
            <div className="flex flex-1 items-center justify-center p-6" data-testid="planner-hydrating">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                <span className="text-xs">Loading your trip planner…</span>
              </div>
            </div>
          ) : !prefs ? (
            // Key on enabledSteps so the wizard fully remounts (and
            // re-derives its initial step) once the async form-config
            // fetch resolves. Without this, the component would stick
            // with the all-enabled DEFAULT_FORM_OPTIONS that were used
            // on the first render and ignore admin-disabled steps.
            <Onboarding
              key={`onb-${formOptions.enabledSteps.groups ? "1" : "0"}${formOptions.enabledSteps.interests ? "1" : "0"}${formOptions.enabledSteps.durations ? "1" : "0"}${formOptions.enabledSteps.budgets ? "1" : "0"}${formOptions.enabledSteps.dates ? "1" : "0"}`}
              onComplete={handleOnboardingComplete}
              formOptions={formOptions}
            />
          ) : (
            <>
              {/* Preference pills — clickable, single-field editing */}
              <EditablePrefsBar
                prefs={prefs}
                formOptions={formOptions}
                onPatch={applyDirectPref}
                onReset={() => setShowResetConfirm(true)}
              />

              {/* Chat messages -- TEXT and DATA only, never trip listings */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
                <div className="flex flex-col gap-4">
                  {dedupedMessages.map((msg, msgIdx) => {
                    if (msgIdx === 0 && msg.role === "user") return null
                    const textParts: React.ReactNode[] = []
                    /* CONTRADICTION GUARD: if this assistant message contains
                       a buildItinerary tool call whose preflight came back as
                       "decision" (conflict needs resolution), suppress any
                       text parts that appear AFTER that tool call in the same
                       message. The LLM sometimes streams a confident
                       "Your full-day itinerary is ready on the Trip Canvas…"
                       line directly after the tool call — that text is
                       written BEFORE the preflight result is known, and would
                       directly contradict the "Decision needed" card the
                       preflight just rendered. Stripping it keeps the chat
                       internally consistent. The text BEFORE the tool call
                       (e.g. "Let me build a multi-trip full-day plan…")
                       stays — that framing is still accurate. */
                    let decisionBuildIdx = -1
                    msg.parts.forEach((p, i) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const pp = p as any
                      if (decisionBuildIdx === -1
                        && pp?.type === "tool-buildItinerary"
                        && pp?.state === "output-available"
                        && preflightCardState[pp?.toolCallId ?? ""] === "decision") {
                        decisionBuildIdx = i
                      }
                    })
                    msg.parts.forEach((part, idx) => {
                      // Suppress contradictory post-decision text (see guard above).
                      if (decisionBuildIdx >= 0 && idx > decisionBuildIdx && part.type === "text") {
                        return
                      }
                      switch (part.type) {
                        case "text": {
                          // Strip headings, images, and bullet markers but
                          // KEEP `**bold**` — we render it as <strong> so
                          // the AI can highlight trip names, dates, and
                          // prices (per system-prompt rule 5).
                          //
                          // BELT-AND-SUSPENDERS sanitiser for rule 5a: even
                          // with an explicit "NEVER expose ids" instruction,
                          // the LLM occasionally leaks `tcms_14`, `tcms_lunch`,
                          // bare Palisis numerics in parens, or meal-break
                          // placeholders. Strip them defensively so the user
                          // never sees an internal token.
                          const sanitized = part.text
                            // " (tcms_14)" / "(tcms_lunch)" → drop the paren group
                            .replace(/\s*\(\s*(?:tcms_|meal_)[a-z0-9_]+\s*\)/gi, "")
                            // ", tcms_14" / " — tcms_14" / "tcms_14 " → drop the token + adjacent separators
                            .replace(/[\s,;—–-]*\b(?:tcms_|meal_)[a-z0-9_]+\b/gi, "")
                            // standalone "lunch_break" / "dinner_break" / "coffee_break"
                            .replace(/\b(?:lunch|dinner|coffee)_break\b/gi, "")
                            // collapse "Trip Name (— 4 hours" style stray punctuation left behind
                            .replace(/\(\s*([—–-])/g, "($1")
                            .replace(/\(\s*\)/g, "")
                            // collapse runs of whitespace introduced by deletions
                            .replace(/[ \t]{2,}/g, " ")
                            .replace(/\n{3,}/g, "\n\n")
                          // BOLD ALLOW-LIST ENFORCEMENT: the LLM keeps
                          // inventing new descriptor phrases to bold
                          // ("outdoor", "walking + food", "guided history",
                          // "self-paced exploration", "picturesque ruin",
                          // "compact & informative", …). A blocklist of
                          // forbidden words is whack-a-mole, so instead we
                          // ONLY keep `**…**` if the inner text matches a
                          // recognised data shape (time / duration / price /
                          // date / stop-count) OR looks like a proper-noun
                          // trip title (every token starts with an uppercase
                          // letter or digit, ignoring small connector words).
                          // Anything else is unbolded — the words still
                          // render, just without emphasis.
                          const TIME_PAT       = /^\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?(?:\s*[–\-]\s*\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?)?$/i
                          const DURATION_PAT   = /^\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|min(?:ute)?s?|mins?|days?|nights?)(?:\s+each)?$/i
                          const SIMPLE_DUR_PAT = /^(?:half|full)[-\s]?day$|^all[-\s]day$/i
                          const PRICE_PAT      = /^€\s*\d+(?:[.,]\d+)?(?:\s*[–\-]\s*\d+(?:[.,]\d+)?)?$/
                          const STOPS_PAT      = /^\d+\s*stops?$/i
                          const REL_DATE_PAT   = /^(?:today|tomorrow|tonight|this (?:morning|afternoon|evening|weekend)|next (?:week|weekend))$/i
                          const MONTH_DOW_PAT  = /\b(?:Mon|Tue|Tues|Wed|Wedn|Thu|Thur|Thurs|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\b/
                          const CONNECTOR_PAT  = /^(?:the|of|and|in|at|on|for|to|by|with|de|du|des|la|le|les|von|y|e|&|\+|-|–|—|–|\/|,|\.)$/i
                          const isAllowedBold = (raw: string): boolean => {
                            const inner = raw.trim()
                            if (!inner) return false
                            if (TIME_PAT.test(inner)) return true
                            if (DURATION_PAT.test(inner)) return true
                            if (SIMPLE_DUR_PAT.test(inner)) return true
                            if (PRICE_PAT.test(inner)) return true
                            if (STOPS_PAT.test(inner)) return true
                            if (REL_DATE_PAT.test(inner)) return true
                            // Date phrases: must contain a month/day-of-week
                            // AND only consist of capitalised words, digits,
                            // or connectors (e.g. "Sat 30 May", "Saturday 30 May",
                            // "Sat 30 May at 19:15"). Strict: any word like
                            // "best", "available", "picks", "matches",
                            // "outdoor", "guided" disqualifies.
                            const tokens = inner.split(/[\s,]+/).filter(t => t.length > 0)
                            if (tokens.length === 0) return false
                            if (tokens.length > 6) return false
                            const allTokensClean = tokens.every(t =>
                              /^[A-Z0-9]/.test(t) ||           // capitalised or digit
                              /^[€$£¥]/.test(t) ||             // currency
                              /^\d{1,2}[:.]\d{2}/.test(t) ||   // time
                              CONNECTOR_PAT.test(t) ||         // small connector
                              /^[–\-—&+/().]+$/.test(t)        // pure punctuation
                            )
                            if (!allTokensClean) return false
                            // Either it contains a month/dow (=date phrase)
                            // or it is a short proper-noun phrase (=trip title).
                            return MONTH_DOW_PAT.test(inner) || tokens.length <= 6
                          }
                          const desuperBolded = sanitized.replace(
                            /\*\*([^*]+)\*\*/g,
                            (match, inner: string) => {
                              if (isAllowedBold(inner)) return match
                              return inner
                            },
                          )
                          const clean = desuperBolded
                            .replace(/^#{1,3}\s+/gm, "")
                            .replace(/!\[.*?\]\(.*?\)/g, "")
                            .replace(/^[-*]\s+/gm, "")
                            .trim()
                          if (clean) {
                            // Split on `**…**` and wrap matches in <strong>.
                            // Odd-indexed pieces are the bold captures
                            // produced by the alternating split below.
                            const segments = clean.split(/\*\*([^*]+)\*\*/g)
                            textParts.push(
                              <p key={idx} className="whitespace-pre-wrap">
                                {segments.map((seg, si) =>
                                  si % 2 === 1
                                    ? <strong key={si} className="font-bold text-foreground">{seg}</strong>
                                    : <React.Fragment key={si}>{seg}</React.Fragment>
                                )}
                              </p>
                            )
                          }
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
                        case "tool-showWeatherAlert": {
                          if (part.state === "output-available") {
                            // Dedupe: only the first weather alert in the whole
                            // conversation renders — later ones (and re-renders
                            // of the same call) are suppressed.
                            const weatherToolCallId = (part as { toolCallId?: string }).toolCallId ?? ""
                            if (firstWeatherToolCallId && weatherToolCallId !== firstWeatherToolCallId) {
                              break
                            }
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
                            const itinerary = part.output as { steps: { time: string; tripTitle: string; tripId: string; durationMinutes: number; travelToNext?: string }[]; summary: string; visitDate?: string }
                            // Preflight gate (DEFAULT-DENY): the full card
                            // + "View Itinerary" button only renders once
                            // we've explicitly marked this toolCallId as
                            // "ready". Any other state — undefined (initial
                            // render before the auto-build effect commits),
                            // "checking", or "decision" — renders the stub
                            // so the chat never flashes a confident plan
                            // card before preflight clears.
                            const cardState = preflightCardState[(part as { toolCallId?: string }).toolCallId ?? ""]
                            if (cardState !== "ready") {
                              const dateLabel = itinerary.visitDate ? formatYMDPretty(itinerary.visitDate) : null
                              textParts.push(
                                <div key={idx} className="mt-2.5 overflow-hidden rounded-xl border border-border bg-card">
                                  <div className="flex items-center gap-2 bg-primary/5 px-3 py-2">
                                    <Route className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-xs font-bold text-foreground">
                                      {cardState === "decision" ? "Decision needed" : "Checking availability"}
                                    </span>
                                    {dateLabel && (
                                      <span className="text-[10px] font-semibold text-muted-foreground">· {dateLabel}</span>
                                    )}
                                    {cardState !== "decision" && (
                                      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="px-3 py-2.5">
                                    <p className="text-xs text-muted-foreground">
                                      {cardState === "decision"
                                        ? "Pick how to handle the conflict above before I load your Trip Canvas."
                                        : `Checking live availability${dateLabel ? ` for ${dateLabel}` : ""}…`}
                                    </p>
                                  </div>
                                </div>
                              )
                              break
                            }
                            // Collapse superseded plans: if a newer
                            // buildItinerary card exists, this one is stale —
                            // render a one-line note instead of a second full
                            // "Your Day Itinerary" timeline so the chat never
                            // shows two competing day plans at once.
                            const thisToolCallId = (part as { toolCallId?: string }).toolCallId ?? ""
                            if (lastItineraryToolCallId && thisToolCallId !== lastItineraryToolCallId) {
                              textParts.push(
                                <div key={idx} className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
                                  <Route className="h-3 w-3 shrink-0 opacity-60" />
                                  <span>Earlier plan — replaced by your updated itinerary below.</span>
                                </div>
                              )
                              break
                            }
                            // Trip ids from this AI plan — drives the View
                            // Itinerary button: if a real itinerary is
                            // already loaded for the same set of trips,
                            // just open it; otherwise (re)build via the
                            // /api/itinerary endpoint so live Palisis +
                            // Mapbox data drives the Canvas panel.
                            const planTripIds = itinerary.steps.map((s) => s.tripId).filter(Boolean)
                            textParts.push(
                              <div key={idx} className="mt-2.5 overflow-hidden rounded-xl border border-border bg-card">
                                <div className="flex items-center gap-2 bg-primary/5 px-3 py-2">
                                  <Route className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-xs font-bold text-foreground">Your Day Itinerary</span>
                                  {itinerary.visitDate && (
                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                      · {formatYMDPretty(itinerary.visitDate)}
                                    </span>
                                  )}
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
                                  {(() => {
                                    // Date-staleness: the visitor changed the date since this
                                    // plan card was built. Its timeslots no longer reflect the
                                    // selected day, so we MUST NOT offer a plain "View" (which
                                    // would re-open the old-date plan). Force a rebuild instead.
                                    // Prefer the card's own build date; fall back to the
                                    // loaded centerItinerary's date for any legacy card that
                                    // didn't record visitDate, so a stale plan can't slip
                                    // through as "Loaded on Trip Canvas".
                                    const cardBuildDate = itinerary.visitDate || centerItinerary?.visitDate
                                    const cardStale = !!cardBuildDate
                                      && !!prefs?.startDate
                                      && cardBuildDate !== prefs.startDate
                                    // If centerItinerary already represents this exact plan and the
                                    // panel is open, we show a confirmation badge instead of the View
                                    // button — clicking would be a no-op anyway and the badge makes
                                    // it crystal-clear the day is already loaded on the canvas.
                                    // (Suppressed when the date drifted — the loaded plan is stale.)
                                    const planSet = new Set(planTripIds)
                                    const builtSet = new Set(centerItinerary?.steps.map((s) => s.tripId) ?? [])
                                    const sameSet = centerItinerary
                                      && builtSet.size === planSet.size
                                      && [...planSet].every((id) => builtSet.has(id))
                                    if (sameSet && centerItineraryOpen && !cardStale) {
                                      return (
                                        <div className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-1.5 text-[11px] font-semibold text-primary">
                                          <Check className="h-3 w-3" />
                                          Loaded on Trip Canvas
                                        </div>
                                      )
                                    }
                                    return (
                                      <>
                                        {cardStale && (
                                          <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200">
                                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                                            <span>
                                              Your date changed to <strong>{prefs?.startDate ? formatYMDPretty(prefs.startDate) : "a new day"}</strong>. Rebuild to refresh times &amp; availability for that day.
                                            </span>
                                          </div>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleOpenOrRebuildFromChat(planTripIds)}
                                          disabled={itineraryRegenerating}
                                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                                        >
                                          {cardStale ? (
                                            <>
                                              <Sparkles className="h-3 w-3" />
                                              Rebuild for {prefs?.startDate ? formatYMDPretty(prefs.startDate) : "new date"}
                                            </>
                                          ) : (
                                            <>
                                              <Maximize2 className="h-3 w-3" />
                                              View Itinerary on Trip Canvas
                                            </>
                                          )}
                                        </button>
                                      </>
                                    )
                                  })()}
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadItineraryPdf(itinerary as unknown as Itinerary)}
                                    disabled={downloadingItineraryPdf}
                                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                                  >
                                    {downloadingItineraryPdf ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Download className="h-3 w-3" />
                                    )}
                                    Download your day itinerary
                                  </button>
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
                                <Check className="h-3.5 w-3.5 shrink-0" /><span>{(part.output as string) || "Saved to your trip list"}</span>
                              </div>
                            )
                          } else if (part.state === "input-available") {
                            textParts.push(<p key={idx} className="text-xs italic text-muted-foreground">Adding to your trip...</p>)
                          }
                          break
                        }
                        case "tool-removeFromCart":
                        case "tool-clearCart": {
                          if (part.state === "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-2 flex items-center gap-2 rounded-lg bg-secondary p-2 text-xs font-medium text-muted-foreground">
                                <Check className="h-3.5 w-3.5 shrink-0" /><span>{(part.output as string) || "Updated your trip list"}</span>
                              </div>
                            )
                          } else if (part.state === "input-available") {
                            textParts.push(<p key={idx} className="text-xs italic text-muted-foreground">Updating your trip list...</p>)
                          }
                          break
                        }
                        case "tool-getTripDetails": {
                          if (part.state !== "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Looking up trip details...</span>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-getTripTimeslots": {
                          if (part.state !== "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Checking live availability...</span>
                              </div>
                            )
                          }
                          break
                        }
                        case "tool-getTripDatesAndDeals": {
                          if (part.state !== "output-available") {
                            textParts.push(
                              <div key={idx} className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/40 border-t-transparent" />
                                <span>Fetching dates and offers...</span>
                              </div>
                            )
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
                          <div className={`rounded-2xl px-3.5 py-2.5 text-sm font-normal leading-relaxed ${isAssistant ? "rounded-tl-md bg-secondary text-foreground" : "rounded-tr-md bg-primary text-primary-foreground"}`}>
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
                  {isStreaming && messages.length > 0 && (() => {
                    // Show the "AI is thinking" dots whenever the visitor would
                    // otherwise be staring at a blank chat after sending a
                    // message. Two scenarios:
                    //   1) Last message is the user's — AI hasn't started.
                    //   2) Last message is the assistant's BUT it has no
                    //      visible text yet (only an in-flight tool call,
                    //      e.g. preflight is running). Previously dots only
                    //      covered (1), so the chat looked frozen during
                    //      slow tool-only turns.
                    const last = messages[messages.length - 1]
                    if (last?.role === "user") return true
                    if (last?.role !== "assistant") return false
                    const hasVisibleText = last.parts.some(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (p: any) => p?.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
                    )
                    return !hasVisibleText
                  })() && (
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

              {/* Context-aware quick replies — hidden while the AI is
                  generating OR the post-stream itinerary build is still
                  running. Showing chips at that moment is misleading
                  because the response on screen isn't final yet (user
                  complaint: "user thinks reply is done and types another
                  message while itinerary card is still loading"). */}
              {!isStreaming && !itineraryRegenerating && !chatLimitReached && suggestions.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-2 scrollbar-none">
                  {suggestions.map((s) => (
                    <button key={s.label} type="button" onClick={() => s.patch ? applyDirectPref(s.patch) : handleSend(s.action)}
                      className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Input — disabled while streaming OR while the post-
                  stream itinerary build is still in flight. The
                  placeholder switches to a "still building" message so
                  the visitor never wonders whether the response is
                  done. (Same user complaint as above.) */}
              <div className="border-t border-border px-4 py-3">
                {/* Single post-stream loader. While the AI is streaming, the
                    thinking dots above the input ARE the loader — showing a
                    second "Generating response…" banner here at the same time
                    is the "multiple simultaneous loaders" the visitor flagged.
                    So this banner only appears for the post-stream itinerary
                    build (when streaming has ended but the live /api/itinerary
                    fetch is still in flight). */}
                {itineraryRegenerating && !isStreaming && (
                  <div className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Finalizing your itinerary…</span>
                  </div>
                )}
                {chatLimitReached && (
                  <div className="mb-2 flex flex-col items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-center" data-testid="chat-limit-banner">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      You&apos;ve reached the chat limit for this session. Reset to start a fresh conversation.
                    </p>
                    <button type="button" onClick={() => setShowResetConfirm(true)} data-testid="chat-limit-reset"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                      <RotateCcw className="h-3.5 w-3.5" /> Reset chat
                    </button>
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); if (!isStreaming && !itineraryRegenerating && !chatLimitReached) handleSend(input) }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/40">
                  <input value={input} onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      chatLimitReached
                        ? "Chat limit reached — reset to start a new chat"
                        : isStreaming
                          ? "Wait for the response to finish…"
                          : itineraryRegenerating
                            ? "Finalizing your itinerary…"
                            : "Ask anything..."
                    }
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
                    disabled={isStreaming || itineraryRegenerating || chatLimitReached} />
                  <button type="submit" disabled={!input.trim() || isStreaming || itineraryRegenerating || chatLimitReached}
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
                <div ref={mapSectionRef} className={`border-t border-border ${mapExpanded ? "" : "hidden"}`}>
                  <SightseeingMap
                    trips={resultTrips}
                    onSelect={handleTripSelect}
                    visible={mapExpanded}
                    suppressFullscreen
                    itineraryTrips={itineraryMapTrips}
                    itineraryCoords={itineraryMapCoords}
                    itineraryStepIndices={itineraryMapStepIndices}
                    activeStopIndex={activeStopIndex}
                    activeLegIndex={activeLegIndex}
                    onStopClick={handleMapStopClick}
                    onLegClick={handleMapLegClick}
                    legMethods={legMethods}
                  />
                </div>
              </div>
              <ItineraryPanel
                itinerary={centerItinerary}
                onClose={handleCloseItinerary}
                onRegenerate={handleRegenerateItinerary}
                regenerating={itineraryRegenerating}
                onFocusStop={handleFocusStop}
                onFocusLeg={handleFocusLeg}
                onRemoveStep={handleRemoveItineraryStep}
                activeStopIndex={activeStopIndex}
                activeLegIndex={activeLegIndex}
                legMethods={legMethods}
                onLegMethodChange={handleLegMethodChange}
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
                <div className="flex items-center gap-3">
                  {(discoveringPrefs || (isStreaming && displayedAiTrips.length === 0)) && (
                    <Loader2 className="h-6 w-6 shrink-0 animate-spin text-primary" />
                  )}
                  <h1 className="text-balance text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">
                    {prefs ? "Finding your perfect trips…" : "Plan your perfect day"}<br />
                    <span className="text-primary">in Luxembourg</span>
                  </h1>
                </div>
                <p className="mt-3 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
                  {prefs
                    ? "Our AI is scanning the live catalog, checking today's weather, and matching your interests. Results will appear here momentarily."
                    : "Answer a few quick questions in the chat panel, and our AI will curate the perfect itinerary based on your interests and today's weather."}
                </p>
              </div>
              {prefs && (discoveringPrefs || (isStreaming && displayedAiTrips.length === 0)) && (
                /* Skeleton trip cards — fill the canvas while the first AI turn is in-flight
                   so visitors see structure instead of blank space during the ~2–4 s wait. */
                <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex animate-pulse items-start gap-3 rounded-2xl border border-border bg-card p-3"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    >
                      <div className="h-20 w-24 shrink-0 rounded-xl bg-secondary/70" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3.5 w-3/4 rounded-full bg-secondary/70" />
                        <div className="h-3 w-1/2 rounded-full bg-secondary/50" />
                        <div className="h-3 w-2/3 rounded-full bg-secondary/50" />
                        <div className="mt-2 flex gap-2">
                          <div className="h-5 w-14 rounded-full bg-secondary/60" />
                          <div className="h-5 w-16 rounded-full bg-secondary/60" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                onBook={() => { handleManualAddTrip(selectedTrip) }}
              />
              {/* Booking iframe — same dynamic per-trip form as the single-trip page */}
              <div className="border-t border-border px-4 py-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Book this experience</h3>
                {(selectedTrip.palisisProductId?.trim() || selectedTrip.permalink?.trim()) ? (
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="booking-iframe-wrap">
                      <iframe
                        src={selectedTrip.palisisProductId?.trim()
                          ? buildPalisisBookingUrl(selectedTrip.palisisProductId.trim())
                          : substitutePlaceholders(selectedTrip.permalink!.trim(), prefs?.startDate)
                        }
                        title={`Book ${selectedTrip.title}`}
                        className="booking-iframe"
                        allow="payment"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Booking is not available for this experience yet.
                  </p>
                )}
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
                  this branch only renders when no plan is open).
                  Recommendations are hidden until the visitor has picked
                  at least one interest, so the section is genuinely
                  preference-driven instead of a generic "top trips" list. */}
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">Recommended for you</h2>
                  {prefs && prefs.interests.length > 0 && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground" data-testid="planner-prefs-count">
                      {prefs.interests.length} interest{prefs.interests.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {/* Whenever we have recommendations to show, show them —
                    regardless of whether the visitor explicitly picked interests.
                    Skipping all onboarding leaves interests empty by design but
                    still yields weather/budget-scored fallback trips, so gating
                    the render on `interests.length` here was the second half of
                    the "canvas stuck / blank after Skip all" bug. Only fall back
                    to an empty-state message when there is genuinely nothing to
                    render. */}
                {resultTrips.length === 0 ? (
                  !prefs || prefs.interests.length === 0 ? (
                    <div
                      className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center"
                      data-testid="planner-recs-empty"
                    >
                      <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
                      <p className="text-sm font-medium text-foreground">Tell the AI what you like</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pick one or more interests in the chat (Food, Culture, Outdoor, Nightlife…) and we'll analyse the catalog to suggest trips that genuinely match.
                      </p>
                    </div>
                  ) : (
                    /* Interests are picked but nothing matched — most often
                       because the selected "time available" duration cap filters
                       out every catalog trip (e.g. only full-day tours match the
                       chosen interests but the visitor has 1-2 hours). Make the
                       cause explicit instead of rendering a blank panel. */
                    <div
                      className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center"
                      data-testid="planner-recs-none-fit"
                    >
                      <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
                      <p className="text-sm font-medium text-foreground">No trips fit those filters</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {durationCapHours(prefs.duration) != null
                          ? "Nothing in the catalog matches your interests within the time you have. Try allowing more time (Half day / Full day) or picking another interest."
                          : "Nothing in the catalog matches your interests yet. Try picking another interest in the chat."}
                      </p>
                    </div>
                  )
                ) : (() => {
                  /* Date feature = FILTER. When a date is selected, the canvas
                     shows ONLY the trips actually bookable on that date (so a
                     "this weekend" request lists just the weekend-available
                     trips, never the whole catalog). The "Available on other
                     dates" group is a graceful fallback that ONLY appears when
                     NOTHING is bookable on the selected date — so the canvas is
                     never left blank. With no date picked, a single
                     availability-then-score-sorted list is shown. */
                  const onDate = hasSelectedDate
                    ? resultTrips.filter((t) => plannerAvail[t.id]?.availableOnSelectedDate)
                    : []
                  const others = hasSelectedDate
                    ? resultTrips.filter((t) => !plannerAvail[t.id]?.availableOnSelectedDate)
                    : resultTrips
                  const renderCard = (trip: Trip, showDates: boolean) => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      onSelect={handleTripSelect}
                      isInCart={isInCart(trip.id)}
                      onAdd={handleManualAddTrip}
                      isBookmarked={savedLibrary.isInCart(trip.id)}
                      onToggleBookmark={toggleBookmark}
                      availableDates={showDates ? (plannerAvail[trip.id]?.availableDates ?? []) : undefined}
                    />
                  )
                  return (
                    <div className="flex flex-col gap-5" data-testid="planner-recs-list">
                      {hasSelectedDate ? (
                        <>
                          <div className="flex flex-col gap-3" data-testid="planner-recs-group-ondate">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                <Calendar className="h-3 w-3" /> Available on {formatYMDPretty(prefs!.startDate)}
                              </span>
                              <span className="text-xs text-muted-foreground">{onDate.length}</span>
                              {availLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            </div>
                            {onDate.length > 0 ? (
                              <div className="flex flex-col gap-3">{onDate.map((t) => renderCard(t, false))}</div>
                            ) : (
                              <p className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
                                {availLoading
                                  ? "Checking which trips are open on this date…"
                                  : others.length > 0
                                    ? `None of your matching trips have open slots on ${formatYMDPretty(prefs!.startDate)} yet — see other dates below.`
                                    : `None of your matching trips have open slots on ${formatYMDPretty(prefs!.startDate)} yet — try another date or interest.`}
                              </p>
                            )}
                          </div>
                          {/* Fallback ONLY when nothing is bookable on the selected
                              date — keeps the canvas from going blank without
                              diluting a date request with non-matching dates. */}
                          {onDate.length === 0 && !availLoading && others.length > 0 && (
                            <div className="flex flex-col gap-3" data-testid="planner-recs-group-other">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                                  <Calendar className="h-3 w-3" /> Available on other dates
                                </span>
                                <span className="text-xs text-muted-foreground">{others.length}</span>
                              </div>
                              <div className="flex flex-col gap-3">{others.map((t) => renderCard(t, true))}</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col gap-3">{others.map((t) => renderCard(t, true))}</div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ───── RIGHT: Cart (desktop) — always the cart, even when the
            itinerary panel is open in the center. The Build/View
            Itinerary CTA at the bottom controls the center panel. */}
        <div className="hidden w-80 flex-col border-l border-border bg-card xl:flex">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">My Trip</span>
            </div>
            <button
              type="button"
              onClick={loadSavedIntoPlanner}
              disabled={savedLibrary.items.length === 0}
              data-testid="planner-load-saved"
              title="Add your Saved Trips to this planner list"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Bookmark className="h-3 w-3" /> Load saved trips
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <TripCart persons={(prefs?.adults ?? 1) + (prefs?.children ?? 0)} disabledMap={plannerDisabledMap} />
          </div>
          <div className="shrink-0">
            <SidebarItinerary
              onOpenItinerary={handleOpenItinerary}
              onItineraryBuilt={handleItineraryBuilt}
              existingItinerary={centerItinerary}
              cartFingerprint={cartFingerprint}
              disabledIds={plannerDisabledIds}
              prefs={prefs}
              onUpdatePrefs={handleSidebarPrefsUpdate}
              onPlanConflict={handlePlanConflict}
              onItineraryFailure={handleItineraryFailure}
            />
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={loadSavedIntoPlanner}
                    disabled={savedLibrary.items.length === 0}
                    data-testid="planner-load-saved-mobile"
                    title="Add your Saved Trips to this planner list"
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Bookmark className="h-3 w-3" /> Load saved trips
                  </button>
                  <button type="button" onClick={() => setCartOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TripCart persons={(prefs?.adults ?? 1) + (prefs?.children ?? 0)} disabledMap={plannerDisabledMap} />
              </div>
              <div className="shrink-0">
                <SidebarItinerary
                  onOpenItinerary={handleOpenItinerary}
                  onItineraryBuilt={handleItineraryBuilt}
                  existingItinerary={centerItinerary}
                  cartFingerprint={cartFingerprint}
                  disabledIds={plannerDisabledIds}
                  prefs={prefs}
                  onUpdatePrefs={handleSidebarPrefsUpdate}
                  onPlanConflict={handlePlanConflict}
                  onItineraryFailure={handleItineraryFailure}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset confirmation — wiping chat + prefs + trip list + itinerary is
          destructive, so we confirm first. */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-confirm-title" className="text-lg font-bold text-foreground">
              Start over?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This clears your chat, preferences, the current itinerary and your
              My&nbsp;Trip list. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                data-testid="reset-cancel"
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetPrefs}
                data-testid="reset-confirm"
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
