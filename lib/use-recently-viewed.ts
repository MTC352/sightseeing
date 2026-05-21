"use client"

/**
 * Recently-Viewed trip tracker.
 *
 * Persists the IDs of the last N trips a visitor opened (via /trip/[id]) in
 * localStorage so the home page "Recently Viewed" rail can show them on the
 * next visit. Most-recent first, deduped, capped at MAX entries.
 *
 * Storage key: `sightseeing:recently_viewed:v1`
 * Shape:       string[]   — ordered list of trip ids (newest first)
 */

import { useEffect, useState, useCallback } from "react"

const STORAGE_KEY = "sightseeing:recently_viewed:v1"
const MAX = 8 // store a few extra so we can still show 4 after filtering to published
// Cross-tab / cross-component live updates use a custom event since the
// browser `storage` event only fires in *other* tabs, not the originating one.
const CHANGE_EVENT = "sightseeing:recently_viewed:change"

function readSafe(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX)
  } catch {
    return []
  }
}

function writeSafe(ids: string[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* quota / privacy mode — silently ignore */
  }
}

/**
 * Record that the current visitor just opened a trip. Safe to call from a
 * client-component useEffect; it's a no-op on the server or if the id is empty.
 */
export function trackTripView(id: string | number | undefined | null): void {
  if (id === undefined || id === null) return
  const sid = String(id).trim()
  if (!sid) return
  const current = readSafe()
  const next = [sid, ...current.filter((x) => x !== sid)].slice(0, MAX)
  writeSafe(next)
}

/**
 * Subscribe to the recently-viewed list. Returns the live array (newest first)
 * and reflects updates from this tab and other tabs.
 */
export function useRecentlyViewed(): string[] {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    // Hydrate after mount so SSR markup matches the empty initial render and
    // we avoid hydration mismatches.
    setIds(readSafe())
    const onChange = () => setIds(readSafe())
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  return ids
}

/** Clears the recently-viewed list — exposed for completeness / future settings UI. */
export function useClearRecentlyViewed(): () => void {
  return useCallback(() => writeSafe([]), [])
}
