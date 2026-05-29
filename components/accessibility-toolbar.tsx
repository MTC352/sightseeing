"use client"

import { useState, useEffect, useCallback } from "react"
import { Accessibility, ZoomIn, ZoomOut, Sun, Type, RotateCcw, X } from "lucide-react"

const STORAGE_KEY = "a11y_prefs_v1"

interface A11yPrefs {
  fontSize: number      // 0 = default, 1 = +1 step, 2 = +2 steps
  contrast: boolean
  dyslexia: boolean
  focusOutline: boolean
}

const DEFAULT: A11yPrefs = { fontSize: 0, contrast: false, dyslexia: false, focusOutline: false }

function loadPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<A11yPrefs>) }
  } catch {
    return DEFAULT
  }
}

function applyPrefs(p: A11yPrefs) {
  const root = document.documentElement
  // Font size: each step = +15%
  root.style.fontSize = p.fontSize === 0 ? "" : `${100 + p.fontSize * 15}%`
  // High contrast
  root.classList.toggle("a11y-contrast", p.contrast)
  // Dyslexia font
  root.classList.toggle("a11y-dyslexia", p.dyslexia)
  // Enhanced focus outlines
  root.classList.toggle("a11y-focus", p.focusOutline)
}

export function AccessibilityToolbar() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const p = loadPrefs()
    setPrefs(p)
    applyPrefs(p)
    setMounted(true)
  }, [])

  const update = useCallback((patch: Partial<A11yPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      applyPrefs(next)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setPrefs(DEFAULT)
    applyPrefs(DEFAULT)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  if (!mounted) return null

  return (
    <>
      {/* Injected global styles for accessibility modes */}
      <style>{`
        .a11y-contrast { filter: contrast(1.5) !important; }
        .a11y-contrast img { filter: none !important; }
        .a11y-dyslexia * { font-family: Georgia, serif !important; letter-spacing: 0.05em !important; word-spacing: 0.1em !important; line-height: 1.8 !important; }
        .a11y-focus *:focus { outline: 3px solid #ff6600 !important; outline-offset: 3px !important; }
        .a11y-focus a:focus, .a11y-focus button:focus { box-shadow: 0 0 0 4px rgba(255,102,0,0.3) !important; }
      `}</style>

      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Accessibility options"
        aria-expanded={open}
        aria-controls="a11y-panel"
        className="fixed bottom-20 right-4 z-[9998] flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        style={{ bottom: open ? "auto" : undefined }}
      >
        <Accessibility className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Panel */}
      {open && (
        <div
          id="a11y-panel"
          role="dialog"
          aria-label="Accessibility settings"
          aria-modal="false"
          className="fixed bottom-20 right-4 z-[9997] w-64 rounded-2xl border border-border bg-background shadow-2xl sm:bottom-20 sm:right-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Accessibility className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Accessibility</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close accessibility panel"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Controls */}
          <div className="divide-y divide-border">
            {/* Text size */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs font-medium text-foreground">Text size</span>
              </div>
              <div className="flex items-center gap-1" role="group" aria-label="Adjust text size">
                <button
                  type="button"
                  onClick={() => update({ fontSize: Math.max(0, prefs.fontSize - 1) })}
                  disabled={prefs.fontSize === 0}
                  aria-label="Decrease text size"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-xs font-medium text-foreground" aria-live="polite">
                  {prefs.fontSize === 0 ? "A" : prefs.fontSize === 1 ? "A+" : "A++"}
                </span>
                <button
                  type="button"
                  onClick={() => update({ fontSize: Math.min(2, prefs.fontSize + 1) })}
                  disabled={prefs.fontSize === 2}
                  aria-label="Increase text size"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* High contrast */}
            <ToggleRow
              icon={<Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              label="High contrast"
              checked={prefs.contrast}
              onChange={(v) => update({ contrast: v })}
            />

            {/* Dyslexia-friendly font */}
            <ToggleRow
              icon={<span className="text-xs font-bold text-muted-foreground" aria-hidden="true">Aa</span>}
              label="Dyslexia-friendly font"
              checked={prefs.dyslexia}
              onChange={(v) => update({ dyslexia: v })}
            />

            {/* Enhanced focus */}
            <ToggleRow
              icon={<span className="h-4 w-4 flex items-center justify-center text-muted-foreground text-xs border-2 border-current rounded" aria-hidden="true" />}
              label="Enhanced focus outlines"
              checked={prefs.focusOutline}
              onChange={(v) => update({ focusOutline: v })}
            />
          </div>

          {/* Reset */}
          <div className="border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={reset}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          </div>

          <p className="px-4 pb-3 text-[10px] text-muted-foreground/60 text-center">
            Built for WCAG 2.1 AA · EAA 2025
          </p>
        </div>
      )}
    </>
  )
}

function ToggleRow({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = `a11y-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        {icon}
        <label htmlFor={id} className="text-xs font-medium text-foreground cursor-pointer">{label}</label>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
          ${checked ? "bg-primary" : "bg-secondary border border-border"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  )
}
