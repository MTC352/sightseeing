"use client"

import { useEffect, useState } from "react"
import { SOURCE_LANG, LANG_COOKIE, MAX_BATCH, isSupportedLang } from "@/lib/i18n/config"
import { isTranslatableText, dedupe, chunk } from "@/lib/i18n/collect"

const ATTRS = ["placeholder", "alt", "title", "aria-label"]
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"])

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

function skip(node: Node): boolean {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.getAttribute("translate") === "no") return true
    if (el.hasAttribute("data-no-i18n")) return true
    if (el.isContentEditable) return true
    el = el.parentElement
  }
  return false
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
      if (isTranslatableText(v) && !skip(el)) out.push({ el, attr })
    })
  }
  return out
}

let currentLang: string = SOURCE_LANG
let observer: MutationObserver | null = null
let pending = false

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
    const raw = tn.nodeValue ?? ""
    const key = raw.trim()
    const t = cache.get(key)
    if (t && t !== key) tn.nodeValue = raw.replace(key, t)
  }
  for (const { el, attr } of attrTargets) {
    const key = (el.getAttribute(attr) ?? "").trim()
    const t = cache.get(key)
    if (t && t !== key) el.setAttribute(attr, t)
  }
}

async function translatePass(root: ParentNode = document.body): Promise<void> {
  if (currentLang === SOURCE_LANG) return
  const textNodes = collectTextNodes(root)
  const attrTargets = collectAttrTargets(root)
  const strings = dedupe([
    ...textNodes.map((n) => (n.nodeValue ?? "").trim()),
    ...attrTargets.map(({ el, attr }) => (el.getAttribute(attr) ?? "").trim()),
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
    setTimeout(() => {
      pending = false
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
