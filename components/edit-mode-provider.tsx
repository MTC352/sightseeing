"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Pencil, X, CheckCircle, Eye, Save, AlertCircle } from "lucide-react"

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
  const isEditMode = searchParams.get("admin_edit") === "1"

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({})
  // savedChanges holds values already persisted to the server (loaded on mount)
  const [savedChanges, setSavedChanges] = useState<Record<string, string>>({})
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // Load all saved content from server when entering edit mode
  useEffect(() => {
    if (!isEditMode) return
    fetch("/api/page-content")
      .then((r) => r.json())
      .then((data: Record<string, string>) => setSavedChanges(data))
      .catch(() => {})
  }, [isEditMode])

  const addChange = useCallback((key: string, value: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Reset pending changes when edit mode is toggled off
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
      await Promise.all(
        Object.entries(pendingChanges).map(([key, value]) =>
          fetch("/api/page-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
          })
        )
      )
      // Merge pending into saved so values persist visually after save
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
          {/* Amber top banner — rendered BEFORE children so it doesn't overlap */}
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
        </>
      )}
      {children}
    </EditModeContext.Provider>
  )
}
