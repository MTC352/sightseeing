// lib/admin-store.ts
//
// TYPES ONLY.
//
// The legacy in-memory admin store (~700 lines of hardcoded demo data) was
// removed in 2026-05. All admin CRUD is now DB-backed via lib/db/queries.ts
// and the corresponding /api/admin/* routes. Trips, in particular, are
// sourced exclusively from TourCMS via the Palisis importer — there is no
// static seed data anywhere in the codebase.
//
// These TypeScript interfaces remain because several admin edit forms still
// import them as shape contracts for their local React state.

/** A single structured itinerary step shown on the trip detail page. */
export interface ItineraryStep {
  name: string
  description: string
}

export interface AdminTrip {
  id: string
  palisis_id?: string
  title: string
  description: string
  price: number
  originalPrice?: number
  duration: string
  category: string
  tags: string[]
  city: string
  provider: string
  image: string
  gallery?: string[]
  highlights: string[]
  badge?: string
  rating: number
  reviewCount: number
  permalink?: string
  googleBusinessUrl?: string
  featured: boolean
  featuredDeparture?: boolean
  status?: "published" | "draft"

  // ── Rich Palisis fields (imported from showTour, editable in admin) ────────
  tourType?: string | null
  tourTypeCode?: number | null
  tourLeader?: string | null
  grade?: string | null
  accommodationRating?: string | null
  tripTags?: string[]
  languages?: string[]
  departureLocation?: string | null
  departureGeocode?: string | null
  endLocation?: string | null
  endGeocode?: string | null
  country?: string | null
  commercialPriority?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  experienceHighlights?: string | null
  included?: string[]
  excluded?: string[]
  essentialInformation?: string | null
  hotelPickupInstructions?: string | null
  voucherRedemptionInstructions?: string | null
  restrictions?: string | null
  extras?: string | null
  itinerary?: string | null
  receiptInformation?: string | null
  pdfUrl?: string | null
  videoUrl?: string | null
  cancellationPolicy?: string | null
  minBookingSize?: number | null
  maxBookingSize?: number | null
  nonRefundable?: boolean
  nextBookableDate?: string | null
  lastBookableDate?: string | null
  lastSyncedAt?: string | null
  syncSource?: string | null

  // ── SEO (import-safe; managed by the AI SEO optimizer, never by Palisis) ───
  seoKeyword?: string | null
  seoTitle?: string | null
  seoMetaDescription?: string | null
  seoBody?: string | null
  seoHighlights?: string[] | null
  seoSlug?: string | null
  seoScore?: number | null
  seoOptimizedAt?: string | null
  seoOptimizedBy?: string | null
  seoSourceHashes?: Record<string, string> | null

  // ── Itinerary steps (import-safe; admin/AI-authored, never written by Palisis) ──
  itinerarySteps?: ItineraryStep[] | null
}

export interface AdminJob {
  id: string
  title: string
  department: string
  location: string
  type: "Full-time" | "Part-time" | "Freelance"
  description: string
  requirements: string[]
  status: "open" | "closed"
  createdAt: string
}

export interface AdminPost {
  id: string
  slug: string
  title: string
  excerpt: string
  body: string
  image: string
  author: string
  category: string
  tags: string[]
  status: "draft" | "published"
  publishedAt: string
  readTime: string
}

export interface TicketReply {
  id: string
  ticketId: string
  authorId: string
  authorName: string
  authorRole: "user" | "admin" | "superadmin"
  message: string
  createdAt: string
}

export interface SupportTicket {
  id: string
  subject: string
  description: string
  category: "bug" | "feature" | "question" | "billing" | "other"
  priority: "low" | "medium" | "high" | "urgent"
  status: "open" | "in-progress" | "waiting" | "resolved" | "closed"
  authorId: string
  authorName: string
  authorEmail: string
  authorRole: "user" | "admin" | "superadmin"
  assignedTo?: string
  replies: TicketReply[]
  createdAt: string
  updatedAt: string
}

export interface HelpAttachment {
  id: string
  filename: string
  title: string
  url: string
  mimeType: string
  sizeBytes: number
}

export interface HelpArticle {
  id: string
  question: string
  answer: string
  category: string
  status: "published" | "draft"
  order: number
  audience: "public" | "admin"
  attachments?: HelpAttachment[]
  createdAt: string
  updatedAt: string
}
