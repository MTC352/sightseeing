/**
 * lib/trip-field-policy.ts
 *
 * Per-field editability policy for the admin trip edit form.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * Most rich trip fields are owned upstream by Palisis (one-way sync). Letting
 * admins type into them is misleading because the next sync will overwrite the
 * change. This policy lets an admin mark each field as "editable" or
 * "readonly" via /admin/settings/trips.
 *
 * Read-only fields are still SYNCED — the Palisis import / single-sync
 * always writes every column. Read-only only blocks the UI input.
 *
 * Storage: the policy is a JSON blob stored in the `integrations` table under
 * key='trip_field_policy' (so it lives alongside every other admin setting).
 */

export type FieldMode = "editable" | "readonly"

export interface TripFieldDef {
  key: string         // matches AdminTrip property name
  label: string       // user-facing label
  group: string       // section grouping in the settings UI
  /** "palisis" = synced from upstream, "local" = our DB only. */
  source: "palisis" | "local"
  /** Default mode when no policy entry exists. */
  defaultMode: FieldMode
}

/**
 * Canonical list of every trip field that can be edited in the admin.
 * Adding a new field here automatically:
 *   1) shows it on the settings page
 *   2) makes it gate-able in the trip edit form (via `isFieldEditable`)
 */
export const TRIP_FIELDS: TripFieldDef[] = [
  // ── Basics (local, defaults editable) ─────────────────────────────────────
  { key: "title",             label: "Title",            group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "image",             label: "Featured Image",   group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "description",       label: "Description",      group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "gallery",           label: "Gallery",          group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "price",             label: "Price",            group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "originalPrice",     label: "Original Price",   group: "Basics",  source: "local",   defaultMode: "editable" },
  { key: "duration",          label: "Duration",         group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "badge",             label: "Badge",            group: "Basics",  source: "local",   defaultMode: "editable" },
  { key: "city",              label: "City",             group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "provider",          label: "Provider",         group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "category",          label: "Category",         group: "Basics",  source: "local",   defaultMode: "editable" },
  { key: "slug",              label: "URL Slug",         group: "Basics",  source: "local",   defaultMode: "editable" },
  { key: "permalink",         label: "Permalink",        group: "Basics",  source: "palisis", defaultMode: "editable" },
  { key: "googleBusinessUrl", label: "Google Business URL", group: "Basics", source: "local", defaultMode: "editable" },
  { key: "featured",          label: "Featured",         group: "Basics",  source: "local",   defaultMode: "editable" },
  { key: "featuredDeparture", label: "Featured Departure", group: "Basics", source: "local",  defaultMode: "editable" },
  { key: "status",            label: "Status",           group: "Basics",  source: "local",   defaultMode: "editable" },

  // ── Trip Tags (Palisis — default read-only as per user request) ───────────
  { key: "tripTags",          label: "Trip Tags",        group: "Tags",    source: "palisis", defaultMode: "readonly" },

  // ── Highlights ────────────────────────────────────────────────────────────
  { key: "highlights",        label: "Highlights (list)", group: "Highlights", source: "palisis", defaultMode: "readonly" },

  // ── Tour Classification (all Palisis) ────────────────────────────────────
  { key: "tourType",            label: "Tour Type",            group: "Classification", source: "palisis", defaultMode: "readonly" },
  { key: "tourLeader",          label: "Tour Leader",          group: "Classification", source: "palisis", defaultMode: "readonly" },
  { key: "grade",               label: "Grade",                group: "Classification", source: "palisis", defaultMode: "readonly" },
  { key: "commercialPriority",  label: "Commercial Priority",  group: "Classification", source: "palisis", defaultMode: "readonly" },
  { key: "accommodationRating", label: "Accommodation Rating", group: "Classification", source: "palisis", defaultMode: "readonly" },
  { key: "country",             label: "Country",              group: "Classification", source: "palisis", defaultMode: "readonly" },

  // ── Location ─────────────────────────────────────────────────────────────
  { key: "departureLocation", label: "Departure Location", group: "Location", source: "palisis", defaultMode: "readonly" },
  { key: "departureGeocode",  label: "Departure Geocode",  group: "Location", source: "palisis", defaultMode: "readonly" },
  { key: "endLocation",       label: "End Location",       group: "Location", source: "palisis", defaultMode: "readonly" },
  { key: "endGeocode",        label: "End Geocode",        group: "Location", source: "palisis", defaultMode: "readonly" },

  // ── Languages ────────────────────────────────────────────────────────────
  { key: "languages",         label: "Languages Spoken",  group: "Languages", source: "palisis", defaultMode: "readonly" },

  // ── Included / Excluded ──────────────────────────────────────────────────
  { key: "included",          label: "What's Included",   group: "Inclusions", source: "palisis", defaultMode: "readonly" },
  { key: "excluded",          label: "What's Excluded",   group: "Inclusions", source: "palisis", defaultMode: "readonly" },

  // ── Detailed Descriptions ────────────────────────────────────────────────
  { key: "shortDescription",              label: "Short Description",                group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "longDescription",               label: "Long Description",                 group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "experienceHighlights",          label: "Experience Highlights (raw)",      group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "itinerary",                     label: "Itinerary",                        group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "essentialInformation",          label: "Essential Information",            group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "hotelPickupInstructions",       label: "Hotel Pickup Instructions",        group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "voucherRedemptionInstructions", label: "Voucher Redemption Instructions",  group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "restrictions",                  label: "Restrictions",                     group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "extras",                        label: "Extras / Upgrades",                group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "receiptInformation",            label: "Receipt Information",              group: "Detailed", source: "palisis", defaultMode: "readonly" },
  { key: "cancellationPolicy",            label: "Cancellation Policy",              group: "Detailed", source: "palisis", defaultMode: "readonly" },

  // ── Booking constraints ──────────────────────────────────────────────────
  { key: "minBookingSize",    label: "Min Booking Size",   group: "Booking", source: "palisis", defaultMode: "readonly" },
  { key: "maxBookingSize",    label: "Max Booking Size",   group: "Booking", source: "palisis", defaultMode: "readonly" },
  { key: "nextBookableDate",  label: "Next Bookable Date", group: "Booking", source: "palisis", defaultMode: "readonly" },
  { key: "lastBookableDate",  label: "Last Bookable Date", group: "Booking", source: "palisis", defaultMode: "readonly" },
  { key: "nonRefundable",     label: "Non-Refundable",     group: "Booking", source: "palisis", defaultMode: "readonly" },

  // ── Additional Media ─────────────────────────────────────────────────────
  { key: "pdfUrl",            label: "PDF Document URL",   group: "Media",   source: "palisis", defaultMode: "readonly" },
  { key: "videoUrl",          label: "Video URL",          group: "Media",   source: "palisis", defaultMode: "readonly" },
]

export type TripFieldPolicy = Record<string, FieldMode>

/** Build the default policy from `TRIP_FIELDS.defaultMode`. */
export function buildDefaultPolicy(): TripFieldPolicy {
  const out: TripFieldPolicy = {}
  for (const f of TRIP_FIELDS) out[f.key] = f.defaultMode
  return out
}

/**
 * Resolve a field's current editability.
 * Unknown keys default to editable so a missing entry never silently locks
 * a brand-new field that hasn't been registered yet.
 */
export function isFieldEditable(policy: TripFieldPolicy | null | undefined, key: string): boolean {
  if (!policy) {
    const def = TRIP_FIELDS.find(f => f.key === key)
    return def ? def.defaultMode === "editable" : true
  }
  const mode = policy[key]
  if (mode === "readonly") return false
  if (mode === "editable") return true
  // Not set — fall back to the field's own default.
  const def = TRIP_FIELDS.find(f => f.key === key)
  return def ? def.defaultMode === "editable" : true
}

/** Merge a stored policy on top of the defaults so the UI always sees every field. */
export function resolvePolicy(stored: Partial<TripFieldPolicy> | null | undefined): TripFieldPolicy {
  const out = buildDefaultPolicy()
  for (const [key, mode] of Object.entries(stored ?? {})) {
    if (mode) out[key] = mode
  }
  return out
}

/**
 * UI-behavior settings for the trip edit page (separate from per-field modes).
 * Stored as a JSON blob in `integrations` under key='trip_field_settings'.
 */
export interface TripFieldSettings {
  /** When true, read-only fields are hidden by default on the trip edit page
   *  (admin can still reveal them per-session via an on-page toggle). */
  hideReadonlyByDefault: boolean
}

export const DEFAULT_TRIP_FIELD_SETTINGS: TripFieldSettings = {
  hideReadonlyByDefault: true,
}

/** Merge stored settings on top of the defaults so callers always get every field. */
export function resolveTripFieldSettings(
  stored: Partial<TripFieldSettings> | null | undefined,
): TripFieldSettings {
  return {
    hideReadonlyByDefault:
      typeof stored?.hideReadonlyByDefault === "boolean"
        ? stored.hideReadonlyByDefault
        : DEFAULT_TRIP_FIELD_SETTINGS.hideReadonlyByDefault,
  }
}
