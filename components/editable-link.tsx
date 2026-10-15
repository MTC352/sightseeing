"use client"

import { useState } from "react"
import { Link2, Check, X } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { safeHref } from "@/lib/safe-href"

interface EditableLinkProps {
  /** Unique key for the link target, e.g. "dmc:brochure:cta:href" */
  id: string
  /** Default href baked into the code */
  defaultHref: string
  className?: string
  /** Button label — typically an <EditableText> so the text is editable too */
  children: React.ReactNode
  /** Open in a new tab (adds rel="noopener noreferrer") */
  newTab?: boolean
}

/**
 * An <a> whose href is editable in the inline page editor (?admin_edit=1).
 * Stored in page_content like EditableText. In edit mode navigation is
 * disabled (so the label can be edited) and an amber "Link" chip opens a
 * small URL editor.
 */
export function EditableLink({ id, defaultHref, className, children, newTab = false }: EditableLinkProps) {
  const { isEditMode, pendingChanges, savedChanges, addChange } = useEditMode()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const stored = pendingChanges[id] ?? savedChanges[id]
  const href = safeHref(stored, defaultHref)
  const target = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}

  if (!isEditMode) {
    return (
      <a href={href} className={className} {...target}>
        {children}
      </a>
    )
  }

  function apply() {
    const v = draft.trim()
    if (!v || safeHref(v, "") !== v) {
      setError("Use a link starting with https://, /, #, mailto: or tel:")
      return
    }
    addChange(id, v)
    setOpen(false)
    setError(null)
  }

  return (
    <span data-editable="true" className="relative inline-flex">
      <a href={href} className={className} onClick={(e) => e.preventDefault()} {...target}>
        {children}
      </a>
      <span className="absolute -top-3 right-0 z-30">
        {!open ? (
          <button
            type="button"
            onClick={() => { setDraft(stored ?? defaultHref); setOpen(true) }}
            title={`Edit link: ${href}`}
            className="flex items-center gap-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 shadow hover:bg-amber-300"
          >
            <Link2 className="h-3 w-3" /> Link
          </button>
        ) : (
          <span className="flex w-72 flex-col gap-1.5 rounded-xl border border-amber-300 bg-white p-2.5 text-left shadow-2xl">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Button link</span>
            <input
              type="text"
              value={draft}
              autoFocus
              onChange={(e) => { setDraft(e.target.value); setError(null) }}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply()
                if (e.key === "Escape") setOpen(false)
              }}
              placeholder="https://… or /uploads/brochure.pdf"
              className="w-full rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none"
            />
            {error && <span className="text-[11px] text-red-600">{error}</span>}
            <span className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={apply}
                className="flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-300"
              >
                <Check className="h-3 w-3" /> Apply
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setError(null) }}
                className="flex items-center gap-1 rounded-md bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-300"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </span>
          </span>
        )}
      </span>
    </span>
  )
}
