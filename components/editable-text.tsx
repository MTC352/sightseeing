"use client"

import { useState, useRef, useEffect } from "react"
import { Pencil, Check, X } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { cn } from "@/lib/utils"

interface EditableTextProps {
  /** Unique key identifying this content element, e.g. "home:hero:headline" */
  id: string
  /** Original/default text baked into the codebase */
  defaultValue: string
  /** HTML element to render when not editing */
  as?: keyof React.JSX.IntrinsicElements
  className?: string
  /** Allow multi-line editing (textarea) */
  multiline?: boolean
}

export function EditableText({
  id,
  defaultValue,
  as: Tag = "span",
  className,
  multiline = false,
}: EditableTextProps) {
  const { isEditMode, pendingChanges, savedChanges, addChange } = useEditMode()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLElement>(null)

  // Resolution order: unsaved pending > persisted server value > code default
  const displayValue = pendingChanges[id] ?? savedChanges[id] ?? defaultValue

  function startEdit() {
    setDraft(displayValue)
    setEditing(true)
  }

  function commit() {
    const trimmed = draft.trim()
    if (trimmed) {
      addChange(id, trimmed)
    }
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  // Focus and move cursor to end when editing opens
  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current as HTMLInputElement | HTMLTextAreaElement
      el.focus()
      const len = draft.length
      el.setSelectionRange(len, len)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEditMode) {
    return <Tag className={className}>{displayValue}</Tag>
  }

  if (editing) {
    return (
      <span className="relative inline-flex flex-col gap-1">
        {multiline ? (
          <textarea
            ref={inputRef as React.Ref<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel()
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit()
            }}
            rows={3}
            className="w-full min-w-[240px] rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-lg outline-none ring-2 ring-amber-400/30"
          />
        ) : (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel()
              if (e.key === "Enter") commit()
            }}
            className="w-full min-w-[240px] rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-lg outline-none ring-2 ring-amber-400/30"
          />
        )}
        <span className="flex items-center gap-1 self-end">
          <button
            type="button"
            onClick={commit}
            className="flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-300"
          >
            <Check className="h-3 w-3" /> Apply
          </button>
          <button
            type="button"
            onClick={cancel}
            className="flex items-center gap-1 rounded-md bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-300"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
          {multiline && (
            <span className="ml-1 text-[10px] text-zinc-400">Ctrl+Enter to apply</span>
          )}
        </span>
      </span>
    )
  }

  return (
    <Tag
      className={cn(
        className,
        "group/editable relative cursor-pointer rounded underline decoration-amber-400 decoration-dotted underline-offset-2 transition-colors hover:bg-amber-400/10"
      )}
      onClick={startEdit}
      title={`Edit: ${id}`}
    >
      {displayValue}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-5 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 opacity-0 shadow-sm transition-opacity group-hover/editable:opacity-100"
      >
        <Pencil className="h-2.5 w-2.5 text-amber-950" />
      </span>
    </Tag>
  )
}
