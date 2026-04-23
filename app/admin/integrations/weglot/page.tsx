"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Check, Plus, X, AlertCircle, Globe } from "lucide-react"

const SUPPORTED_LANGS = [
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "lu", name: "Luxembourgish", flag: "🇱🇺" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
]

type WeglotConfig = {
  apiKey: string
  originalLang: string
  destinationLangs: string[]
  showFlags: boolean
  withName: boolean
  buttonPosition: "menu" | "widget" | "custom"
  excludedUrls: string[]
  excludedBlocks: string[]
  autoRedirect: boolean
  trackPageViews: boolean
  overrideCss: string
  flagStyle: "rectangle" | "round" | "square"
}

const DEFAULTS: WeglotConfig = {
  apiKey: "",
  originalLang: "en",
  destinationLangs: ["fr", "de"],
  showFlags: true,
  withName: true,
  buttonPosition: "menu",
  excludedUrls: ["/admin"],
  excludedBlocks: [".no-translate"],
  autoRedirect: false,
  trackPageViews: true,
  overrideCss: "",
  flagStyle: "rectangle",
}

export default function WeglotSettingsPage() {
  const router = useRouter()
  const [form, setForm] = useState<WeglotConfig>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [newBlock, setNewBlock] = useState("")

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => { if (s?.weglot) setForm({ ...DEFAULTS, ...s.weglot }) })
      .catch(() => {})
  }, [])

  function set<K extends keyof WeglotConfig>(key: K, val: WeglotConfig[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function toggleLang(code: string) {
    setForm((f) => {
      const has = f.destinationLangs.includes(code)
      return {
        ...f,
        destinationLangs: has
          ? f.destinationLangs.filter((l) => l !== code)
          : [...f.destinationLangs, code],
      }
    })
  }

  function addItem(list: "excludedUrls" | "excludedBlocks", val: string, clear: () => void) {
    if (!val.trim()) return
    setForm((f) => ({ ...f, [list]: [...f[list], val.trim()] }))
    clear()
  }

  function removeItem(list: "excludedUrls" | "excludedBlocks", val: string) {
    setForm((f) => ({ ...f, [list]: f[list].filter((i) => i !== val) }))
  }

  async function save() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "weglot", data: form }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1.5 block text-xs font-medium text-muted-foreground"
  const toggleClass = (on: boolean) =>
    `relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <button
          type="button"
          onClick={() => router.push("/admin/integrations")}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Integrations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-foreground">
            <Globe className="h-6 w-6 text-primary" /> Weglot Translation
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Configure multi-language support for sightseeing.lu</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            saved ? "bg-emerald-500/15 text-emerald-600" : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="max-w-2xl space-y-5">
        {/* Main config */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Main Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder="wg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={`${inputClass} font-mono`}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Original Language</label>
                <select value={form.originalLang} onChange={(e) => set("originalLang", e.target.value)} className={inputClass}>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="lu">Luxembourgish</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Flag Style</label>
                <select value={form.flagStyle} onChange={(e) => set("flagStyle", e.target.value as WeglotConfig["flagStyle"])} className={inputClass}>
                  <option value="rectangle">Rectangle</option>
                  <option value="round">Round</option>
                  <option value="square">Square</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`${labelClass} mb-2`}>Destination Languages</label>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_LANGS.map((lang) => {
                  const active = form.destinationLangs.includes(lang.code)
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLang(lang.code)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {lang.flag} {lang.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Language button settings */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Language Button Design</h2>
          <div className="space-y-3">
            {[
              { key: "showFlags" as const, label: "Show Flags" },
              { key: "withName" as const, label: "Show Language Name" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form[key] as boolean}
                  onClick={() => set(key, !form[key] as WeglotConfig[typeof key])}
                  className={toggleClass(form[key] as boolean)}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form[key] ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}

            <div>
              <label className={`${labelClass} mt-2`}>Button Position</label>
              <div className="flex gap-2">
                {(["menu", "widget", "custom"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => set("buttonPosition", pos)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
                      form.buttonPosition === pos
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {pos === "menu" ? "In Menu" : pos === "widget" ? "Floating Widget" : "Custom"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Exclusions */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Translation Exclusion</h2>

          <div className="space-y-5">
            <div>
              <label className={labelClass}>Excluded URLs</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.excludedUrls.map((url) => (
                  <span key={url} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground">
                    {url}
                    <button type="button" onClick={() => removeItem("excludedUrls", url)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem("excludedUrls", newUrl, () => setNewUrl(""))}
                  placeholder="/admin or /checkout"
                  className={`${inputClass} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => addItem("excludedUrls", newUrl, () => setNewUrl(""))}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Excluded CSS Selectors</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.excludedBlocks.map((block) => (
                  <span key={block} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground">
                    {block}
                    <button type="button" onClick={() => removeItem("excludedBlocks", block)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem("excludedBlocks", newBlock, () => setNewBlock(""))}
                  placeholder=".no-translate or #price-display"
                  className={`${inputClass} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={() => addItem("excludedBlocks", newBlock, () => setNewBlock(""))}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Other options */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Other Options</h2>
          <div className="space-y-3">
            {[
              { key: "autoRedirect" as const, label: "Auto-redirect based on browser language", hint: "Redirects users to their browser language automatically on first visit." },
              { key: "trackPageViews" as const, label: "Track page views in Weglot dashboard", hint: "Sends page view data to Weglot analytics." },
            ].map(({ key, label, hint }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground/60">{hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form[key] as boolean}
                  onClick={() => set(key, !form[key] as WeglotConfig[typeof key])}
                  className={`mt-0.5 shrink-0 ${toggleClass(form[key] as boolean)}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form[key] ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Override CSS */}
        <div className="rounded-xl border border-border bg-card p-5">
          <label className={labelClass}>Override CSS</label>
          <textarea
            rows={4}
            value={form.overrideCss}
            onChange={(e) => set("overrideCss", e.target.value)}
            className={`${inputClass} resize-y font-mono text-xs`}
            placeholder=".wg-element { ... }"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">Custom CSS injected into the Weglot language switcher widget.</p>
        </div>
      </div>
    </div>
  )
}
