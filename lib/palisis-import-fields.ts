/**
 * lib/palisis-import-fields.ts
 *
 * Canonical catalog of trip fields that a Palisis/TourCMS *override* import is
 * allowed to overwrite, plus helpers to sanitize/parse a list of fields the
 * admin wants to KEEP (exclude from override).
 *
 * Used by:
 *  - lib/palisis-mapper.ts        (drops excluded keys from the update payload)
 *  - app/api/admin/palisis-import (per-run + admin-default exclusions)
 *  - lib/palisis-sync.ts          (single-tour sync honors admin defaults)
 *  - app/admin/palisis/page.tsx   (Importer Settings + per-run override UI)
 *
 * ⚠️ Keys must match the payload keys produced by `mappedToUpdatePayload`.
 * Bookkeeping fields (palisisRaw / syncSource / lastSyncedAt) are intentionally
 * NOT listed here — they are always written and can never be excluded.
 */

export interface OverridableField {
  key: string
  label: string
}

/** Curated set of admin-meaningful fields that can be excluded from override. */
export const OVERRIDABLE_FIELDS: OverridableField[] = [
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "shortDescription", label: "Short description" },
  { key: "longDescription", label: "Long description" },
  { key: "price", label: "Price" },
  { key: "duration", label: "Duration" },
  { key: "image", label: "Main image" },
  { key: "gallery", label: "Gallery images" },
  { key: "city", label: "City" },
  { key: "provider", label: "Provider" },
  { key: "highlights", label: "Highlights" },
  { key: "tripTags", label: "Trip tags" },
  { key: "included", label: "What's included" },
  { key: "excluded", label: "What's excluded" },
  { key: "itinerary", label: "Itinerary" },
  { key: "essentialInformation", label: "Essential information" },
  { key: "restrictions", label: "Restrictions" },
  { key: "cancellationPolicy", label: "Cancellation policy" },
  { key: "permalink", label: "Permalink (URL slug)" },
]

const VALID_FIELD_KEYS = new Set<string>(OVERRIDABLE_FIELDS.map((f) => f.key))

/** Fields that must ALWAYS be written on every sync — never excludable. */
export const ALWAYS_WRITTEN_FIELDS = new Set<string>([
  "palisisRaw",
  "syncSource",
  "lastSyncedAt",
])

/** Filter arbitrary input down to known, valid, non-protected field keys. */
export function sanitizeExcludedFields(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  for (const v of input) {
    if (typeof v === "string" && VALID_FIELD_KEYS.has(v) && !ALWAYS_WRITTEN_FIELDS.has(v)) {
      seen.add(v)
    }
  }
  return Array.from(seen)
}

/**
 * Parse a stored excluded-fields value. Accepts a JSON string (as persisted in
 * the integrations row) or an already-parsed array. Always returns a sanitized
 * list.
 */
export function parseExcludedFields(raw: unknown): string[] {
  if (Array.isArray(raw)) return sanitizeExcludedFields(raw)
  if (typeof raw === "string" && raw.trim()) {
    try {
      return sanitizeExcludedFields(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return []
}

/** Friendly label for a field key (falls back to the key itself). */
export function fieldLabel(key: string): string {
  return OVERRIDABLE_FIELDS.find((f) => f.key === key)?.label ?? key
}
