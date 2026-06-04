"use client"

import { useState } from "react"
import { GripVertical, Plus, Trash2, Sparkles, Loader2, ArrowDown, AlertCircle } from "lucide-react"
import type { ItineraryStep } from "@/lib/admin-store"

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

  const list = steps ?? []

  function update(next: ItineraryStep[]) {
    onChange(next)
  }

  function setField(index: number, field: keyof ItineraryStep, value: string) {
    update(list.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
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
            .map((s: { name?: unknown; description?: unknown }) => ({
              name: String(s?.name ?? "").trim(),
              description: String(s?.description ?? "").trim(),
            }))
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
    </section>
  )
}
