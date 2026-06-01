"use client"

import { useCallback, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useEditMode } from "@/components/edit-mode-provider"

/**
 * SavedContentApplier
 * -------------------
 * Mounted for EVERY visitor (not just admins). It takes the persisted inline
 * edits loaded by EditModeProvider and applies the generic `auto:<pathname>:…`
 * edits to the live DOM so changes made in the frontend editor show up on the
 * public site instantly.
 *
 * Explicit `<EditableText>` / `<EditableImage>` keys do NOT need this — those
 * components already read the saved value from context. This only resolves the
 * auto-detected keys, which have no React component to read them.
 *
 * No-ops while in edit mode (AutoEditableLayer applies overrides there).
 */

function resolveByPath(path: string): Element | null {
  const segs = path.split(">")
  let node: Element | null = document.body
  for (const seg of segs) {
    if (!node) return null
    const sep = seg.lastIndexOf(":")
    const tag = seg.slice(0, sep)
    const idx = parseInt(seg.slice(sep + 1), 10)
    if (!tag || Number.isNaN(idx)) return null
    const matches = Array.from(node.children).filter(
      (c) => c.tagName.toLowerCase() === tag,
    )
    node = matches[idx] ?? null
  }
  return node
}

export function SavedContentApplier() {
  const { isEditMode, savedChanges } = useEditMode()
  const pathname = usePathname()

  const apply = useCallback(() => {
    const prefix = `auto:${pathname}:`
    for (const [key, val] of Object.entries(savedChanges)) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      let el: Element | null = null
      if (rest.startsWith("k/")) {
        const k = rest.slice(2)
        const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(k) : k
        el = document.querySelector(`[data-edit-key="${sel}"]`)
      } else {
        el = resolveByPath(rest)
      }
      if (!el) continue
      if (el.tagName === "IMG") {
        const img = el as HTMLImageElement
        if (img.src !== val) img.src = val
      } else if (el.textContent !== val) {
        el.textContent = val
      }
    }
  }, [pathname, savedChanges])

  useEffect(() => {
    if (isEditMode) return // AutoEditableLayer owns application in edit mode
    if (Object.keys(savedChanges).length === 0) return

    const raf = requestAnimationFrame(apply)
    const t = setTimeout(apply, 300)

    let debounce: ReturnType<typeof setTimeout> | null = null
    const obs = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(apply, 200)
    })
    obs.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      if (debounce) clearTimeout(debounce)
      obs.disconnect()
    }
  }, [isEditMode, apply, savedChanges])

  return null
}
