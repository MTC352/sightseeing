"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Check, X, ImageIcon, Upload, Link2, Loader2 } from "lucide-react"
import { useEditMode } from "@/components/edit-mode-provider"
import { cn } from "@/lib/utils"

/**
 * AutoEditableLayer
 * -----------------
 * A generic, page-agnostic editing overlay. While Edit Mode is active it scans
 * the live DOM for text-bearing leaf elements and images that are NOT already
 * wrapped by the explicit <EditableText>/<EditableImage> components, marks them
 * as editable (dashed amber outline), and lets an admin click to edit them
 * inline. Edits flow through the same `addChange` / "Save all" pipeline used by
 * the explicit wrappers, keyed by a stable `auto:<pathname>:<dom-path>` id.
 *
 * This is what makes the frontend editor work on EVERY page without manually
 * wrapping each string. It only ever runs for a verified admin in edit mode.
 */

const TEXT_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "a", "li", "blockquote", "figcaption",
  "td", "th", "label", "button", "strong", "em", "small",
  "dt", "dd", "caption", "summary", "b", "i", "div",
]

// Anything matching this (the element itself or an ancestor) is left alone.
const EXCLUDE = [
  "nav", "header", "footer",
  "[role='banner']",
  "[data-editable]",        // explicit EditableText / EditableImage wrappers
  "[data-no-edit]",         // global chrome opted out (cookie banner, a11y toolbar)
  "[data-auto-editor-ui]",  // this overlay's own UI
  "[contenteditable]",
  "input", "textarea", "select", "svg", "script", "style", "code", "pre",
].join(",")

const TEXT_SELECTOR = TEXT_TAGS.join(",")

type ActiveText = { kind: "text"; id: string; el: HTMLElement; value: string; top: number; left: number }
type ActiveImage = { kind: "image"; id: string; el: HTMLImageElement; value: string; top: number; left: number }
type Active = ActiveText | ActiveImage | null

/** Build a structural path from <body> down to `el`, stable for static pages. */
function domPath(el: Element): string {
  const segs: string[] = []
  let node: Element | null = el
  while (node && node !== document.body && node.tagName !== "HTML") {
    const parent: HTMLElement | null = node.parentElement
    let idx = 0
    if (parent) {
      const tag = node.tagName
      idx = Array.from(parent.children).filter((c) => c.tagName === tag).indexOf(node)
    }
    segs.unshift(`${node.tagName.toLowerCase()}:${idx}`)
    node = parent
  }
  return segs.join(">")
}

/** Leaf element whose only content is text (no child elements). */
function isLeafText(el: Element): boolean {
  if (el.children.length > 0) return false
  const t = (el.textContent ?? "").trim()
  return t.length > 0 && t.length <= 2000
}

export function AutoEditableLayer() {
  const { isEditMode, savedChanges, pendingChanges, addChange } = useEditMode()
  const pathname = usePathname()
  const [active, setActive] = useState<Active>(null)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Apply any saved/pending overrides to already-tagged elements. Runs after a
  // scan and again whenever the stored values change (the provider fetches
  // saved content asynchronously after edit mode opens).
  const applyOverrides = useCallback(() => {
    document.querySelectorAll<HTMLElement>("[data-edit-id]").forEach((el) => {
      const id = el.getAttribute("data-edit-id")
      if (!id) return
      const ov = pendingChanges[id] ?? savedChanges[id]
      if (ov == null) return
      if (el.getAttribute("data-edit-kind") === "image") {
        const img = el as HTMLImageElement
        if (img.src !== ov) img.src = ov
      } else if (el.textContent !== ov) {
        el.textContent = ov
      }
    })
  }, [pendingChanges, savedChanges])

  // Build the stable id for an element. A page author can pin a key via
  // `data-edit-key` (survives DOM reordering); otherwise we derive a structural
  // path that is stable for static layouts.
  const idFor = useCallback(
    (el: Element) => {
      const explicit = el.getAttribute("data-edit-key")
      return `auto:${pathname}:${explicit ? `k/${explicit}` : domPath(el)}`
    },
    [pathname],
  )

  // Tag fresh editable elements found in the current DOM.
  const scan = useCallback(() => {
    // Text
    document.querySelectorAll<HTMLElement>(TEXT_SELECTOR).forEach((el) => {
      if (el.hasAttribute("data-edit-id")) return
      if (el.closest(EXCLUDE)) return
      if (!isLeafText(el)) return
      el.setAttribute("data-edit-id", idFor(el))
      el.setAttribute("data-edit-kind", "text")
      el.classList.add("auto-editable")
    })
    // Images
    document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      if (img.hasAttribute("data-edit-id")) return
      if (img.closest(EXCLUDE)) return
      const w = img.clientWidth || img.naturalWidth
      const h = img.clientHeight || img.naturalHeight
      if (w && h && (w < 32 || h < 32)) return // skip icons
      img.setAttribute("data-edit-id", idFor(img))
      img.setAttribute("data-edit-kind", "image")
      img.classList.add("auto-editable-img")
    })
    applyOverrides()
  }, [idFor, applyOverrides])

  // Mount: scan, observe for async content, intercept clicks. Clean up on exit.
  useEffect(() => {
    if (!isEditMode) return

    let raf = requestAnimationFrame(() => scan())
    const t = setTimeout(scan, 400)

    let debounce: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(scan, 250)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    function handleClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null
      if (!t || t.closest("[data-auto-editor-ui]")) return
      const target = t.closest<HTMLElement>("[data-edit-id]")
      if (!target) return
      e.preventDefault()
      e.stopPropagation()
      const id = target.getAttribute("data-edit-id")!
      const rect = target.getBoundingClientRect()
      const top = Math.max(48, Math.min(rect.bottom + 8, window.innerHeight - 240))
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320))
      if (target.getAttribute("data-edit-kind") === "image") {
        const img = target as HTMLImageElement
        setActive({ kind: "image", id, el: img, value: img.currentSrc || img.src, top, left })
      } else {
        setActive({ kind: "text", id, el: target, value: target.textContent ?? "", top, left })
      }
      setImgError(null)
    }
    document.addEventListener("click", handleClick, true)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      if (debounce) clearTimeout(debounce)
      observer.disconnect()
      document.removeEventListener("click", handleClick, true)
      document.querySelectorAll<HTMLElement>("[data-edit-id]").forEach((el) => {
        el.removeAttribute("data-edit-id")
        el.removeAttribute("data-edit-kind")
        el.classList.remove("auto-editable", "auto-editable-img")
      })
    }
  }, [isEditMode, scan])

  // Re-apply overrides when stored values arrive/update.
  useEffect(() => {
    if (!isEditMode) return
    applyOverrides()
  }, [isEditMode, applyOverrides])

  if (!isEditMode || !active) return null

  function commitText() {
    if (!active || active.kind !== "text") return
    const v = active.value.trim()
    if (v) {
      active.el.textContent = v
      addChange(active.id, v)
    }
    setActive(null)
  }

  function commitImageUrl() {
    if (!active || active.kind !== "image") return
    const v = active.value.trim()
    if (!v) return
    active.el.src = v
    addChange(active.id, v)
    setActive(null)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!active || active.kind !== "image") return
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setImgError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/trips/upload", { method: "POST", body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? "Upload failed")
      }
      const { url } = await res.json()
      active.el.src = url
      addChange(active.id, url)
      setActive(null)
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <div
      data-auto-editor-ui
      className="fixed z-[10000] w-80 rounded-xl border border-amber-300 bg-white shadow-2xl"
      style={{ top: active.top, left: active.left }}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {active.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {active.kind === "image" ? "Change image" : "Edit text"}
        </span>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {active.kind === "text" ? (
        <div className="p-3">
          <textarea
            autoFocus
            value={active.value}
            onChange={(e) => setActive({ ...active, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") setActive(null)
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitText()
            }}
            rows={3}
            className="w-full rounded-lg border-2 border-amber-400 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-2 ring-amber-400/30"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <span className="mr-auto text-[10px] text-zinc-400">Ctrl+Enter to apply</span>
            <button
              type="button"
              onClick={commitText}
              className="flex items-center gap-1 rounded-md bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-300"
            >
              <Check className="h-3 w-3" /> Apply
            </button>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="flex items-center gap-1 rounded-md bg-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-300"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 py-3 text-xs text-zinc-500 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="h-4 w-4" /> Upload a new image</>
            )}
          </button>
          <div className="mt-3">
            <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <Link2 className="h-3 w-3" /> Or paste a URL
            </label>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                value={active.value}
                onChange={(e) => setActive({ ...active, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitImageUrl()
                  if (e.key === "Escape") setActive(null)
                }}
                placeholder="https://…"
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/30"
              />
              <button
                type="button"
                onClick={commitImageUrl}
                disabled={!active.value.trim()}
                className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-amber-950 transition-colors hover:bg-amber-300 disabled:opacity-40"
              >
                <Check className="h-3 w-3" /> Use
              </button>
            </div>
          </div>
          {imgError && <p className={cn("mt-2 text-[11px] text-red-600")}>{imgError}</p>}
        </div>
      )}
    </div>
  )
}
