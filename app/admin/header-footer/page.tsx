"use client"

import { useState, useEffect, useRef } from "react"
import {
  Save, Check, AlertCircle, Code2, Eye, EyeOff,
  ChevronDown, ChevronUp, Layers, ArrowUpToLine, ArrowDownToLine, X,
} from "lucide-react"

/* ── Types ── */
type Section = "header" | "footer"

interface CodeBlock {
  id: string
  label: string
  description: string
  code: string
  enabled: boolean
}

const DEFAULT_BLOCKS: Record<Section, CodeBlock[]> = {
  header: [
    {
      id: "header_announcement",
      label: "Announcement Banner",
      description: "Displayed above the navigation bar on all public pages.",
      code: "",
      enabled: false,
    },
    {
      id: "header_scripts",
      label: "Head Scripts / Meta Tags",
      description: "Analytics, tag managers, or meta tags injected before the navbar.",
      code: "",
      enabled: false,
    },
  ],
  footer: [
    {
      id: "footer_chat",
      label: "Chat & Support Widget",
      description: "Live chat, helpdesk, or support widgets loaded after the page footer.",
      code: "",
      enabled: false,
    },
    {
      id: "footer_analytics",
      label: "Analytics & Tracking",
      description: "Google Analytics, Meta Pixel, or other tracking scripts.",
      code: "",
      enabled: false,
    },
    {
      id: "footer_cookie",
      label: "Cookie Consent",
      description: "Cookie consent banner or GDPR compliance scripts.",
      code: "",
      enabled: false,
    },
  ],
}

const PLACEHOLDERS: Record<string, string> = {
  header_announcement: `<!-- Announcement bar example -->
<div style="background:#16a34a;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:500;">
  Spring Sale — 15% off all tours this weekend! Use code SPRING15 at checkout.
</div>`,
  header_scripts: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>`,
  footer_chat: `<!-- Intercom widget -->
<script>
  window.intercomSettings = { app_id: "YOUR_APP_ID" };
  (function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){
    ic('reattach_activator');ic('update',w.intercomSettings);
  }else{var d=document;var i=function(){i.c(arguments);};
  i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;
  var l=function(){var s=d.createElement('script');s.type='text/javascript';
  s.async=true;s.src='https://widget.intercom.io/widget/YOUR_APP_ID';
  var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};
  if(document.readyState==='complete'){l();}else if(w.attachEvent){
    w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}}());
</script>`,
  footer_analytics: `<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXX');
</script>`,
  footer_cookie: `<!-- Cookie consent (replace with your provider) -->
<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
  data-domain-script="YOUR-DOMAIN-SCRIPT-ID">
</script>`,
}

/* ── Code Editor textarea with line numbers ── */
function CodeEditor({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const lineCount = Math.max((value || "").split("\n").length, 8)
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1)

  return (
    <div className={`relative flex overflow-hidden rounded-lg border font-mono text-sm transition-colors ${disabled ? "border-border bg-secondary/30 opacity-60" : "border-border bg-[#0f1117] focus-within:border-primary/50"}`}>
      {/* Line numbers */}
      <div className="select-none border-r border-white/10 bg-white/5 px-3 py-3 text-right text-[11px] leading-relaxed text-white/25 min-w-[2.5rem]">
        {lineNumbers.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        rows={lineCount}
        className="flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed text-emerald-100 placeholder:text-white/20 focus:outline-none disabled:cursor-not-allowed"
        style={{ minHeight: "10rem" }}
      />
    </div>
  )
}

/* ── Toggle switch ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${checked ? "bg-primary" : "bg-border"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  )
}

/* ── Block card ── */
function BlockCard({
  block,
  onChange,
}: {
  block: CodeBlock
  onChange: (updated: CodeBlock) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className={`rounded-xl border transition-all ${block.enabled ? "border-primary/30 bg-card" : "border-border bg-card/60"}`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <Toggle
          checked={block.enabled}
          onChange={(v) => onChange({ ...block, enabled: v })}
        />
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground">{block.label}</span>
          <span className="text-[11px] text-muted-foreground">{block.description}</span>
        </div>
        <div className="flex items-center gap-2">
          {block.code.trim() && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {block.code.trim().split("\n").length} lines
            </span>
          )}
          {block.enabled ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          ) : (
            <span className="rounded-full bg-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inactive
            </span>
          )}
          <button
            type="button"
            onClick={() => { setExpanded((v) => !v); setShowPreview(false) }}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Code</span>
            <div className="flex items-center gap-2">
              {block.code.trim() && (
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showPreview ? "Edit" : "Preview"}
                </button>
              )}
              {block.code.trim() && (
                <button
                  type="button"
                  onClick={() => onChange({ ...block, code: "" })}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>

          {showPreview ? (
            <div className="min-h-[6rem] overflow-auto rounded-lg border border-border bg-background p-4 text-sm">
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: block.code }} />
            </div>
          ) : (
            <CodeEditor
              value={block.code}
              onChange={(v) => onChange({ ...block, code: v })}
              placeholder={PLACEHOLDERS[block.id]}
              disabled={!block.enabled}
            />
          )}
          {!block.enabled && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Enable this block above to allow editing and injection.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main page ── */
export default function HeaderFooterPage() {
  const [tab, setTab] = useState<Section>("header")
  const [blocks, setBlocks] = useState<Record<Section, CodeBlock[]>>(DEFAULT_BLOCKS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  /* Load persisted values */
  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((s) => {
        // Merge persisted customHtml back into the first enabled block per section
        // (backwards-compatible with old single-textarea storage)
        const header = s?.header?.customHtml ?? ""
        const footer = s?.footer?.customHtml ?? ""
        if (header) {
          setBlocks((prev) => ({
            ...prev,
            header: prev.header.map((b, i) =>
              i === 0 ? { ...b, code: header, enabled: true } : b
            ),
          }))
        }
        if (footer) {
          setBlocks((prev) => ({
            ...prev,
            footer: prev.footer.map((b, i) =>
              i === 0 ? { ...b, code: footer, enabled: true } : b
            ),
          }))
        }
      })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      // Merge all enabled blocks into one HTML string per section
      const headerHtml = blocks.header
        .filter((b) => b.enabled && b.code.trim())
        .map((b) => `<!-- ${b.label} -->\n${b.code.trim()}`)
        .join("\n\n")
      const footerHtml = blocks.footer
        .filter((b) => b.enabled && b.code.trim())
        .map((b) => `<!-- ${b.label} -->\n${b.code.trim()}`)
        .join("\n\n")

      await Promise.all([
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "header", data: { customHtml: headerHtml } }),
        }),
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "footer", data: { customHtml: footerHtml } }),
        }),
      ])

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError("Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  function updateBlock(section: Section, updated: CodeBlock) {
    setBlocks((prev) => ({
      ...prev,
      [section]: prev[section].map((b) => (b.id === updated.id ? updated : b)),
    }))
  }

  const headerActive = blocks.header.filter((b) => b.enabled && b.code.trim()).length
  const footerActive = blocks.footer.filter((b) => b.enabled && b.code.trim()).length

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">Settings</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold text-foreground">
            <Code2 className="h-5 w-5 text-primary" />
            Custom Code Injection
          </h1>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            saved
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex shrink-0 gap-1 border-b border-border bg-background px-6 pt-3">
        {(["header", "footer"] as const).map((t) => {
          const count = t === "header" ? headerActive : footerActive
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 rounded-t-lg px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border border-b-0 border-border bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "header" ? <ArrowUpToLine className="h-3.5 w-3.5" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {count > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-6 overflow-auto p-6">
        {/* Left: blocks */}
        <div className="flex flex-1 flex-col gap-4 min-w-0">
          {/* Injection zone info */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {tab === "header" ? "Injected above the navigation bar" : "Injected below the site footer"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {tab === "header"
                  ? "Code in enabled blocks is combined and rendered before <Navbar /> on every public page. Ideal for announcement banners, promo bars, and critical head scripts."
                  : "Code in enabled blocks is combined and rendered after <SiteFooter /> on every public page. Ideal for analytics, chat widgets, cookie consent, and deferred scripts."}
              </p>
            </div>
          </div>

          {blocks[tab].map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onChange={(updated) => updateBlock(tab, updated)}
            />
          ))}
        </div>

        {/* Right: summary panel */}
        <div className="hidden w-64 shrink-0 lg:flex lg:flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status overview</p>
            <div className="mt-4 flex flex-col gap-3">
              {(["header", "footer"] as const).map((s) => {
                const active = blocks[s].filter((b) => b.enabled && b.code.trim())
                const total = blocks[s].length
                return (
                  <div key={s} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm font-medium capitalize text-foreground">
                        {s === "header" ? <ArrowUpToLine className="h-3.5 w-3.5 text-muted-foreground" /> : <ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />}
                        {s}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{active.length}/{total}</span>
                    </div>
                    <div className="flex gap-1">
                      {blocks[s].map((b) => (
                        <div
                          key={b.id}
                          title={b.label}
                          className={`h-1.5 flex-1 rounded-full ${b.enabled && b.code.trim() ? "bg-primary" : "bg-border"}`}
                        />
                      ))}
                    </div>
                    {active.length > 0 && (
                      <div className="flex flex-col gap-1 mt-0.5">
                        {active.map((b) => (
                          <span key={b.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tips</p>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                "Toggle a block ON before adding code to activate it.",
                "Only enabled blocks with code are injected on the live site.",
                "Click the chevron to expand and edit a block's code.",
                "Use the Preview button to render the HTML in-place.",
                "All active blocks are merged into one output per section.",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
