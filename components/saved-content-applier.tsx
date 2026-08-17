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
    const matches: Element[] = Array.from(node.children).filter(
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
        // Preserve React's DOM node identity. Replacing children via
        // `el.textContent = val` DETACHES the text node React is tracking and
        // inserts a foreign one; on the next click → re-render React then fails
        // to update/remove the node it expected, dropping the interaction — the
        // classic "button only works on the second click" bug. Mutating the
        // existing text node's value in place (like the i18n Translator does)
        // keeps node identity intact, so React stays in sync.
        const firstChild = el.childNodes.length === 1 ? el.firstChild : null
        if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
          if (firstChild.nodeValue !== val) firstChild.nodeValue = val
        } else if (el.children.length === 0) {
          // Leaf with no element children (empty or multiple text nodes) — safe
          // to set textContent; there is no React-owned subtree to destroy.
          el.textContent = val
        }
        // Otherwise the element contains child ELEMENTS — never nuke them.
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
