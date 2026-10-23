"use client"

import { Children, createContext, isValidElement, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { Columns3, Trash2, AlertTriangle, ChevronDown, Check } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { cn } from "@/lib/utils"
import {
  hideKey, colsKey, hideValue, isHiddenValue,
  cardPresetOptions, resolveCardColumns, resolveSplitTemplate,
  SPLIT_PRESETS, SPLIT_LABELS, type ColumnsKind, type SplitPreset,
} from "@/lib/page-layout"

/*
 * Layout controls for the inline page editor (?admin_edit=1).
 *
 *   <EditableBox boxId="about/values" label="Our values" as="section" className="…">
 *   <EditableColumns rowId="about/values/grid" kind="cards" cols={4} className="grid … lg:grid-cols-4">
 *     {values.map((v) => <EditableBox key={v.id} boxId={`about/values/${v.id}`} label={v.title}>…)}
 *   </EditableColumns>
 *
 * Both REPLACE an existing element (same tag, same classes) rather than adding
 * a wrapper, so the DOM structure — and the position-based keys of existing
 * auto-detected text edits — stay exactly as they were. A removed box keeps its
 * (empty, display:none) element for the same reason.
 *
 * Ids are fixed names, globally unique, "<page>/<section>[/<item>]".
 */

type BoxTag = "div" | "section" | "article" | "aside" | "li" | "header" | "figure"
type RowTag = "div" | "ul" | "ol" | "section"

/** Other attributes (data-*, aria-*, HTML id, …) are passed through to the element. */
type PassThrough = Omit<React.HTMLAttributes<HTMLElement>, "className" | "style" | "children">

/** Edit mode positions the toolbar absolutely, so the element needs a positioning
 *  context — but never override a position the code already set. */
function withPositioning(className: string | undefined): string {
  return /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(className ?? "") ? (className ?? "") : cn(className, "relative")
}

function useBoxHidden(id: string): boolean {
  const { pendingChanges, savedChanges } = useEditMode()
  const k = hideKey(id)
  return isHiddenValue(pendingChanges[k] ?? savedChanges[k])
}

/** Set by <EditableColumns> so a box knows whether it's the last one showing. */
const RowContext = createContext<{ visibleIds: Set<string> } | null>(null)

// ── EditableBox ─────────────────────────────────────────────────────────────

export function EditableBox({
  boxId: id,
  label,
  as: Tag = "div",
  className,
  style,
  children,
  ...rest
}: PassThrough & {
  /** Fixed, globally unique name: "<page>/<section>[/<item>]". */
  boxId: string
  /** Human-readable name shown in the confirmation and the Removed sections list. */
  label: string
  as?: BoxTag
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const { isEditMode, addChange } = useEditMode()
  const hidden = useBoxHidden(id)
  const row = useContext(RowContext)
  const pathname = usePathname()
  const [confirming, setConfirming] = useState(false)

  if (hidden) {
    // `hidden` as well as display:none so Tailwind divide-*/space-* utilities
    // (which skip [hidden] siblings) close up around the removed box.
    return <Tag {...rest} data-box-id={id} className={className} style={{ ...style, display: "none" }} hidden aria-hidden="true" />
  }

  if (!isEditMode) {
    return <Tag {...rest} data-box-id={id} className={className} style={style}>{children}</Tag>
  }

  const isLastInRow = !!row && row.visibleIds.has(id) && row.visibleIds.size <= 1

  return (
    <Tag {...rest} data-box-id={id} data-box-edit="" className={withPositioning(className)} style={style}>
      {children}
      {/* Toolbar stays the LAST child so sibling positions above it don't change. */}
      <span data-box-toolbar="" data-no-edit="" className="absolute right-1.5 top-1.5 z-40 items-center gap-1">
        <button
          type="button"
          disabled={isLastInRow}
          title={isLastInRow ? "Last box in this row — remove the whole section instead" : `Remove “${label}”`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
          className="flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white shadow-md hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </span>
      {confirming && (
        <ConfirmRemoveDialog
          label={label}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            addChange(hideKey(id), hideValue(pathname, label))
            setConfirming(false)
          }}
        />
      )}
    </Tag>
  )
}

/** Two-step confirmation. Portalled to <body> so no page styles affect it. */
function ConfirmRemoveDialog({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  if (typeof document === "undefined") return null
  return createPortal(
    <div
      data-no-edit=""
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            {step === 1 ? (
              <>
                <p className="text-base font-semibold">Remove “{label}”?</p>
                <p className="mt-1 text-sm text-zinc-600">This box and everything inside it will be removed from the page.</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">Are you sure?</p>
                <p className="mt-1 text-sm text-zinc-600">
                  After <span className="font-semibold">Save all</span>, “{label}” is hidden for every visitor, in every
                  language. Only a developer can restore it.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50">
            Cancel
          </button>
          {step === 1 ? (
            <button type="button" onClick={() => setStep(2)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              Continue
            </button>
          ) : (
            <button type="button" onClick={onConfirm} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              Yes, remove it
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── EditableColumns ─────────────────────────────────────────────────────────

/** Box ids among a row's direct children (arrays from .map() are flattened). */
function childBoxIds(children: React.ReactNode): { boxIds: string[]; others: number } {
  const boxIds: string[] = []
  let others = 0
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    // Matched by shape as well as type: when a server component renders the
    // row, children arrive as client references rather than this function.
    const props = child.props as { boxId?: unknown; label?: unknown }
    const isBox = child.type === EditableBox || (typeof props.boxId === "string" && typeof props.label === "string")
    if (isBox && typeof props.boxId === "string") boxIds.push(props.boxId)
    else others++
  })
  return { boxIds, others }
}

export function EditableColumns({
  rowId: id,
  kind,
  cols = 2,
  as: Tag = "div",
  className,
  style,
  children,
  ...rest
}: PassThrough & {
  /** Fixed, globally unique name, e.g. "about/values/grid". */
  rowId: string
  /** "cards": a row of similar boxes; "split": exactly two side-by-side columns. */
  kind: ColumnsKind
  /** Cards only: the row's widest desktop column count in the code (e.g. 3 for lg:grid-cols-3). */
  cols?: number
  as?: RowTag
  /** Must make the row a CSS grid on desktop (e.g. "grid gap-6 lg:grid-cols-3"). */
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const { isEditMode, pendingChanges, savedChanges, addChange } = useEditMode()
  const { boxIds, others } = childBoxIds(children)
  const isHidden = (boxId: string) => {
    const k = hideKey(boxId)
    return isHiddenValue(pendingChanges[k] ?? savedChanges[k])
  }
  const visibleIds = new Set(boxIds.filter((b) => !isHidden(b)))
  const total = boxIds.length + others
  const visible = visibleIds.size + others

  const ck = colsKey(id)
  const preset = pendingChanges[ck] ?? savedChanges[ck]

  // Layout overrides apply on desktop only (see globals.css); one visible
  // column always fills the row at every size.
  const attrs: Record<string, string> = { "data-cols-id": id }
  const vars: Record<string, string | number> = {}
  if (visible <= 1 && total > 1) {
    attrs["data-cols-single"] = ""
  } else if (kind === "cards") {
    const n = resolveCardColumns(cols, preset, visible, total)
    if (n !== null) { attrs["data-cols-desktop"] = ""; vars["--cols-desktop"] = n }
  } else {
    const template = resolveSplitTemplate(preset, visible)
    if (template !== null) { attrs["data-split-desktop"] = ""; vars["--split-desktop"] = template }
  }

  const options: { value: string; label: string }[] =
    kind === "cards"
      ? cardPresetOptions(visible).map((v) => ({ value: v, label: v === "auto" ? `Auto (${Math.min(cols, Math.max(1, visible))})` : `${v} column${v === "1" ? "" : "s"}` }))
      : [{ value: "auto", label: "Default" }, ...(Object.keys(SPLIT_PRESETS) as SplitPreset[]).map((v) => ({ value: v, label: SPLIT_LABELS[v] }))]
  const current = preset && options.some((o) => o.value === preset) ? preset : "auto"

  return (
    <RowContext.Provider value={{ visibleIds }}>
      <Tag
        {...rest}
        {...attrs}
        {...(isEditMode ? { "data-cols-edit": "" } : {})}
        className={isEditMode ? withPositioning(className) : className}
        style={{ ...style, ...vars } as React.CSSProperties}
      >
        {children}
        {isEditMode && visible > 1 && (
          // Absolutely positioned, so it never takes a grid cell; kept LAST.
          <ColumnsPicker options={options} current={current} onPick={(v) => addChange(ck, v)} />
        )}
      </Tag>
    </RowContext.Provider>
  )
}

/** In-page dropdown (not a native <select>, whose OS-drawn menu doesn't match the editor). */
function ColumnsPicker({
  options,
  current,
  onPick,
}: {
  options: { value: string; label: string }[]
  current: string
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const currentLabel = options.find((o) => o.value === current)?.label ?? "Columns"

  return (
    // Absolutely positioned, so it never takes a grid cell; kept LAST.
    <span
      ref={ref}
      data-cols-toolbar=""
      data-no-edit=""
      {...(open ? { "data-open": "" } : {})}
      className="absolute -top-3 left-1.5 z-40 text-[11px] font-semibold"
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Columns on desktop"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        className="flex items-center gap-1 rounded-md bg-sky-600 px-1.5 py-0.5 text-white shadow-md hover:bg-sky-700"
      >
        <Columns3 className="h-3 w-3" />
        {currentLabel}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <span role="listbox" className="absolute left-0 top-full mt-1 flex min-w-[9rem] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-zinc-900 shadow-xl">
          <span className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">Desktop columns</span>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === current}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(o.value); setOpen(false) }}
              className="flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-sky-50"
            >
              {o.label}
              {o.value === current && <Check className="h-3 w-3 text-sky-600" />}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
