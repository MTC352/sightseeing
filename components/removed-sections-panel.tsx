"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ArchiveRestore, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { hideKey, isSafePagePath, listRemovedBoxes } from "@/lib/page-layout"

/**
 * "Removed sections" list in the edit-mode banner. Rendered only for the
 * superadmin with Developer mode on (EditModeProvider.canRestore); the
 * page-content API enforces the superadmin part server-side as well.
 * Lists removals on every page; Restore stages a change for "Save all".
 */
export function RemovedSectionsPanel() {
  const { savedChanges, pendingChanges, addChange } = useEditMode()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on a click outside the panel or Escape.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const removed = useMemo(
    () => listRemovedBoxes({ ...savedChanges, ...pendingChanges }),
    [savedChanges, pendingChanges],
  )

  return (
    <div ref={ref} data-no-edit className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-950/20 bg-amber-950/10 px-3 py-1 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-950/20"
      >
        <ArchiveRestore className="h-3 w-3" />
        Removed sections ({removed.length})
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[26rem] max-w-[90vw] overflow-hidden rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl">
          <div className="border-b border-zinc-200 px-4 py-2.5">
            <p className="text-sm font-semibold">Removed sections</p>
            <p className="text-[11px] text-zinc-500">
              Developer mode only. Restore, then click <span className="font-semibold">Save all</span>.
            </p>
          </div>
          {removed.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing has been removed.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
              {removed.map((box) => (
                <li key={box.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={box.label}>{box.label}</p>
                    <p className="truncate text-[11px] text-zinc-500" title={box.id}>
                      {box.path || "?"} · {box.id}
                    </p>
                  </div>
                  {isSafePagePath(box.path) && box.path !== pathname && (
                    <a
                      href={`${box.path}?admin_edit=1`}
                      title="Open that page in the editor"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => addChange(hideKey(box.id), "0")}
                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
