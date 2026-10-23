/**
 * lib/page-layout.ts
 * Pure helpers for the inline page editor's layout controls: removing boxes
 * (<EditableBox>) and choosing a column preset per row (<EditableColumns>).
 *
 * Everything is stored in the inline page_content bucket next to text edits:
 *   layout:hide:<boxId>  → "<pathname>|<label>" while removed, "0" once restored
 *   layout:cols:<rowId>  → a preset value (see CARD_PRESETS / SPLIT_PRESETS)
 *
 * Box/row ids are fixed names written in the page code (e.g. "about/values/passion"),
 * never DOM positions, so a saved removal can't land on the wrong element.
 */

export const HIDE_PREFIX = "layout:hide:"
export const COLS_PREFIX = "layout:cols:"

export const hideKey = (boxId: string) => `${HIDE_PREFIX}${boxId}`
export const colsKey = (rowId: string) => `${COLS_PREFIX}${rowId}`

/** A stored hide value means "removed" unless empty or the restore marker "0". */
export function isHiddenValue(v: string | undefined | null): boolean {
  return typeof v === "string" && v !== "" && v !== "0"
}

/** Value stored when a box is removed: where it was removed and its label. */
export function hideValue(pathname: string, label: string): string {
  const clean = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim().slice(0, 200)
  return `${clean(pathname) || "/"}|${clean(label) || "Section"}`
}

export function parseHideValue(v: string): { path: string; label: string } {
  const i = v.indexOf("|")
  if (i === -1) return { path: "", label: v }
  return { path: v.slice(0, i), label: v.slice(i + 1) }
}

/** A site-relative page path ("/about"), never a scheme, "//host" or backslash. */
export function isSafePagePath(path: string): boolean {
  return /^\/(?!\/)[^\s\\|]*$/.test(path) && path.length <= 200
}

export interface RemovedBox {
  id: string
  path: string
  label: string
}

/** All currently removed boxes in a content map, sorted by page then label. */
export function listRemovedBoxes(content: Record<string, string>): RemovedBox[] {
  const out: RemovedBox[] = []
  for (const [key, value] of Object.entries(content)) {
    if (!key.startsWith(HIDE_PREFIX) || !isHiddenValue(value)) continue
    out.push({ id: key.slice(HIDE_PREFIX.length), ...parseHideValue(value) })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.label.localeCompare(b.label))
}

// ── Column presets ──────────────────────────────────────────────────────────

/** Card rows: "auto" keeps the code's column count; a number forces it (desktop). */
export const CARD_PRESETS = ["auto", "1", "2", "3", "4"] as const

/** Two-column rows: desktop width split, or stacked. */
export const SPLIT_PRESETS = {
  "50-50": "minmax(0,1fr) minmax(0,1fr)",
  "60-40": "minmax(0,3fr) minmax(0,2fr)",
  "40-60": "minmax(0,2fr) minmax(0,3fr)",
  "66-33": "minmax(0,2fr) minmax(0,1fr)",
  "33-66": "minmax(0,1fr) minmax(0,2fr)",
  stack: "minmax(0,1fr)",
} as const

export type ColumnsKind = "cards" | "split"
export type SplitPreset = keyof typeof SPLIT_PRESETS

export const SPLIT_LABELS: Record<SplitPreset, string> = {
  "50-50": "50 / 50",
  "60-40": "60 / 40",
  "40-60": "40 / 60",
  "66-33": "66 / 33",
  "33-66": "33 / 66",
  stack: "Stacked",
}

export function isValidColsValue(kind: ColumnsKind | "any", v: string): boolean {
  const card = (CARD_PRESETS as readonly string[]).includes(v)
  // "auto" on a split row means "as coded".
  const split = v === "auto" || Object.prototype.hasOwnProperty.call(SPLIT_PRESETS, v)
  return kind === "cards" ? card : kind === "split" ? split : card || split
}

/** Card presets an admin may pick: never more columns than there are visible boxes. */
export function cardPresetOptions(visible: number): string[] {
  return CARD_PRESETS.filter((p) => p === "auto" || Number(p) <= Math.max(1, visible))
}

/**
 * Desktop column count for a card row, or null to leave the code's classes
 * untouched. `defaultCols` is the code's widest column count, `total` the
 * number of boxes in the row and `visible` those not removed. Rows the admin
 * hasn't touched (no preset, nothing removed) keep their layout exactly; once
 * touched, the count is capped at the visible boxes so no column is left empty.
 */
export function resolveCardColumns(
  defaultCols: number,
  preset: string | undefined,
  visible: number,
  total: number,
): number | null {
  const forced = preset && preset !== "auto" && isValidColsValue("cards", preset) ? Number(preset) : null
  if (forced === null && visible >= total) return null
  const cols = Math.max(1, Math.min(forced ?? defaultCols, visible))
  return cols === defaultCols ? null : cols
}

/**
 * Desktop grid-template-columns for a two-column row, or null to keep the
 * code's classes. One visible column always fills the full width.
 */
export function resolveSplitTemplate(preset: string | undefined, visible: number): string | null {
  if (visible <= 1) return SPLIT_PRESETS.stack
  if (!preset || preset === "auto" || !isValidColsValue("split", preset)) return null
  return SPLIT_PRESETS[preset as SplitPreset]
}

// ── Save validation (server) ────────────────────────────────────────────────

/**
 * Checks the layout:* keys in an inline-content save. Returns an error message,
 * or null when the batch is acceptable. Restoring a removed box (writing "0" or
 * "" over a removed one) is reserved for the superadmin.
 */
export function validateLayoutChanges(
  changes: Record<string, string>,
  saved: Record<string, string>,
  isSuperadmin: boolean,
): string | null {
  for (const [key, value] of Object.entries(changes)) {
    if (key.startsWith(HIDE_PREFIX)) {
      if (!key.slice(HIDE_PREFIX.length)) return "Invalid section id"
      if (isHiddenValue(value)) {
        const { path, label } = parseHideValue(value)
        if (!isSafePagePath(path) || !label || label.length > 200) return "Invalid removed-section value"
      }
      if (!isHiddenValue(value) && isHiddenValue(saved[key]) && !isSuperadmin) {
        return "Only the superadmin can restore removed sections"
      }
    } else if (key.startsWith(COLS_PREFIX)) {
      if (!key.slice(COLS_PREFIX.length)) return "Invalid row id"
      if (!isValidColsValue("any", value)) return `Invalid column preset "${value}"`
    }
  }
  return null
}

/** Turn a title into an id segment: "Passion for Luxembourg" → "passion-for-luxembourg". */
export function layoutSlug(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item"
}
