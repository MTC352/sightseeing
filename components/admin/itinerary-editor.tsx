"use client"

import { useState } from "react"
import { GripVertical, Plus, Trash2, Sparkles, Loader2, ArrowDown, AlertCircle, MapPin, X } from "lucide-react"
import type { ItineraryStep } from "@/lib/admin-store"
import { LocationPicker, type PickedLocation } from "@/components/admin/location-picker"

interface ItineraryEditorProps {
  tripId?: string
  steps: ItineraryStep[]
  onChange: (steps: ItineraryStep[]) => void
  disabled?: boolean
}

const emptyStep = (): ItineraryStep => ({ name: "", description: "" })

export function ItineraryEditor({ tripId, steps, onChange, disabled }: ItineraryEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  const list = steps ?? []

  function update(next: ItineraryStep[]) {
    onChange(next)
  }

  function setField(index: number, field: keyof ItineraryStep, value: string) {
    update(list.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function setLocation(index: number, loc: PickedLocation) {
    update(
      list.map((s, i) =>
        i === index ? { ...s, lat: loc.lat, lng: loc.lng, placeName: loc.placeName || null } : s,
      ),
    )
  }

  function clearLocation(index: number) {
    update(
      list.map((s, i) =>
        i === index ? { ...s, lat: null, lng: null, placeName: null } : s,
      ),
    )
  }

  function hasLocation(s: ItineraryStep): boolean {
    return typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng)
  }

  function addStep() {
    update([...list, emptyStep()])
  }

  function insertAfter(index: number) {
    const next = [...list]
    next.splice(index + 1, 0, emptyStep())
    update(next)
  }

  function removeStep(index: number) {
    update(list.filter((_, i) => i !== index))
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    update(next)
  }

  function handleDrop(target: number) {
    if (dragIndex !== null) move(dragIndex, target)
    setDragIndex(null)
    setOverIndex(null)
  }

  async function generateWithAI() {
    if (!tripId) {
      setError("Save the trip once before generating an itinerary with AI.")
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/itinerary-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "Failed to generate itinerary.")
        return
      }
      const generated: ItineraryStep[] = Array.isArray(data.steps)
        ? data.steps
            .map((s: { name?: unknown; description?: unknown; lat?: unknown; lng?: unknown; placeName?: unknown }) => {
              const base: ItineraryStep = {
                name: String(s?.name ?? "").trim(),
                description: String(s?.description ?? "").trim(),
              }
              const lat = typeof s?.lat === "number" && Number.isFinite(s.lat) ? s.lat : null
              const lng = typeof s?.lng === "number" && Number.isFinite(s.lng) ? s.lng : null
              if (lat !== null && lng !== null) {
                base.lat = lat
                base.lng = lng
                base.placeName = typeof s?.placeName === "string" ? s.placeName : null
              }
              return base
            })
            .filter((s: ItineraryStep) => s.name && s.description)
        : []
      if (generated.length === 0) {
        setError("The AI returned no usable steps. Please try again.")
        return
      }
      update(generated)
    } catch {
      setError("Network error while generating. Please try again.")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Itinerary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Step-by-step stops shown on the public trip page. Drag to reorder.
          </p>
        </div>
        <button
          type="button"
          onClick={generateWithAI}
          disabled={disabled || generating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Generating…" : "Generate Itinerary with AI"}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {list.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No itinerary steps yet. Add one manually or generate them with AI.
          </div>
        )}

        {list.map((step, i) => (
          <div
            key={i}
            draggable={!disabled}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (overIndex !== i) setOverIndex(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(i)
            }}
            className={`group relative rounded-lg border bg-background p-3 transition ${
              overIndex === i && dragIndex !== null && dragIndex !== i
                ? "border-primary ring-1 ring-primary"
                : "border-border"
            } ${dragIndex === i ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-label="Drag to reorder"
                disabled={disabled}
                className="mt-1.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed"
                onMouseDown={(e) => e.currentTarget.parentElement?.parentElement?.setAttribute("draggable", "true")}
              >
                <GripVertical className="h-4 w-4" />
              </button>

              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={step.name}
                  disabled={disabled}
                  onChange={(e) => setField(i, "name", e.target.value)}
                  placeholder="Step name (e.g. Vianden Castle)"
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-primary disabled:opacity-60"
                />
                <textarea
                  value={step.description}
                  disabled={disabled}
                  onChange={(e) => setField(i, "description", e.target.value)}
                  placeholder="Short description of this stop…"
                  rows={2}
                  className="w-full resize-y rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                />

                {hasLocation(step) ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5 text-xs">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {step.placeName || `${(step.lat as number).toFixed(5)}, ${(step.lng as number).toFixed(5)}`}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setPickerIndex(i)}
                      className="rounded px-1.5 py-0.5 font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => clearLocation(i)}
                      aria-label="Remove location"
                      title="Remove location"
                      className="rounded p-0.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setPickerIndex(i)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Select location from Map{" "}
                    <span className="text-[10px] font-normal opacity-70">(optional)</span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label="Insert step below"
                  disabled={disabled}
                  onClick={() => insertAfter(i)}
                  title="Insert a step below"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete step"
                  disabled={disabled}
                  onClick={() => removeStep(i)}
                  title="Delete this step"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addStep}
        disabled={disabled}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add step
      </button>

      {pickerIndex !== null && list[pickerIndex] && (
        <LocationPicker
          title={list[pickerIndex].name || `Step ${pickerIndex + 1}`}
          initial={{
            lat: list[pickerIndex].lat,
            lng: list[pickerIndex].lng,
            placeName: list[pickerIndex].placeName,
          }}
          onClose={() => setPickerIndex(null)}
          onConfirm={(loc) => {
            setLocation(pickerIndex, loc)
            setPickerIndex(null)
          }}
        />
      )}
    </section>
  )
}
