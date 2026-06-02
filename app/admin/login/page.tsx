"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LayoutDashboard, Eye, EyeOff, Loader2 } from "lucide-react"

function safeRedirect(url: string | null): string {
  if (!url) return "/admin"
  if (url.startsWith("/") && !url.startsWith("//")) return url
  return "/admin"
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = safeRedirect(searchParams.get("redirect"))

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    // If already logged in, redirect
    fetch("/api/admin/auth/me").then((res) => {
      if (res.ok) router.replace(redirect)
    })
  }, [redirect, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      })
      if (res.ok) {
        router.push(redirect)
        router.refresh()
      } else {
        const body = await res.json()
        setError(body.error ?? "Login failed")
      }
    } catch {
      setError("Network error — please try again")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LayoutDashboard className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Admin Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">sightseeing.lu back-office</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username or email</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="username or admin@sightseeing.lu"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
