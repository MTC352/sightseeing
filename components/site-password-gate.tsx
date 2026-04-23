"use client"

import { useState, useEffect } from "react"
import { Lock } from "lucide-react"

const SITE_PIN = "3462"
const GATE_KEY = "site_gate_auth"
const GATE_EXPIRY_KEY = "site_gate_expiry"
const GATE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

function isGateValid(): boolean {
  if (typeof window === "undefined") return false
  const expiry = localStorage.getItem(GATE_EXPIRY_KEY)
  if (!expiry) return false
  const expiryTime = parseInt(expiry, 10)
  return Date.now() < expiryTime
}

export function SitePasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (isGateValid()) {
      setAuthed(true)
    }
  }, [])

  if (!mounted) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === SITE_PIN) {
      const expiryTime = Date.now() + GATE_DURATION_MS
      localStorage.setItem(GATE_KEY, "true")
      localStorage.setItem(GATE_EXPIRY_KEY, expiryTime.toString())
      setAuthed(true)
      setPin("")
      setError(false)
    } else {
      setError(true)
      setPin("")
      setTimeout(() => setError(false), 1800)
    }
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-secondary">
        <form onSubmit={submit} className="w-full max-w-xs rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Site Access</h1>
            <p className="mt-1 text-sm text-muted-foreground">This site is currently in development</p>
            <p className="mt-2 text-xs text-muted-foreground">Enter the PIN to continue</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            className={`w-full rounded-lg border bg-background px-4 py-3 text-center text-lg tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 ${
              error ? "border-destructive focus:ring-destructive/20" : "border-border focus:ring-primary/30"
            }`}
            autoFocus
          />
          {error && <p className="mt-2 text-center text-xs text-destructive">Incorrect PIN</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Unlock
          </button>
          <p className="mt-4 text-center text-[11px] text-muted-foreground/50">Access valid for 24 hours</p>
        </form>
      </div>
    )
  }

  return <>{children}</>
}
