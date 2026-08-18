"use client"

import { useEffect } from "react"

// Rendered inside the 404 page. It mounts in the browser ONLY when the not-found
// UI is actually shown (a real 404 / soft-404), never on successful 200 pages —
// so it records genuine broken links without the false positives a server-side
// not-found boundary would produce. Fire-and-forget; failures are ignored.
export function Track404() {
  useEffect(() => {
    const path = window.location.pathname
    if (!path || path === "/") return
    fetch("/api/log-404", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {})
  }, [])
  return null
}
