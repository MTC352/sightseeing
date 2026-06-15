"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Save,
  Brain,
  Clock,
  Target,
  Sparkles,
  MapPin,
  Utensils,
  Bus,
  Car,
  Footprints,
  RotateCcw,
  Settings2,
  Sliders,
} from "lucide-react"
import { ActiveProviderBadge, useActiveAiProvider } from "@/components/admin/active-ai-provider"
import { PageHeaderSkeleton, CardSkeleton } from "@/components/admin/ai-system-skeleton"

interface PlannerBehaviorSettings {
  model: string
  optimizationPriority: "minimize_travel" | "maximize_activities" | "budget_conscious" | "balanced"
  preferenceWeighting: number
  suggestionRandomness: number
  localFavoritesBias: number
  availabilityWindowDays: number
  bufferTimeBetweenStops: number
  maxStopsPerDay: number
  defaultActivityDuration: number
  dayStartTime: string
  dayEndTime: string
  autoInsertMealBreaks: boolean
  lunchBreakTime: string
  dinnerBreakTime: string
  mealBreakDuration: number
  travelTimeMethod: "walking" | "driving" | "public_transport"
  pace: "relaxed" | "balanced" | "packed"
  mapProvider: "mapbox" | "google"
  hidePublicPlanner: boolean
}

const DEFAULT_SETTINGS: PlannerBehaviorSettings = {
  model: "anthropic/claude-opus-4.6",
  optimizationPriority: "balanced",
  preferenceWeighting: 70,
  suggestionRandomness: 30,
  localFavoritesBias: 40,
  availabilityWindowDays: 30,
  bufferTimeBetweenStops: 30,
  maxStopsPerDay: 6,
  defaultActivityDuration: 90,
  dayStartTime: "09:00",
  dayEndTime: "21:00",
  autoInsertMealBreaks: true,
  lunchBreakTime: "12:30",
  dinnerBreakTime: "19:00",
  mealBreakDuration: 60,
  travelTimeMethod: "public_transport",
  pace: "balanced",
  mapProvider: "mapbox",
  hidePublicPlanner: false,
}

const PACE_OPTIONS = [
  { value: "relaxed", label: "Relaxed", description: "Roomier, fewer stops" },
  { value: "balanced", label: "Balanced", description: "Default rhythm" },
  { value: "packed", label: "Packed", description: "Tighter, more stops" },
]

const MAP_PROVIDERS = [
  { value: "mapbox", label: "Mapbox", description: "Live routing" },
  { value: "google", label: "Google Maps", description: "Needs Directions key" },
]

const OPTIMIZATION_OPTIONS = [
  { value: "balanced", label: "Balanced", description: "Equal weight to all factors" },
  { value: "minimize_travel", label: "Minimize Travel", description: "Prioritize nearby activities" },
  { value: "maximize_activities", label: "Maximize Activities", description: "Fit more into each day" },
  { value: "budget_conscious", label: "Budget Conscious", description: "Prefer affordable options" },
]

const TRAVEL_METHODS = [
  { value: "public_transport", label: "Public Transport", icon: Bus, description: "Free in Luxembourg" },
  { value: "walking", label: "Walking", icon: Footprints, description: "For compact itineraries" },
  { value: "driving", label: "Driving", icon: Car, description: "For spread-out destinations" },
]

export default function PlannerBehaviorPage() {
  const { provider: activeProvider, models: MODELS, ready } = useActiveAiProvider()
  const [settings, setSettings] = useState<PlannerBehaviorSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/admin/planner-behavior")
      .then((res) => res.json())
      .then((data) => setSettings({ ...DEFAULT_SETTINGS, ...data }))
      .catch(() => setSettings(DEFAULT_SETTINGS))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await fetch("/api/admin/planner-behavior", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error("Failed to save:", err)
    } finally {
      setSaving(false)
    }
  }

  function resetToDefaults() {
    setSettings(DEFAULT_SETTINGS)
  }

  const labelClass = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
  const inputClass = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
  const selectClass = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none appearance-none cursor-pointer"

  if (loading || !ready) {
    return (
      <div className="p-6 lg:p-10">
        <PageHeaderSkeleton withBack />
        <div className="grid max-w-4xl gap-6 md:grid-cols-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/ai-systems/planner"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">
              AI Systems / Trip Planner
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">Planner Behavior</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Public Visibility */}
        <section className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Sliders className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Public Visibility</h2>
                <p className="text-xs text-muted-foreground">
                  Hide the Trip Planner page and its navigation link from visitors who aren&apos;t logged in.
                  Logged-in admins can still open it to preview.
                </p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.hidePublicPlanner}
                onChange={(e) => setSettings({ ...settings, hidePublicPlanner: e.target.checked })}
                className="peer sr-only"
                data-testid="hide-public-planner-toggle"
              />
              <div className="peer h-6 w-11 rounded-full bg-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
            </label>
          </div>
          {settings.hidePublicPlanner && (
            <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              The Trip Planner is currently hidden from the public. Only logged-in admins can access it.
            </p>
          )}
        </section>

        {/* AI Planner Behavior */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">AI Behavior</h2>
                <ActiveProviderBadge provider={activeProvider} />
              </div>
              <p className="text-xs text-muted-foreground">Control how the AI generates recommendations</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Model Selection */}
            <div>
              <label className={labelClass}>Planner Model</label>
              <select
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                className={selectClass}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                The AI model that powers trip recommendations and itinerary building
              </p>
            </div>

            {/* Optimization Priority */}
            <div>
              <label className={labelClass}>Optimization Priority</label>
              <div className="grid grid-cols-2 gap-2">
                {OPTIMIZATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings({ ...settings, optimizationPriority: opt.value as typeof settings.optimizationPriority })}
                    className={`flex flex-col items-start rounded-xl border-2 p-3 text-left transition-colors ${
                      settings.optimizationPriority === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-2">
                  <Target className="h-3 w-3" />
                  Preference Weighting
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.preferenceWeighting}
                  onChange={(e) => setSettings({ ...settings, preferenceWeighting: parseInt(e.target.value) })}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
                <span className="w-10 text-right text-sm font-medium text-foreground">{settings.preferenceWeighting}%</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                How strongly user preferences (accessibility, pace, interests) influence recommendations
              </p>
            </div>

            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3 w-3" />
                  Suggestion Variety
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.suggestionRandomness}
                  onChange={(e) => setSettings({ ...settings, suggestionRandomness: parseInt(e.target.value) })}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
                <span className="w-10 text-right text-sm font-medium text-foreground">{settings.suggestionRandomness}%</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Low = predictable top picks, High = more varied and surprising recommendations
              </p>
            </div>

            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Hidden Gems vs Popular
                </span>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">Popular</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.localFavoritesBias}
                  onChange={(e) => setSettings({ ...settings, localFavoritesBias: parseInt(e.target.value) })}
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-secondary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                />
                <span className="text-[10px] text-muted-foreground">Hidden Gems</span>
              </div>
              <p className="mt-1 text-center text-xs font-medium text-foreground">{settings.localFavoritesBias}%</p>
            </div>

            {/* Availability Scan Window */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Availability Scan Window
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="7"
                  max="120"
                  step="1"
                  value={settings.availabilityWindowDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      availabilityWindowDays: Math.min(120, Math.max(7, parseInt(e.target.value) || 30)),
                    })
                  }
                  className={inputClass}
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                How many days ahead the Trip Planner scans for availability when showing recommendations.
                Near dates scan today → +{settings.availabilityWindowDays} days; far dates scan{" "}
                {Math.round(settings.availabilityWindowDays / 2)} days before/after the selected date.
              </p>
            </div>
          </div>
        </section>

        {/* Itinerary & Scheduling */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Settings2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Itinerary Settings</h2>
              <p className="text-xs text-muted-foreground">Configure timing and scheduling defaults</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Time inputs row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Day Start Time</label>
                <input
                  type="time"
                  value={settings.dayStartTime}
                  onChange={(e) => setSettings({ ...settings, dayStartTime: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Day End Time</label>
                <input
                  type="time"
                  value={settings.dayEndTime}
                  onChange={(e) => setSettings({ ...settings, dayEndTime: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Buffer time */}
            <div>
              <label className={labelClass}>
                <span className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Buffer Time Between Stops
                </span>
              </label>
              <div className="flex items-center gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setSettings({ ...settings, bufferTimeBetweenStops: mins })}
                    className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-medium transition-colors ${
                      settings.bufferTimeBetweenStops === mins
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Padding between activities for exploration, photos, and spontaneous moments
              </p>
            </div>

            {/* Numeric inputs row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Max Stops Per Day</label>
                <input
                  type="number"
                  min="2"
                  max="12"
                  value={settings.maxStopsPerDay}
                  onChange={(e) => setSettings({ ...settings, maxStopsPerDay: parseInt(e.target.value) || 6 })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Default Activity Duration</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="30"
                    max="240"
                    step="15"
                    value={settings.defaultActivityDuration}
                    onChange={(e) => setSettings({ ...settings, defaultActivityDuration: parseInt(e.target.value) || 90 })}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
            </div>

            {/* Travel Method */}
            <div>
              <label className={labelClass}>Default Travel Method</label>
              <div className="grid grid-cols-3 gap-2">
                {TRAVEL_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setSettings({ ...settings, travelTimeMethod: method.value as typeof settings.travelTimeMethod })}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-colors ${
                      settings.travelTimeMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <method.icon className={`h-5 w-5 ${settings.travelTimeMethod === method.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-medium text-foreground">{method.label}</span>
                    <span className="text-[9px] text-muted-foreground">{method.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pace */}
            <div>
              <label className={labelClass}>Default Pace</label>
              <div className="grid grid-cols-3 gap-2">
                {PACE_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSettings({ ...settings, pace: p.value as typeof settings.pace })}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors ${
                      settings.pace === p.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className="text-xs font-medium text-foreground">{p.label}</span>
                    <span className="text-[9px] text-muted-foreground">{p.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Scales buffer time and target number of stops (always clamped to Max Stops Per Day).
              </p>
            </div>

            {/* Map / Routing Provider */}
            <div>
              <label className={labelClass}>Map / Routing Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {MAP_PROVIDERS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSettings({ ...settings, mapProvider: m.value as typeof settings.mapProvider })}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-colors ${
                      settings.mapProvider === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className="text-xs font-medium text-foreground">{m.label}</span>
                    <span className="text-[9px] text-muted-foreground">{m.description}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Mapbox is live today. Google requires a Directions API key — until one is added it falls back to Mapbox.
              </p>
            </div>
          </div>
        </section>

        {/* Meal Breaks */}
        <section className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Utensils className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Meal Breaks</h2>
                <p className="text-xs text-muted-foreground">Auto-insert lunch and dinner breaks into itineraries</p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={settings.autoInsertMealBreaks}
                onChange={(e) => setSettings({ ...settings, autoInsertMealBreaks: e.target.checked })}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-secondary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
            </label>
          </div>

          {settings.autoInsertMealBreaks && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Lunch Time</label>
                <input
                  type="time"
                  value={settings.lunchBreakTime}
                  onChange={(e) => setSettings({ ...settings, lunchBreakTime: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Dinner Time</label>
                <input
                  type="time"
                  value={settings.dinnerBreakTime}
                  onChange={(e) => setSettings({ ...settings, dinnerBreakTime: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Break Duration</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="30"
                    max="120"
                    step="15"
                    value={settings.mealBreakDuration}
                    onChange={(e) => setSettings({ ...settings, mealBreakDuration: parseInt(e.target.value) || 60 })}
                    className={inputClass}
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Preview Card */}
        <section className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Settings Preview</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Model: <span className="font-medium text-foreground">{settings.model.split("/").pop()}</span>
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Priority: <span className="font-medium text-foreground">{OPTIMIZATION_OPTIONS.find(o => o.value === settings.optimizationPriority)?.label}</span>
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Day: <span className="font-medium text-foreground">{settings.dayStartTime} - {settings.dayEndTime}</span>
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Buffer: <span className="font-medium text-foreground">{settings.bufferTimeBetweenStops} min</span>
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Max stops: <span className="font-medium text-foreground">{settings.maxStopsPerDay}/day</span>
            </span>
            <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              Travel: <span className="font-medium text-foreground">{TRAVEL_METHODS.find(t => t.value === settings.travelTimeMethod)?.label}</span>
            </span>
            {settings.autoInsertMealBreaks && (
              <span className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
                Meals: <span className="font-medium text-foreground">{settings.lunchBreakTime} / {settings.dinnerBreakTime}</span>
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
