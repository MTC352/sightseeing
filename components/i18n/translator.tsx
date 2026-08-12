"use client"

import { useEffect, useState } from "react"
import { SOURCE_LANG, LANG_COOKIE, MAX_BATCH, isSupportedLang } from "@/lib/i18n/config"
import { isTranslatableText, dedupe, chunk } from "@/lib/i18n/collect"

const ATTRS = ["placeholder", "alt", "title", "aria-label"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"])
// Attribute targets (placeholder/alt/title/aria-label) live ON input/textarea/img
// elements themselves, so they must NOT be rejected merely for being those tags —
// only for genuinely opting-out ancestors/containers.
const ATTR_SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"])

function readCookie(name: string): string {
  if (typeof document === "undefined") return ""
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"))
  return m ? decodeURIComponent(m[1]) : ""
}

export function getSiteLang(): string {
  const c = readCookie(LANG_COOKIE)
  return isSupportedLang(c) ? c : SOURCE_LANG
}

// Per-language source->translation map, kept in memory and mirrored to
// localStorage so repeat visits skip the network entirely.
const memCache: Record<string, Map<string, string>> = {}
function cacheFor(lang: string): Map<string, string> {
  if (!memCache[lang]) {
    memCache[lang] = new Map()
    try {
      const raw = localStorage.getItem("i18n_cache_" + lang)
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) memCache[lang].set(k, v)
    } catch {}
  }
  return memCache[lang]
}
function persistCache(lang: string): void {
  try {
    localStorage.setItem("i18n_cache_" + lang, JSON.stringify(Object.fromEntries(cacheFor(lang))))
  } catch {}
}

function skipWithTags(node: Node, tags: Set<string>): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (tags.has(el.tagName)) return true
    if (el.getAttribute("translate") === "no") return true
    if (el.hasAttribute("data-no-i18n")) return true
    if (el.isContentEditable) return true
    el = el.parentElement
  }
  return false
}

// Text-node skip: also excludes INPUT/TEXTAREA/CODE/PRE content (their text is
// not user-facing prose, or is a form value we must not rewrite).
function skip(node: Node): boolean {
  return skipWithTags(node, SKIP_TAGS)
}

// Attribute-target skip: only opt-out ancestors/containers apply. INPUT/TEXTAREA
// are valid attribute targets (their placeholder IS translatable) even though
// their text content is not.
function skipAttr(el: Element): boolean {
  return skipWithTags(el, ATTR_SKIP_TAGS)
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const out: Text[] = []
  let n = walker.nextNode()
  while (n) {
    const tn = n as Text
    if (isTranslatableText(tn.nodeValue ?? "") && !skip(tn)) out.push(tn)
    n = walker.nextNode()
  }
  return out
}

function collectAttrTargets(root: ParentNode): Array<{ el: Element; attr: string }> {
  const out: Array<{ el: Element; attr: string }> = []
  for (const attr of ATTRS) {
    root.querySelectorAll("[" + attr + "]").forEach((el) => {
      const v = el.getAttribute(attr) ?? ""
      if (isTranslatableText(v) && !skipAttr(el)) out.push({ el, attr })
    })
  }
  return out
}

let currentLang: string = SOURCE_LANG
let observer: MutationObserver | null = null
let pending = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Tracks the ORIGINAL English source for nodes/attrs we've already translated,
// so re-scans (triggered by our own DOM writes, or React re-renders) key off
// the source string rather than the current (possibly already-translated)
// value. Without this, a translated node would be mistaken for new English
// text on the next pass and re-sent to the API as if it were untranslated
// (lang->lang), causing a refetch/re-apply loop.
const originalText = new WeakMap<Text, string>()
const originalAttrs = new WeakMap<Element, Record<string, string>>()

async function fetchMissing(lang: string, texts: string[]): Promise<void> {
  const cache = cacheFor(lang)
  const missing = dedupe(texts).filter((t) => !cache.has(t))
  if (missing.length === 0) return
  for (const batch of chunk(missing, MAX_BATCH)) {
    try {
      const res = await fetch("/api/i18n/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, texts: batch }),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { translations?: Record<string, string> }
      for (const [k, v] of Object.entries(data.translations ?? {})) cache.set(k, v)
    } catch {}
  }
  persistCache(lang)
}

function apply(lang: string, textNodes: Text[], attrTargets: Array<{ el: Element; attr: string }>): void {
  const cache = cacheFor(lang)
  for (const tn of textNodes) {
    // Always recompute from the recorded ORIGINAL full nodeValue (not the
    // node's current — possibly already-translated — value). Replacing
    // against the current value breaks direct lang->lang switches (e.g.
    // fr->de), since the current value no longer contains the English key.
    const orig = originalText.get(tn) ?? (tn.nodeValue ?? "")
    const key = orig.trim()
    const t = cache.get(key)
    if (t && t !== key) {
      if (!originalText.has(tn)) originalText.set(tn, orig)
      const next = orig.replace(key, t)
      if (next !== tn.nodeValue) tn.nodeValue = next
    }
  }
  for (const { el, attr } of attrTargets) {
    const recorded = originalAttrs.get(el)
    const current = (el.getAttribute(attr) ?? "").trim()
    const key = recorded?.[attr] ?? current
    const t = cache.get(key)
    if (t && t !== key) {
      if (!recorded || !(attr in recorded)) {
        const attrs = recorded ?? {}
        attrs[attr] = key
        originalAttrs.set(el, attrs)
      }
      if (el.getAttribute(attr) !== t) el.setAttribute(attr, t)
    }
  }
}

async function translatePass(root: ParentNode = document.body): Promise<void> {
  if (currentLang === SOURCE_LANG) return
  const textNodes = collectTextNodes(root)
  const attrTargets = collectAttrTargets(root)
  const strings = dedupe([
    // Resolve each target's SOURCE key: its recorded original if already
    // translated, otherwise its current (untranslated) value. This keeps
    // already-translated nodes out of the "new text to fetch" list.
    ...textNodes.map((n) => (originalText.get(n) ?? n.nodeValue ?? "").trim()),
    ...attrTargets.map(({ el, attr }) => originalAttrs.get(el)?.[attr] ?? (el.getAttribute(attr) ?? "").trim()),
  ]).filter(isTranslatableText)
  // Apply what we already know immediately (handles React reverts with zero
  // network), then fetch the rest and apply again.
  apply(currentLang, textNodes, attrTargets)
  await fetchMissing(currentLang, strings)
  apply(currentLang, textNodes, attrTargets)
}

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    if (pending) return
    pending = true
    // Debounce bursts of React mutations into a single pass.
    debounceTimer = setTimeout(() => {
      pending = false
      debounceTimer = null
      void translatePass(document.body)
    }, 150)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}

export function setSiteLang(lang: string): void {
  document.cookie = LANG_COOKIE + "=" + encodeURIComponent(lang) + "; path=/; max-age=31536000; samesite=lax"
  if (!isSupportedLang(lang)) {
    // Back to English: reload to restore original source text cleanly.
    currentLang = SOURCE_LANG
    document.documentElement.lang = SOURCE_LANG
    location.reload()
    return
  }
  currentLang = lang
  document.documentElement.lang = lang
  void translatePass(document.body)
  startObserver()
}

export function Translator() {
  useEffect(() => {
    const lang = getSiteLang()
    currentLang = lang
    if (isSupportedLang(lang)) {
      document.documentElement.lang = lang
      void translatePass(document.body)
      startObserver()
    }
    return () => {
      observer?.disconnect()
      observer = null
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      pending = false
    }
  }, [])
  return null
}

// Hook for the navbar switcher.
export function useSiteLang(): { lang: string; ready: boolean; setLang: (l: string) => void } {
  const [lang, setLang] = useState<string>(SOURCE_LANG)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setLang(getSiteLang())
    setReady(true)
  }, [])
  return {
    lang,
    ready,
    setLang: (l: string) => {
      setLang(isSupportedLang(l) ? l : SOURCE_LANG)
      setSiteLang(l)
    },
  }
}
