"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Pencil, X, CheckCircle, Eye, Save, AlertCircle } from "lucide-react"
import { AutoEditableLayer } from "@/components/auto-editable-layer"
import { SavedContentApplier } from "@/components/saved-content-applier"
import { INLINE_CONTENT_SLUG } from "@/lib/page-content-slug"

interface EditModeCtx {
  isEditMode: boolean
  pendingChanges: Record<string, string>
  savedChanges: Record<string, string>
  addChange: (key: string, value: string) => void
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  pendingChanges: {},
  savedChanges: {},
  addChange: () => {},
})

export function useEditMode() {
  return useContext(EditModeContext)
}

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Raw URL intent — true only if the query param is present.
  const paramRequested = searchParams.get("admin_edit") === "1"

  // Verified state — starts as false and becomes true only after the
  // /api/admin/auth/me check confirms a valid admin session. If the
  // param is absent, this stays false without making any network call.
  const [adminVerified, setAdminVerified] = useState(false)

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  const [savedChanges, setSavedChanges] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // Whenever the param appears (or the page mounts with it), check the
  // admin session. If the check fails (not logged in, session expired,
  // or admin logged out), strip the param from the URL silently so it
  // cannot be bookmarked / shared.
  useEffect(() => {
    if (!paramRequested) {
      setAdminVerified(false)
      return
    }
    let cancelled = false
    fetch("/api/admin/auth/me", { credentials: "include" })
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setAdminVerified(true)
        } else {
          // Session invalid or not logged in — strip param and deny.
          setAdminVerified(false)
          const params = new URLSearchParams(searchParams.toString())
          params.delete("admin_edit")
          const qs = params.toString()
          router.replace(pathname + (qs ? `?${qs}` : ""))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdminVerified(false)
          const params = new URLSearchParams(searchParams.toString())
          params.delete("admin_edit")
          const qs = params.toString()
          router.replace(pathname + (qs ? `?${qs}` : ""))
        }
      })
    return () => { cancelled = true }
  // Re-run whenever the param changes OR the pathname changes (catches
  // navigations that might reload the component tree).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramRequested, pathname])

  // The actual gate: both the URL param AND the server-verified session
  // must be true.
  const isEditMode = paramRequested && adminVerified

  // Load all persisted inline edits once on mount — for EVERY visitor, not just
  // admins — so the live site reflects saved edits immediately.
  useEffect(() => {
    fetch("/api/page-content")
      .then((r) => r.json())
      .then((data: Record<string, string>) => setSavedChanges(data ?? {}))
      .catch(() => {})
  }, [])

  const addChange = useCallback((key: string, value: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Reset pending changes when edit mode is toggled off.
  useEffect(() => {
    if (!isEditMode) {
      setPendingChanges({})
      setSaveState("idle")
    }
  }, [isEditMode])

  function exitEditMode() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("admin_edit")
    const qs = params.toString()
    router.push(pathname + (qs ? `?${qs}` : ""))
  }

  async function saveAll() {
    setSaveState("saving")
    try {
      // Persist to the DB via the admin-protected endpoint in one batched call.
      const res = await fetch("/api/admin/page-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug: INLINE_CONTENT_SLUG, changes: pendingChanges }),
      })
      if (!res.ok) throw new Error("save failed")
      setSavedChanges((prev) => ({ ...prev, ...pendingChanges }))
      setPendingChanges({})
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2500)
    } catch {
      setSaveState("error")
      setTimeout(() => setSaveState("idle"), 3000)
    }
  }

  const changeCount = Object.keys(pendingChanges).length

  return (
    <EditModeContext.Provider value={{ isEditMode, pendingChanges, savedChanges, addChange }}>
      {isEditMode && (
        <>
          {/* Amber top banner */}
          <div
            role="banner"
            className="fixed inset-x-0 top-0 z-[9999] flex h-10 items-center justify-between gap-3 bg-amber-400 px-4 text-amber-950 shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Pencil className="h-3.5 w-3.5" />
              Edit Mode — hover any underlined text and click the pen to edit
            </div>
            <div className="flex items-center gap-2">
              {changeCount > 0 && (
                <span className="rounded-full bg-amber-950/15 px-2 py-0.5 text-xs font-medium">
                  {changeCount} unsaved change{changeCount > 1 ? "s" : ""}
                </span>
              )}
              <button
                type="button"
                onClick={saveAll}
                disabled={changeCount === 0 || saveState === "saving"}
                className="flex items-center gap-1.5 rounded-lg bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saveState === "saving" ? (
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-50/30 border-t-amber-50" />
                    Saving…
                  </span>
                ) : saveState === "saved" ? (
                  <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Saved</span>
                ) : saveState === "error" ? (
                  <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Error</span>
                ) : (
                  <span className="flex items-center gap-1"><Save className="h-3 w-3" /> Save all</span>
                )}
              </button>
              <button
                type="button"
                onClick={exitEditMode}
                className="flex items-center gap-1.5 rounded-lg border border-amber-950/20 bg-amber-950/10 px-3 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-950/20"
              >
                <Eye className="h-3 w-3" />
                Exit editor
              </button>
            </div>
          </div>
          {/* Spacer pushes page content below the fixed banner */}
          <div className="h-10" aria-hidden="true" />
          {/* Generic auto-detection editor for pages without explicit wrappers */}
          <AutoEditableLayer />
        </>
      )}
      {/* Applies persisted generic (auto:*) edits to the live DOM for all visitors */}
      <SavedContentApplier />
      {children}
    </EditModeContext.Provider>
  )
}
