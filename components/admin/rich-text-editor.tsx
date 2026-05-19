"use client"

/**
 * RichTextEditor — Tiptap-powered WYSIWYG editor for trip descriptions.
 *
 * Toolbar features:
 *   • Text size presets (Paragraph / Heading 2 / Heading 3 / Heading 4)
 *   • Bold · Italic · Underline · Strikethrough
 *   • Text colour (native colour picker)
 *   • Highlight colour (native colour picker)
 *   • Link (inline URL dialog, auto-adds https://)
 *   • Bullet list · Ordered list · Blockquote · Horizontal rule
 *   • Undo · Redo
 *   • Clear formatting
 *
 * Output: HTML string — stored in trip.description.
 */

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import Link from "@tiptap/extension-link"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useRef, useState } from "react"
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Link2, Link2Off, List, ListOrdered, Quote, Minus,
  Eraser, Undo2, Redo2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  editable?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your trip description here…",
  minHeight = 260,
  editable = true,
}: Props) {
  const [linkOpen,  setLinkOpen]  = useState(false)
  const [linkUrl,   setLinkUrl]   = useState("")
  const colorRef     = useRef<HTMLInputElement>(null)
  const highlightRef = useRef<HTMLInputElement>(null)
  const lastValue    = useRef(value)

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      const html = editor.getHTML()
      const out  = html === "<p></p>" ? "" : html
      lastValue.current = out
      onChange(out)
    },
    editorProps: {
      attributes: {
        class: "rte-content focus:outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
  })

  // Sync when value is changed externally (e.g. a different trip loaded)
  useEffect(() => {
    if (!editor || value === lastValue.current) return
    const cur = editor.getHTML()
    if (value !== cur) editor.commands.setContent(value ?? "", false)
    lastValue.current = value
  }, [editor, value])

  // Sync editable flag when the policy changes at runtime
  useEffect(() => {
    if (!editor) return
    if (editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function headingValue() {
    if (!editor) return "p"
    if (editor.isActive("heading", { level: 2 })) return "2"
    if (editor.isActive("heading", { level: 3 })) return "3"
    if (editor.isActive("heading", { level: 4 })) return "4"
    return "p"
  }

  function onHeadingChange(val: string) {
    if (!editor) return
    if (val === "p") editor.chain().focus().setParagraph().run()
    else editor.chain().focus().setHeading({ level: Number(val) as 2 | 3 | 4 }).run()
  }

  function openLinkDialog() {
    if (!editor) return
    if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); return }
    setLinkUrl(editor.getAttributes("link").href ?? "")
    setLinkOpen(true)
  }

  function applyLink() {
    if (!editor) return
    if (linkUrl.trim()) {
      const href = /^https?:\/\//.test(linkUrl) ? linkUrl : `https://${linkUrl}`
      editor.chain().focus().setLink({ href }).run()
    }
    setLinkOpen(false)
    setLinkUrl("")
  }

  // ── Reusable button class ──────────────────────────────────────────────────

  const btn  = "flex h-7 w-7 items-center justify-center rounded text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
  const on   = "bg-secondary text-foreground"

  const Sep = () => <div className="mx-1 h-5 w-px shrink-0 bg-border" />

  if (!editor) return (
    <div
      className="rounded-lg border border-border bg-background"
      style={{ minHeight: minHeight + 56 }}
    />
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-colors">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/20 p-1.5">

        {/* Text size preset */}
        <select
          value={headingValue()}
          onChange={(e) => onHeadingChange(e.target.value)}
          className="h-7 rounded border border-border bg-background px-1.5 text-[11px] font-medium text-foreground focus:outline-none cursor-pointer"
        >
          <option value="p">Paragraph</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
        </select>

        <Sep />

        {/* Bold */}
        <button type="button" title="Bold (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(btn, editor.isActive("bold") && on)}>
          <Bold className="h-3.5 w-3.5" />
        </button>

        {/* Italic */}
        <button type="button" title="Italic (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(btn, editor.isActive("italic") && on)}>
          <Italic className="h-3.5 w-3.5" />
        </button>

        {/* Underline */}
        <button type="button" title="Underline (⌘U)" onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(btn, editor.isActive("underline") && on)}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </button>

        {/* Strikethrough */}
        <button type="button" title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}
          className={cn(btn, editor.isActive("strike") && on)}>
          <Strikethrough className="h-3.5 w-3.5" />
        </button>

        <Sep />

        {/* Text colour */}
        <div className="relative" title="Text colour">
          <button
            type="button"
            onClick={() => colorRef.current?.click()}
            className={cn(btn, "w-8 flex-col gap-0 pb-0.5")}
          >
            <span className="text-[11px] font-black leading-none text-foreground">A</span>
            <span
              className="h-[3px] w-4 rounded-full"
              style={{ backgroundColor: editor.getAttributes("textStyle").color ?? "#000000" }}
            />
          </button>
          <input
            ref={colorRef}
            type="color"
            defaultValue="#000000"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="absolute inset-0 h-0 w-0 cursor-pointer opacity-0"
          />
        </div>

        {/* Highlight colour */}
        <div className="relative" title="Highlight colour">
          <button
            type="button"
            onClick={() => highlightRef.current?.click()}
            className={cn(btn, "w-8 flex-col gap-0 pb-0.5")}
          >
            <span className="text-[11px] font-black leading-none text-foreground">H</span>
            <span
              className="h-[3px] w-4 rounded-full"
              style={{ backgroundColor: (editor.getAttributes("highlight") as { color?: string }).color ?? "#fbbf24" }}
            />
          </button>
          <input
            ref={highlightRef}
            type="color"
            defaultValue="#fbbf24"
            onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
            className="absolute inset-0 h-0 w-0 cursor-pointer opacity-0"
          />
        </div>

        <Sep />

        {/* Link */}
        <button
          type="button"
          title={editor.isActive("link") ? "Remove link" : "Insert link"}
          onClick={openLinkDialog}
          className={cn(btn, editor.isActive("link") && on)}
        >
          {editor.isActive("link") ? <Link2Off className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        </button>

        <Sep />

        {/* Bullet list */}
        <button type="button" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(btn, editor.isActive("bulletList") && on)}>
          <List className="h-3.5 w-3.5" />
        </button>

        {/* Ordered list */}
        <button type="button" title="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn(btn, editor.isActive("orderedList") && on)}>
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        {/* Blockquote */}
        <button type="button" title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={cn(btn, editor.isActive("blockquote") && on)}>
          <Quote className="h-3.5 w-3.5" />
        </button>

        {/* Horizontal rule */}
        <button type="button" title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btn}>
          <Minus className="h-3.5 w-3.5" />
        </button>

        <Sep />

        {/* Undo */}
        <button type="button" title="Undo (⌘Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={btn}>
          <Undo2 className="h-3.5 w-3.5" />
        </button>

        {/* Redo */}
        <button type="button" title="Redo (⌘⇧Z)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={btn}>
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="ml-auto" />

        {/* Clear formatting */}
        <button
          type="button"
          title="Clear formatting"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className={cn(btn, "text-muted-foreground/50 hover:text-destructive")}
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Inline link dialog ───────────────────────────────────────────── */}
      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-3 py-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); applyLink() }
              if (e.key === "Escape") { setLinkOpen(false); setLinkUrl("") }
            }}
            placeholder="https://example.com"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => { setLinkOpen(false); setLinkUrl("") }}
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Editor content ───────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
