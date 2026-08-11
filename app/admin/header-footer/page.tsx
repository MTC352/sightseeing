"use client"

import { useState, useEffect, useRef } from "react"
import {
  Save, Check, AlertCircle, Code2, Eye, EyeOff,
  ChevronDown, ChevronUp, Layers, ArrowUpToLine, ArrowDownToLine, X,
  Megaphone, AlignLeft, AlignCenter, AlignRight, RotateCcw, MapPin, Mail, Phone,
  ShieldCheck, ListTree,
} from "lucide-react"
import { RichTextEditor } from "@/components/admin/rich-text-editor"
import {
  AnnouncementBannerContent,
  type AnnouncementSize,
  type AnnouncementAlign,
} from "@/components/announcement-banner"
import type { FooterMenu, FooterGroup, FooterItem } from "@/lib/footer-menu-types"
import { newId } from "@/lib/footer-menu-normalize"
import { FOOTER_MENU_DEFAULT } from "@/lib/footer-menu-default"

/* ── Types ── */
type Section = "header" | "footer"
/** Tabs shown in the editor. `header`/`footer` drive the code-injection blocks
 *  (keyed by Section); `footer-menu` is a standalone panel for the footer menu. */
type TabKey = Section | "footer-menu"

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
      id: "header_scripts",
      label: "Head Scripts / Meta Tags",
      description: "Meta tags, verification tags, and general scripts injected before the navbar. NOT gated by cookie consent — loads for every visitor.",
      code: "",
      enabled: false,
    },
    {
      id: "header_analytics",
      label: "Google Analytics / Tracking",
      description: "Google Analytics, Tag Manager, or other tracking. Gated — only runs after the visitor accepts Marketing & analytics cookies.",
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
      description: "Google Analytics, Meta Pixel, or other tracking scripts. Gated — only runs after the visitor accepts Marketing & analytics cookies.",
      code: "",
      enabled: false,
    },
    {
      id: "footer_widget",
      label: "Footer Widget",
      description: "Any widget or script loaded after the footer. NOT gated by cookie consent — loads for every visitor.",
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

/** Blocks whose scripts only run after the visitor accepts Marketing & analytics cookies. */
const CONSENT_GATED_IDS = new Set(["header_analytics", "footer_analytics"])

// Markers understood by <CustomHtmlBlock> on the frontend: everything between
// them is removed from the page until marketing consent is granted.
const CONSENT_OPEN = "<!--consent:marketing-->"
const CONSENT_CLOSE = "<!--/consent:marketing-->"

/** Split a merged per-section HTML string back into the section's blocks
 *  using the `<!-- Label -->` comments written by save(). Unrecognized
 *  leading content falls into the first block. */
function splitMergedHtml(section: Section, merged: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!merged.trim()) return out
  const defs = DEFAULT_BLOCKS[section]
  const hits: { id: string; start: number; contentStart: number }[] = []
  for (const d of defs) {
    const tag = `<!-- ${d.label} -->`
    let idx = merged.indexOf(tag)
    while (idx !== -1) {
      hits.push({ id: d.id, start: idx, contentStart: idx + tag.length })
      idx = merged.indexOf(tag, idx + tag.length)
    }
  }
  hits.sort((a, b) => a.start - b.start)
  const strip = (s: string) =>
    s.replaceAll(CONSENT_OPEN, "").replaceAll(CONSENT_CLOSE, "").trim()
  if (hits.length === 0) {
    out[defs[0].id] = strip(merged)
    return out
  }
  const leading = merged.slice(0, hits[0].start).trim()
  if (leading) out[defs[0].id] = strip(leading)
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].start : merged.length
    const chunk = strip(merged.slice(hits[i].contentStart, end))
    if (!chunk) continue
    out[hits[i].id] = out[hits[i].id] ? `${out[hits[i].id]}\n\n${chunk}` : chunk
  }
  return out
}

const PLACEHOLDERS: Record<string, string> = {
  header_scripts: `<!-- e.g. site verification / meta tags -->
<meta name="facebook-domain-verification" content="XXXXXXXX" />`,
  header_analytics: `<!-- Google Tag Manager -->
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
  footer_widget: `<!-- Any footer widget (always loads, no consent needed) -->
<script async src="https://example.com/widget.js"></script>`,
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
          {CONSENT_GATED_IDS.has(block.id) && (
            <span
              title="Scripts in this block only run after the visitor accepts Marketing & analytics cookies"
              className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600"
            >
              <ShieldCheck className="h-3 w-3" />
              Consent-gated
            </span>
          )}
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

/* ── Announcement banner editor ── */
const SIZE_OPTIONS: { id: AnnouncementSize; label: string }[] = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Large" },
]

const ALIGN_OPTIONS: { id: AnnouncementAlign; label: string; Icon: typeof AlignLeft }[] = [
  { id: "left", label: "Left", Icon: AlignLeft },
  { id: "center", label: "Center", Icon: AlignCenter },
  { id: "right", label: "Right", Icon: AlignRight },
]

// Display defaults shown in the colour pickers when the admin hasn't chosen a
// custom value yet (empty string = "use theme default").
const DEFAULT_BG_HEX = "#10b981"
const DEFAULT_TEXT_HEX = "#ffffff"

interface AnnouncementValue {
  enabled: boolean
  content: string
  size: AnnouncementSize
  align: AnnouncementAlign
  bgColor: string
  textColor: string
}

function AnnouncementEditor({
  value,
  onChange,
}: {
  value: AnnouncementValue
  onChange: (v: AnnouncementValue) => void
}) {
  const hasContent = value.content.replace(/<[^>]*>/g, "").trim().length > 0
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={`rounded-xl border transition-all ${value.enabled ? "border-primary/30 bg-card" : "border-border bg-card/60"}`}>
      {/* Header row */}
      <div className={`flex items-center gap-3 px-5 py-4 ${expanded ? "border-b border-border" : ""}`}>
        <Toggle checked={value.enabled} onChange={(v) => onChange({ ...value, enabled: v })} />
        <Megaphone className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground">Announcement Banner</span>
          <span className="text-[11px] text-muted-foreground">
            A styled promo bar shown above the navigation on every public page. No HTML needed.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {value.enabled ? (
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
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
      <div className="flex flex-col gap-4 px-5 py-4">
        {/* Live preview */}
        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Live preview
          </span>
          {hasContent ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <AnnouncementBannerContent
                content={value.content}
                size={value.size}
                align={value.align}
                bgColor={value.bgColor}
                textColor={value.textColor}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-3 text-center text-[11px] text-muted-foreground">
              Add a message below to preview the banner.
            </div>
          )}
        </div>

        {/* Rich text editor */}
        <div>
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Message
          </span>
          <RichTextEditor
            value={value.content}
            onChange={(html) => onChange({ ...value, content: html })}
            placeholder="e.g. Spring Sale — 15% off all tours this weekend!"
            minHeight={100}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Bold, italics, headings, lists, colours and links all render exactly as shown in
            the live preview. Text colour from the editor overrides the default below. Links
            open in a new tab.
          </p>
        </div>

        {/* Size + alignment selectors */}
        <div className="flex flex-wrap gap-6">
          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Size
            </span>
            <div className="flex gap-1.5">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange({ ...value, size: opt.id })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    value.size === opt.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Text alignment
            </span>
            <div className="flex gap-1.5">
              {ALIGN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.label}
                  onClick={() => onChange({ ...value, align: opt.id })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    value.align === opt.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <opt.Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Colour controls */}
        <div className="flex flex-wrap gap-6">
          <ColorControl
            label="Banner colour"
            value={value.bgColor}
            fallbackHex={DEFAULT_BG_HEX}
            defaultLabel="Theme colour"
            onChange={(c) => onChange({ ...value, bgColor: c })}
          />
          <ColorControl
            label="Text colour"
            value={value.textColor}
            fallbackHex={DEFAULT_TEXT_HEX}
            defaultLabel="White (default)"
            onChange={(c) => onChange({ ...value, textColor: c })}
          />
        </div>
      </div>
      )}
    </div>
  )
}

/* ── Colour picker control (with reset-to-default) ── */
function ColorControl({
  label,
  value,
  fallbackHex,
  defaultLabel,
  onChange,
}: {
  label: string
  value: string
  fallbackHex: string
  defaultLabel: string
  onChange: (color: string) => void
}) {
  return (
    <div>
      <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <label className="relative h-8 w-10 cursor-pointer overflow-hidden rounded-lg border border-border">
          <span
            className="block h-full w-full"
            style={{ backgroundColor: value || fallbackHex }}
          />
          <input
            type="color"
            value={value || fallbackHex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-0 w-0 cursor-pointer opacity-0"
          />
        </label>
        <span className="font-mono text-[11px] text-muted-foreground">
          {value || defaultLabel}
        </span>
        {value && (
          <button
            type="button"
            title="Reset to default"
            onClick={() => onChange("")}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Contact Info editor ── */
interface ContactInfoValue {
  address: string
  email: string
  phone: string
}

function ContactInfoEditor({
  value,
  onChange,
}: {
  value: ContactInfoValue
  onChange: (v: ContactInfoValue) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className={`flex items-center gap-3 px-5 py-4 ${expanded ? "border-b border-border" : ""}`}>
        <MapPin className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex flex-1 flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground">Contact Info</span>
          <span className="text-[11px] text-muted-foreground">
            Address, email and phone shown in the site footer and Legal Notice page.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-3 w-3" /> Address
            </label>
            <input
              type="text"
              value={value.address}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="430-434 route de Longwy, L-1940 Luxembourg"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Mail className="h-3 w-3" /> Email
            </label>
            <input
              type="email"
              value={value.email}
              onChange={(e) => onChange({ ...value, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="hello@sightseeing.lu"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Phone className="h-3 w-3" /> Phone
            </label>
            <input
              type="text"
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="+352 266 51 2200"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const next = arr.slice()
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

function FooterMenuEditor({ value, onChange }: { value: FooterMenu; onChange: (m: FooterMenu) => void }) {
  const setGroups = (groups: FooterGroup[]) => onChange({ groups })

  const updateGroup = (gi: number, patch: Partial<FooterGroup>) =>
    setGroups(value.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const updateItem = (gi: number, ii: number, patch: Partial<FooterItem>) =>
    updateGroup(gi, { items: value.groups[gi].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) })

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Footer Menu</h3>
        <button
          type="button"
          onClick={() => onChange(FOOTER_MENU_DEFAULT)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Reset to default
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Edit footer link groups and items. Hiding an item removes it from the footer; for the
        travel-booking pages (Flights, Trains, Cars, Hotels, Vacation Aggregator) it also makes the page
        return 404 to visitors (admins still see it). Save with the button above.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {value.groups.map((group, gi) => (
          <div key={group.id} className="rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center gap-2">
              <input
                value={group.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                placeholder="Group title"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button type="button" title="Move up" onClick={() => setGroups(move(value.groups, gi, gi - 1))} className="rounded p-1 text-muted-foreground hover:bg-muted">▲</button>
              <button type="button" title="Move down" onClick={() => setGroups(move(value.groups, gi, gi + 1))} className="rounded p-1 text-muted-foreground hover:bg-muted">▼</button>
              <button
                type="button"
                title="Delete group"
                onClick={() => {
                  if (window.confirm(`Delete the group "${group.title || "Untitled"}" and its ${group.items.length} item${group.items.length === 1 ? "" : "s"}? This cannot be undone until you reload without saving.`)) {
                    setGroups(value.groups.filter((_, i) => i !== gi))
                  }
                }}
                className="rounded p-1 text-destructive hover:bg-destructive/10"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex flex-col divide-y divide-border/40 border-t border-border/40">
              {group.items.map((item, ii) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 px-1 py-2">
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(gi, ii, { label: e.target.value })}
                    placeholder="Label"
                    className="w-44 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    value={item.href}
                    onChange={(e) => updateItem(gi, ii, { href: e.target.value })}
                    placeholder="https://… or /path"
                    className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={!!item.external} onChange={(e) => updateItem(gi, ii, { external: e.target.checked })} /> External
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-foreground">
                    <input type="checkbox" checked={!!item.hidden} onChange={(e) => updateItem(gi, ii, { hidden: e.target.checked })} /> Hidden
                  </label>
                  {item.pageKey && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600" title="Hiding this item also 404s its page">page</span>
                  )}
                  <button type="button" title="Move up" onClick={() => updateGroup(gi, { items: move(group.items, ii, ii - 1) })} className="rounded p-1 text-muted-foreground hover:bg-muted">▲</button>
                  <button type="button" title="Move down" onClick={() => updateGroup(gi, { items: move(group.items, ii, ii + 1) })} className="rounded p-1 text-muted-foreground hover:bg-muted">▼</button>
                  <button
                    type="button"
                    title="Delete item"
                    onClick={() => {
                      if (window.confirm(`Delete the footer link "${item.label || item.href || "this item"}"?`)) {
                        updateGroup(gi, { items: group.items.filter((_, i) => i !== ii) })
                      }
                    }}
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateGroup(gi, { items: [...group.items, { id: newId("item"), label: "New link", href: "/", pageKey: null }] })}
              className="mt-3 self-start rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              + Add item
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setGroups([...value.groups, { id: newId("group"), title: "New group", items: [{ id: newId("item"), label: "New link", href: "/", pageKey: null }] }])}
          className="self-start rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          + Add group
        </button>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function HeaderFooterPage() {
  const [tab, setTab] = useState<TabKey>("header")
  const [blocks, setBlocks] = useState<Record<Section, CodeBlock[]>>(DEFAULT_BLOCKS)
  const [announcement, setAnnouncement] = useState<AnnouncementValue>({
    enabled: false, content: "", size: "md", align: "center", bgColor: "", textColor: "",
  })
  const [contactInfo, setContactInfo] = useState<ContactInfoValue>({
    address: "430-434 route de Longwy, L-1940 Luxembourg",
    email: "hello@sightseeing.lu",
    phone: "+352 266 51 2200",
  })
  const [footerMenu, setFooterMenu] = useState<FooterMenu>(FOOTER_MENU_DEFAULT)
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
        if (header || footer) {
          const headerParts = splitMergedHtml("header", header)
          const footerParts = splitMergedHtml("footer", footer)
          setBlocks((prev) => ({
            header: prev.header.map((b) =>
              headerParts[b.id] ? { ...b, code: headerParts[b.id], enabled: true } : b
            ),
            footer: prev.footer.map((b) =>
              footerParts[b.id] ? { ...b, code: footerParts[b.id], enabled: true } : b
            ),
          }))
        }
        if (s?.announcement) {
          const a = s.announcement
          setAnnouncement({
            enabled: a.enabled === true,
            content: typeof a.content === "string" ? a.content : "",
            size: (["sm", "md", "lg"] as const).includes(a.size) ? a.size : "md",
            align: (["left", "center", "right"] as const).includes(a.align) ? a.align : "center",
            bgColor: typeof a.bgColor === "string" ? a.bgColor : "",
            textColor: typeof a.textColor === "string" ? a.textColor : "",
          })
        }
        if (s?.contactInfo) {
          const c = s.contactInfo
          setContactInfo({
            address: typeof c.address === "string" && c.address ? c.address : "430-434 route de Longwy, L-1940 Luxembourg",
            email: typeof c.email === "string" && c.email ? c.email : "hello@sightseeing.lu",
            phone: typeof c.phone === "string" && c.phone ? c.phone : "+352 266 51 2200",
          })
        }
        if (s?.footerMenu?.groups) setFooterMenu(s.footerMenu as FooterMenu)
      })
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setError("")
    try {
      // Merge all enabled blocks into one HTML string per section.
      // Consent-gated blocks are wrapped in markers the frontend injector
      // understands: their content only runs after marketing consent.
      const mergeBlock = (b: CodeBlock) =>
        CONSENT_GATED_IDS.has(b.id)
          ? `<!-- ${b.label} -->\n${CONSENT_OPEN}\n${b.code.trim()}\n${CONSENT_CLOSE}`
          : `<!-- ${b.label} -->\n${b.code.trim()}`
      const headerHtml = blocks.header
        .filter((b) => b.enabled && b.code.trim())
        .map(mergeBlock)
        .join("\n\n")
      const footerHtml = blocks.footer
        .filter((b) => b.enabled && b.code.trim())
        .map(mergeBlock)
        .join("\n\n")

      const responses = await Promise.all([
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
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "announcement", data: announcement }),
        }),
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "contactInfo", data: contactInfo }),
        }),
        fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "footerMenu", data: { menu: footerMenu } }),
        }),
      ])

      if (responses.some((r) => !r.ok)) {
        throw new Error("save failed")
      }

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
        {([
          { key: "header", label: "Header", Icon: ArrowUpToLine },
          { key: "footer", label: "Footer", Icon: ArrowDownToLine },
          { key: "footer-menu", label: "Footer Menu", Icon: ListTree },
        ] as const).map(({ key, label, Icon }) => {
          const count = key === "header" ? headerActive : key === "footer" ? footerActive : 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-t-lg px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === key
                  ? "border border-b-0 border-border bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
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
          {/* Structured announcement banner (header tab only) */}
          {tab === "header" && (
            <AnnouncementEditor value={announcement} onChange={setAnnouncement} />
          )}

          {/* Contact info (footer tab only) */}
          {tab === "footer" && (
            <ContactInfoEditor value={contactInfo} onChange={setContactInfo} />
          )}

          {/* Footer Menu tab — standalone editor, no code-injection blocks */}
          {tab === "footer-menu" ? (
            <FooterMenuEditor value={footerMenu} onChange={setFooterMenu} />
          ) : (
            <>
              {/* Injection zone info */}
              <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {tab === "header" ? "Custom code injected above the navigation bar" : "Injected below the site footer"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {tab === "header"
                      ? "Code in enabled blocks is combined and rendered before <Navbar /> on every public page. Ideal for analytics tags and critical head scripts. For a promo bar, use the Announcement Banner above instead."
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
            </>
          )}
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
