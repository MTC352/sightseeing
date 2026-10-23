"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Pencil, CheckCircle, Eye, Save, AlertCircle, Undo2 } from "lucide-react"
import { AutoEditableLayer } from "@/components/auto-editable-layer"
import { SavedContentApplier } from "@/components/saved-content-applier"
import { INLINE_CONTENT_SLUG } from "@/lib/page-content-slug"
import { isFullAdmin, FULL_ACCESS_ROLE } from "@/lib/admin-permissions"
import { RemovedSectionsPanel } from "@/components/removed-sections-panel"

interface EditModeCtx {
  isEditMode: boolean
  pendingChanges: Record<string, string>
  savedChanges: Record<string, string>
  addChange: (key: string, value: string) => void
  /**
   * State-safe update: computes the next value from the LATEST pending value
   * (or `undefined` when there is no pending change yet) so rapid successive
   * edits to the same key compose instead of clobbering one another.
   */
  mutateChange: (key: string, mutate: (current: string | undefined) => string) => void
  /** Superadmin with Developer mode on — may restore removed sections. */
  canRestore: boolean
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  pendingChanges: {},
  savedChanges: {},
  addChange: () => {},
  mutateChange: () => {},
  canRestore: false,
})

export function useEditMode() {
  return useContext(EditModeContext)
}

export function EditModeProvider({ children, initialContent = {} }: { children: React.ReactNode; initialContent?: Record<string, string> }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Raw URL intent — true only if the query param is present.
  const paramRequested = searchParams.get("admin_edit") === "1"

  // Verified state — starts as false and becomes true only after the
  // /api/admin/auth/me check confirms a valid admin session. If the
  // param is absent, this stays false without making any network call.
  const [adminVerified, setAdminVerified] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  // Developer mode is the admin panel's hidden superadmin toggle (?dev=1),
  // persisted in localStorage — see app/admin/layout.tsx.
  const [devMode, setDevMode] = useState(false)
  useEffect(() => {
    try { setDevMode(localStorage.getItem("admin_dev_mode") === "1") } catch { /* ignore */ }
  }, [pathname])

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  const [savedChanges, setSavedChanges] = useState<Record<string, string>>(initialContent)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")

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
          return res.json().then((data: { role?: string; permissions?: string[] }) => {
            if (cancelled) return
            // Full admins (superadmin or a "*" full-access employee) or an
            // employee granted "pages" — mirrors canAccessPath for
            // /api/admin/page-content.
            const isFull = isFullAdmin(data?.role ?? "", data?.permissions)
            const hasPages = Array.isArray(data?.permissions) && data.permissions.includes("pages")
            setIsSuperadmin(data?.role === FULL_ACCESS_ROLE)
            if (isFull || hasPages) {
              setAdminVerified(true)
            } else {
              setAdminVerified(false)
              const params = new URLSearchParams(searchParams.toString())
              params.delete("admin_edit")
              const qs = params.toString()
              router.replace(pathname + (qs ? `?${qs}` : ""))
            }
          })
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

  // The actual gate: the URL param AND a verified session must both be true,
  // AND the current page must not be an admin route.
  const isEditMode = paramRequested && adminVerified && !pathname.startsWith("/admin")
  const canRestore = isEditMode && isSuperadmin && devMode

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

  const mutateChange = useCallback(
    (key: string, mutate: (current: string | undefined) => string) => {
      setPendingChanges((prev) => ({ ...prev, [key]: mutate(prev[key]) }))
    },
    [],
  )

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
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || "Save failed")
      }
      setSavedChanges((prev) => ({ ...prev, ...pendingChanges }))
      setPendingChanges({})
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
      setSaveState("error")
      setTimeout(() => { setSaveState("idle"); setSaveError("") }, 5000)
    }
  }

  // Reload rather than just clearing state: auto-detected text edits are
  // written straight into the DOM, so only a fresh render reverts them.
  function discardAll() {
    setPendingChanges({})
    window.location.reload()
  }

  const changeCount = Object.keys(pendingChanges).length

  return (
    <EditModeContext.Provider value={{ isEditMode, pendingChanges, savedChanges, addChange, mutateChange, canRestore }}>
      {isEditMode && (
        <>
          {/* Amber top banner */}
          <div
            role="banner"
            className="fixed inset-x-0 top-0 z-[9999] flex h-10 items-center justify-between gap-3 bg-amber-400 px-4 text-amber-950 shadow-sm"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Pencil className="h-3.5 w-3.5" />
              Edit Mode — click underlined text to edit · hover a box to remove it or change its columns
            </div>
            <div className="flex items-center gap-2">
              {saveState === "error" && saveError && (
                <span className="max-w-xs truncate text-xs font-medium text-red-800" title={saveError}>{saveError}</span>
              )}
              {canRestore && <RemovedSectionsPanel />}
              {changeCount > 0 && (
                <>
                  <span className="rounded-full bg-amber-950/15 px-2 py-0.5 text-xs font-medium">
                    {changeCount} unsaved change{changeCount > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={discardAll}
                    disabled={saveState === "saving"}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-950/20 bg-amber-950/10 px-3 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-950/20 disabled:opacity-40"
                  >
                    <Undo2 className="h-3 w-3" />
                    Discard
                  </button>
                </>
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
