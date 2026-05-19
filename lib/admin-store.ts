/**
 * lib/admin-store.ts
 * In-memory CMS store — seeded from lib/data.ts.
 * Easily swappable for Neon / Supabase by replacing the Map operations.
 */

import { trips as seedTrips } from "./data"

/* ── Types ────────────────────────────────────────────────────────── */

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
  featuredDeparture: boolean
  status: "published" | "draft"

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

export interface JobApplication {
  id: string
  jobId: string
  jobTitle: string
  fullName: string
  email: string
  phone?: string
  coverLetter: string
  resumeUrl?: string
  portfolioUrl?: string
  linkedinUrl?: string
  attachments: { name: string; url: string }[]
  status: "new" | "reviewing" | "shortlisted" | "rejected" | "hired"
  notes?: string
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

export interface Departure {
  id: string
  tripId: string
  tripTitle: string
  tripImage: string
  category: string
  city: string
  date: string        // ISO date: "2026-03-22"
  time: string        // "09:30"
  spotsTotal: number
  spotsBooked: number
  guideId: string
  guideName: string
  status: "scheduled" | "full" | "cancelled" | "completed"
  price: number
}

export interface HelpArticle {
  id: string
  question: string
  answer: string
  category: string
  status: "published" | "draft"
  order: number
  createdAt: string
  updatedAt: string
}

export interface PlannerBehaviorSettings {
  // AI Behavior
  model: string
  optimizationPriority: "minimize_travel" | "maximize_activities" | "budget_conscious" | "balanced"
  preferenceWeighting: number // 0-100: how strongly to factor user preferences
  suggestionRandomness: number // 0-100: varied vs predictable
  localFavoritesBias: number // 0-100: popular vs hidden gems
  
  // Itinerary & Scheduling
  bufferTimeBetweenStops: number // minutes
  maxStopsPerDay: number
  defaultActivityDuration: number // minutes
  dayStartTime: string // "08:00"
  dayEndTime: string // "22:00"
  autoInsertMealBreaks: boolean
  lunchBreakTime: string // "12:30"
  dinnerBreakTime: string // "19:00"
  mealBreakDuration: number // minutes
  travelTimeMethod: "walking" | "driving" | "public_transport"
}

export interface AdminSettings {
  apiKeys: {
    openWeather: string
    mapbox: string
    anthropic: string
    openai: string
    palisis: string
    googlePlaceId: string
    googleReviews: string
    weglot: string
  }
  ai: Record<
    string,
    {
      systemPrompt: string
      model: string
      temperature: number
      maxTokens: number
    }
  >
  plannerBehavior: PlannerBehaviorSettings
  weglot: {
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
  header: { customHtml: string }
  footer: { customHtml: string }
  pages: Record<string, unknown>
}

/* ── Seed data ────────────────────────────────────────────────────── */

function seedStore(): Map<string, AdminTrip> {
  const m = new Map<string, AdminTrip>()
  for (const t of seedTrips) {
    m.set(t.id, {
      id: t.id,
      title: t.title,
      description: t.description ?? "",
      price: t.price,
      originalPrice: t.originalPrice,
      duration: t.duration,
      category: t.category,
      tags: t.tags,
      city: t.city ?? "Luxembourg",
      provider: t.provider ?? "Sightseeing.lu",
      image: t.image,
      highlights: t.highlights ?? [],
      badge: t.badge,
      rating: t.rating,
      reviewCount: t.reviewCount,
      permalink: t.permalink,
      googleBusinessUrl: "",
      featured: t.tags.includes("popular"),
      featuredDeparture: false,
      status: "published",
    })
  }
  return m
}

/* ── Stores ────────────────────────────────────────────────────────── */

// Module-level singletons (survive HMR in dev via globalThis trick)
function seedDepartures(): Map<string, Departure> {
  const m = new Map<string, Departure>()
  const base = new Date("2026-03-22")
  const addDays = (d: Date, n: number) => {
    const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10)
  }
  const seed: Omit<Departure, "id">[] = [
    { tripId: "31898", tripTitle: "Luxembourg City Train Tour", tripImage: "/images/trips/city-train.jpg", category: "Tours", city: "Luxembourg City", date: addDays(base, 0), time: "09:30", spotsTotal: 20, spotsBooked: 16, guideId: "g1", guideName: "Sophie Martin", status: "scheduled", price: 25 },
    { tripId: "31876", tripTitle: "Old Town Walking Tour", tripImage: "/images/trips/old-town-walk.jpg", category: "Walking", city: "Luxembourg City", date: addDays(base, 0), time: "10:00", spotsTotal: 15, spotsBooked: 7, guideId: "g2", guideName: "Marc Dubois", status: "scheduled", price: 18 },
    { tripId: "31855", tripTitle: "Moselle Wine Tasting", tripImage: "/images/trips/wine-tasting.jpg", category: "Food & Drink", city: "Remich", date: addDays(base, 1), time: "09:00", spotsTotal: 12, spotsBooked: 10, guideId: "g3", guideName: "Anna Schmitt", status: "scheduled", price: 55 },
    { tripId: "31861", tripTitle: "Vianden Castle Day Trip", tripImage: "/images/trips/vianden-castle.jpg", category: "Day Trips", city: "Vianden", date: addDays(base, 1), time: "15:00", spotsTotal: 25, spotsBooked: 22, guideId: "g1", guideName: "Sophie Martin", status: "scheduled", price: 40 },
    { tripId: "31318", tripTitle: "E-Bike Adventure Mullerthal", tripImage: "/images/trips/ebike-mullerthal.jpg", category: "Adventure", city: "Mullerthal", date: addDays(base, 3), time: "09:00", spotsTotal: 10, spotsBooked: 4, guideId: "g2", guideName: "Marc Dubois", status: "scheduled", price: 65 },
    { tripId: "31464", tripTitle: "Dinner Hopping Bus", tripImage: "/images/trips/dinner-hopping-gourmet.jpg", category: "Food & Drink", city: "Luxembourg City", date: addDays(base, 4), time: "14:00", spotsTotal: 30, spotsBooked: 16, guideId: "g3", guideName: "Anna Schmitt", status: "scheduled", price: 95 },
    { tripId: "31876", tripTitle: "Old Town Walking Tour", tripImage: "/images/trips/old-town-walk.jpg", category: "Walking", city: "Luxembourg City", date: addDays(base, 5), time: "10:00", spotsTotal: 15, spotsBooked: 15, guideId: "g1", guideName: "Sophie Martin", status: "full", price: 18 },
    { tripId: "31855", tripTitle: "Moselle Wine Tasting", tripImage: "/images/trips/wine-tasting.jpg", category: "Food & Drink", city: "Remich", date: addDays(base, 7), time: "11:00", spotsTotal: 12, spotsBooked: 3, guideId: "g4", guideName: "Paul Wagner", status: "scheduled", price: 55 },
    { tripId: "31898", tripTitle: "Luxembourg City Train Tour", tripImage: "/images/trips/city-train.jpg", category: "Tours", city: "Luxembourg City", date: addDays(base, 8), time: "09:30", spotsTotal: 20, spotsBooked: 0, guideId: "g2", guideName: "Marc Dubois", status: "scheduled", price: 25 },
    { tripId: "31318", tripTitle: "E-Bike Adventure Mullerthal", tripImage: "/images/trips/ebike-mullerthal.jpg", category: "Adventure", city: "Mullerthal", date: addDays(base, 10), time: "09:00", spotsTotal: 10, spotsBooked: 8, guideId: "g3", guideName: "Anna Schmitt", status: "scheduled", price: 65 },
    { tripId: "31464", tripTitle: "Dinner Hopping Bus", tripImage: "/images/trips/dinner-hopping-gourmet.jpg", category: "Food & Drink", city: "Luxembourg City", date: addDays(base, 11), time: "19:00", spotsTotal: 30, spotsBooked: 10, guideId: "g1", guideName: "Sophie Martin", status: "scheduled", price: 95 },
    { tripId: "31861", tripTitle: "Vianden Castle Day Trip", tripImage: "/images/trips/vianden-castle.jpg", category: "Day Trips", city: "Vianden", date: addDays(base, 14), time: "08:30", spotsTotal: 25, spotsBooked: 5, guideId: "g4", guideName: "Paul Wagner", status: "scheduled", price: 40 },
  ]
  seed.forEach((d, i) => m.set(`dep_${i + 1}`, { ...d, id: `dep_${i + 1}` }))
  return m
}

declare global {
  // eslint-disable-next-line no-var
  var __adminTrips: Map<string, AdminTrip> | undefined
  // eslint-disable-next-line no-var
  var __adminJobs: Map<string, AdminJob> | undefined
  // eslint-disable-next-line no-var
  var __adminApplications: Map<string, JobApplication> | undefined
  // eslint-disable-next-line no-var
  var __adminPosts: Map<string, AdminPost> | undefined
  // eslint-disable-next-line no-var
  var __adminTickets: Map<string, SupportTicket> | undefined
  // eslint-disable-next-line no-var
  var __adminHelp: Map<string, HelpArticle> | undefined
  // eslint-disable-next-line no-var
  var __adminSettings: AdminSettings | undefined
  // eslint-disable-next-line no-var
  var __adminDepartures: Map<string, Departure> | undefined
}

export const departuresStore: Map<string, Departure> = (global.__adminDepartures ??= seedDepartures())
export const tripsStore: Map<string, AdminTrip> = (global.__adminTrips ??= seedStore())
export const ticketsStore: Map<string, SupportTicket> = (global.__adminTickets ??= new Map<string, SupportTicket>())

export const jobsStore: Map<string, AdminJob> = (global.__adminJobs ??= new Map<string, AdminJob>([
  [
    "j1",
    {
      id: "j1",
      title: "Experienced Tour Guide",
      department: "Operations",
      location: "Luxembourg City",
      type: "Freelance",
      description:
        "Join our team of passionate local guides and share the stories of Luxembourg with visitors from around the world.",
      requirements: [
        "Fluency in English plus at least one of French, German, or Luxembourgish",
        "Strong knowledge of Luxembourg history, culture, and gastronomy",
        "Previous guiding or hospitality experience preferred",
      ],
      status: "open",
      createdAt: "2026-01-15",
    },
  ],
  [
    "j2",
    {
      id: "j2",
      title: "Digital Marketing Manager",
      department: "Marketing",
      location: "Luxembourg City (hybrid)",
      type: "Full-time",
      description:
        "Drive awareness and bookings for sightseeing.lu through creative campaigns across SEO, social media, and email.",
      requirements: [
        "3+ years in digital marketing, ideally in travel or e-commerce",
        "Hands-on experience with Google Ads, Meta Ads, and email platforms",
        "Strong analytical skills and comfort with GA4 / Looker",
      ],
      status: "open",
      createdAt: "2026-01-20",
    },
  ],
  [
    "j3",
    {
      id: "j3",
      title: "Full-Stack Developer",
      department: "Technology",
      location: "Remote (Luxembourg-based preferred)",
      type: "Full-time",
      description: "Help us build the best sightseeing discovery and booking platform in Luxembourg.",
      requirements: [
        "Proficiency in TypeScript, React / Next.js, and Node.js",
        "Experience with REST APIs and third-party integrations",
        "Interest in travel, tourism, or local experiences",
      ],
      status: "open",
      createdAt: "2026-02-01",
    },
  ],
]))

export const applicationsStore: Map<string, JobApplication> = (global.__adminApplications ??= new Map<string, JobApplication>())

export const blogStore: Map<string, AdminPost> = (global.__adminPosts ??= new Map<string, AdminPost>([
  [
    "top-10-hidden-gems-luxembourg",
    {
      id: "top-10-hidden-gems-luxembourg",
      slug: "top-10-hidden-gems-luxembourg",
      title: "10 Hidden Gems in Luxembourg You Probably Missed",
      excerpt:
        "Beyond the Grand Ducal Palace and Casemates, Luxembourg is full of secret spots locals love.",
      body: "Full article body goes here. Supports markdown.",
      image: "/images/trips/city-train.jpg",
      author: "Sophie Martin",
      category: "Travel Tips",
      tags: ["hidden gems", "luxembourg", "local tips"],
      status: "published",
      publishedAt: "2026-03-04",
      readTime: "6 min read",
    },
  ],
  [
    "dinner-hopping-guide",
    {
      id: "dinner-hopping-guide",
      slug: "dinner-hopping-guide",
      title: "The Ultimate Guide to Dinner Hopping in Luxembourg",
      excerpt: "What is dinner hopping and why is it Luxembourg's best-kept culinary secret?",
      body: "Full article body goes here. Supports markdown.",
      image: "/images/trips/dinner-hopping-gourmet.jpg",
      author: "Marc Dubois",
      category: "Food & Drink",
      tags: ["food", "dinner hopping", "nightlife"],
      status: "published",
      publishedAt: "2026-02-20",
      readTime: "8 min read",
    },
  ],
]))

function seedHelp(): Map<string, HelpArticle> {
  const now = new Date().toISOString().slice(0, 10)
  const articles: HelpArticle[] = [
    { id: "h_booking_1", question: "How do I book a trip?", answer: "Select your trip, click 'Add to Trip' or 'Book Now', and follow the checkout steps. You will receive a confirmation email once payment is complete.", category: "Booking", status: "published", order: 1, createdAt: now, updatedAt: now },
    { id: "h_booking_2", question: "Can I book for a group?", answer: "Yes! During checkout you can specify the number of participants. For groups of 10 or more, contact info@sightseeing.lu for a tailored quote.", category: "Booking", status: "published", order: 2, createdAt: now, updatedAt: now },
    { id: "h_booking_3", question: "Do I need an account to book?", answer: "No account is required. However, creating one makes it easier to manage bookings and access receipts.", category: "Booking", status: "published", order: 3, createdAt: now, updatedAt: now },
    { id: "h_booking_4", question: "Can I modify my booking after confirming?", answer: "Most bookings can be modified up to 24 hours before the experience. Email info@sightseeing.lu with your booking reference.", category: "Booking", status: "published", order: 4, createdAt: now, updatedAt: now },
    { id: "h_payments_1", question: "What payment methods do you accept?", answer: "We accept all major credit/debit cards (Visa, Mastercard, Amex) and PayPal. Payments are processed securely via our partner Palisis.", category: "Payments", status: "published", order: 1, createdAt: now, updatedAt: now },
    { id: "h_payments_2", question: "Is my payment secure?", answer: "Yes. All transactions are processed via PCI-compliant systems. We never store your card details directly.", category: "Payments", status: "published", order: 2, createdAt: now, updatedAt: now },
    { id: "h_payments_3", question: "When is my card charged?", answer: "Your card is charged immediately upon booking confirmation.", category: "Payments", status: "published", order: 3, createdAt: now, updatedAt: now },
    { id: "h_payments_4", question: "Can I pay in instalments?", answer: "Currently we do not offer instalment plans. Full payment is required at the time of booking.", category: "Payments", status: "published", order: 4, createdAt: now, updatedAt: now },
    { id: "h_cancel_1", question: "What is your cancellation policy?", answer: "Most experiences offer a full refund if cancelled 24+ hours before start time. Cancellations within 24 hours are generally non-refundable. Each listing shows its specific policy.", category: "Cancellation", status: "published", order: 1, createdAt: now, updatedAt: now },
    { id: "h_cancel_2", question: "How do I cancel my booking?", answer: "Email info@sightseeing.lu with your booking reference and reason. We aim to respond within 2 business hours.", category: "Cancellation", status: "published", order: 2, createdAt: now, updatedAt: now },
    { id: "h_cancel_3", question: "How long does a refund take?", answer: "Refunds are processed within 5-10 business days depending on your bank or card provider.", category: "Cancellation", status: "published", order: 3, createdAt: now, updatedAt: now },
    { id: "h_cancel_4", question: "What if the operator cancels?", answer: "You will receive a full refund within 3 business days, or the option to rebook at no extra charge.", category: "Cancellation", status: "published", order: 4, createdAt: now, updatedAt: now },
    { id: "h_access_1", question: "Are experiences wheelchair accessible?", answer: "Accessibility varies by experience. Each listing includes accessibility notes. Contact us for specific advice.", category: "Accessibility", status: "published", order: 1, createdAt: now, updatedAt: now },
    { id: "h_access_2", question: "Are experiences suitable for young children?", answer: "Many are family-friendly. Look for the 'family' tag on listings or contact us for age-specific recommendations.", category: "Accessibility", status: "published", order: 2, createdAt: now, updatedAt: now },
    { id: "h_general_1", question: "Where is sightseeing.lu based?", answer: "We are based in Luxembourg City and our experiences cover the entire Grand Duchy and some cross-border destinations.", category: "General", status: "published", order: 1, createdAt: now, updatedAt: now },
    { id: "h_general_2", question: "How do I contact customer support?", answer: "Email info@sightseeing.lu or use the AI chat on this page. We respond within a few hours, Mon-Sat, 9:00-18:00 CET.", category: "General", status: "published", order: 2, createdAt: now, updatedAt: now },
    { id: "h_general_3", question: "Do you offer gift vouchers?", answer: "Yes! Gift vouchers are available for any amount. Contact info@sightseeing.lu to purchase one.", category: "General", status: "published", order: 3, createdAt: now, updatedAt: now },
  ]
  const m = new Map<string, HelpArticle>()
  for (const a of articles) m.set(a.id, a)
  return m
}

export const helpStore: Map<string, HelpArticle> = (global.__adminHelp ??= seedHelp())

export const settingsStore: AdminSettings = (global.__adminSettings ??= {
  apiKeys: {
    openWeather: process.env.OPENWEATHER_API_KEY ?? "",
    mapbox: process.env.mapbox ?? "",
    anthropic: "",
    openai: "",
    palisis: "",
    googlePlaceId: "",
    googleReviews: process.env.GOOGLE_PLACES_API_KEY ?? "",
    weglot: process.env.NEXT_PUBLIC_WEGLOT_KEY ?? "",
  },
  ai: {
    planner: {
      systemPrompt:
        "You are a friendly Luxembourg sightseeing expert. Help users plan their perfect Luxembourg trip.",
      model: "anthropic/claude-opus-4.6",
      temperature: 0.7,
      maxTokens: 2048,
    },
    chat: {
      systemPrompt:
        "You are a knowledgeable tour assistant for sightseeing.lu. Answer questions about specific tours and experiences.",
      model: "anthropic/claude-opus-4.6",
      temperature: 0.5,
      maxTokens: 1024,
    },
    help: {
      systemPrompt:
        "You are a helpful customer support agent for sightseeing.lu. Answer questions about bookings, payments, and cancellations.",
      model: "anthropic/claude-opus-4.6",
      temperature: 0.3,
      maxTokens: 1024,
    },
  },
  plannerBehavior: {
    // AI Behavior
    model: "anthropic/claude-opus-4.6",
    optimizationPriority: "balanced",
    preferenceWeighting: 70,
    suggestionRandomness: 30,
    localFavoritesBias: 40,
    // Itinerary & Scheduling
    bufferTimeBetweenStops: 30,
    maxStopsPerDay: 6,
    defaultActivityDuration: 90,
    dayStartTime: "09:00",
    dayEndTime: "21:00",
    autoInsertMealBreaks: true,
    lunchBreakTime: "12:30",
    dinnerBreakTime: "19:00",
    mealBreakDuration: 60,
    travelTimeMethod: "public_transport",
  },
  weglot: {
    apiKey: process.env.NEXT_PUBLIC_WEGLOT_KEY ?? "",
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
  },
  header: { customHtml: "" },
  footer: { customHtml: "" },
  pages: {},
})

/* ── CRUD helpers ─────────────────────────────────────────────────── */

// Trips
export function getTrip(id: string) { return tripsStore.get(id) }
export function updateTrip(id: string, data: Partial<AdminTrip>) {
  const existing = tripsStore.get(id)
  if (!existing) return null
  const updated = { ...existing, ...data }
  tripsStore.set(id, updated)
  return updated
}
export function createTrip(data: Omit<AdminTrip, "id">): AdminTrip {
  const id = `trip_${Date.now()}`
  const trip: AdminTrip = { ...data, id }
  tripsStore.set(id, trip)
  return trip
}
export function deleteTrip(id: string) { return tripsStore.delete(id) }
export function listTrips(): AdminTrip[] { return Array.from(tripsStore.values()) }

// Jobs
export function getJob(id: string) { return jobsStore.get(id) }
export function updateJob(id: string, data: Partial<AdminJob>) {
  const existing = jobsStore.get(id)
  if (!existing) return null
  const updated = { ...existing, ...data }
  jobsStore.set(id, updated)
  return updated
}
export function createJob(data: Omit<AdminJob, "id" | "createdAt">): AdminJob {
  const id = `job_${Date.now()}`
  const job: AdminJob = { ...data, id, createdAt: new Date().toISOString().slice(0, 10) }
  jobsStore.set(id, job)
  return job
}
export function deleteJob(id: string) { return jobsStore.delete(id) }
export function listJobs(): AdminJob[] { return Array.from(jobsStore.values()) }

// Job Applications
export function getApplication(id: string) { return applicationsStore.get(id) }
export function createApplication(data: Omit<JobApplication, "id" | "createdAt" | "status">): JobApplication {
  const id = `app_${Date.now()}`
  const application: JobApplication = { ...data, id, status: "new", createdAt: new Date().toISOString() }
  applicationsStore.set(id, application)
  return application
}
export function updateApplication(id: string, data: Partial<JobApplication>) {
  const existing = applicationsStore.get(id)
  if (!existing) return null
  const updated = { ...existing, ...data }
  applicationsStore.set(id, updated)
  return updated
}
export function deleteApplication(id: string) { return applicationsStore.delete(id) }
export function listApplications(): JobApplication[] {
  return Array.from(applicationsStore.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}
export function listApplicationsByJob(jobId: string): JobApplication[] {
  return listApplications().filter(a => a.jobId === jobId)
}

// Blog
export function getPost(id: string) { return blogStore.get(id) }
export function updatePost(id: string, data: Partial<AdminPost>) {
  const existing = blogStore.get(id)
  if (!existing) return null
  const updated = { ...existing, ...data }
  blogStore.set(id, updated)
  return updated
}
export function createPost(data: Omit<AdminPost, "id">): AdminPost {
  const id = data.slug || `post_${Date.now()}`
  const post: AdminPost = { ...data, id }
  blogStore.set(id, post)
  return post
}
export function deletePost(id: string) { return blogStore.delete(id) }
export function listPosts(): AdminPost[] { return Array.from(blogStore.values()) }

// Help articles
export function getHelpArticle(id: string) { return helpStore.get(id) }
export function listHelpArticles(): HelpArticle[] {
  return Array.from(helpStore.values()).sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.order - b.order
  })
}
export function listPublishedHelpArticles(): HelpArticle[] {
  return listHelpArticles().filter((a) => a.status === "published")
}
export function createHelpArticle(data: Omit<HelpArticle, "id" | "createdAt" | "updatedAt">): HelpArticle {
  const id = `h_${Date.now()}`
  const now = new Date().toISOString().slice(0, 10)
  const article: HelpArticle = { ...data, id, createdAt: now, updatedAt: now }
  helpStore.set(id, article)
  return article
}
export function updateHelpArticle(id: string, data: Partial<HelpArticle>) {
  const existing = helpStore.get(id)
  if (!existing) return null
  const updated: HelpArticle = { ...existing, ...data, updatedAt: new Date().toISOString().slice(0, 10) }
  helpStore.set(id, updated)
  return updated
}
export function deleteHelpArticle(id: string) { return helpStore.delete(id) }

// Departures
export function listDepartures(): Departure[] {
  return Array.from(departuresStore.values()).sort((a, b) => {
    const dt = a.date.localeCompare(b.date)
    return dt !== 0 ? dt : a.time.localeCompare(b.time)
  })
}
export function getDeparture(id: string) { return departuresStore.get(id) }
export function createDeparture(data: Omit<Departure, "id">): Departure {
  const id = `dep_${Date.now()}`
  const dep: Departure = { ...data, id }
  departuresStore.set(id, dep)
  return dep
}
export function updateDeparture(id: string, data: Partial<Departure>) {
  const existing = departuresStore.get(id)
  if (!existing) return null
  const updated = { ...existing, ...data }
  departuresStore.set(id, updated)
  return updated
}
export function deleteDeparture(id: string) { return departuresStore.delete(id) }

// Support Tickets
export function getTicket(id: string) { return ticketsStore.get(id) }
export function listTickets(): SupportTicket[] {
  return Array.from(ticketsStore.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}
export function listTicketsByUser(authorId: string): SupportTicket[] {
  return listTickets().filter((t) => t.authorId === authorId)
}
export function createTicket(data: Omit<SupportTicket, "id" | "replies" | "createdAt" | "updatedAt">): SupportTicket {
  const id = `ticket_${Date.now()}`
  const now = new Date().toISOString()
  const ticket: SupportTicket = { ...data, id, replies: [], createdAt: now, updatedAt: now }
  ticketsStore.set(id, ticket)
  return ticket
}
export function updateTicket(id: string, data: Partial<Omit<SupportTicket, "id" | "replies" | "createdAt">>) {
  const existing = ticketsStore.get(id)
  if (!existing) return null
  const updated: SupportTicket = { ...existing, ...data, updatedAt: new Date().toISOString() }
  ticketsStore.set(id, updated)
  return updated
}
export function addTicketReply(ticketId: string, reply: Omit<TicketReply, "id" | "ticketId" | "createdAt">): TicketReply | null {
  const ticket = ticketsStore.get(ticketId)
  if (!ticket) return null
  const replyId = `reply_${Date.now()}`
  const newReply: TicketReply = { ...reply, id: replyId, ticketId, createdAt: new Date().toISOString() }
  ticket.replies.push(newReply)
  ticket.updatedAt = new Date().toISOString()
  ticketsStore.set(ticketId, ticket)
  return newReply
}
export function deleteTicket(id: string) { return ticketsStore.delete(id) }

// Settings
export function getSettings(): AdminSettings { return settingsStore }
export function updateApiKeys(keys: Partial<AdminSettings["apiKeys"]>) {
  Object.assign(settingsStore.apiKeys, keys)
}
export function updateAiSystem(system: string, config: Partial<AdminSettings["ai"][string]>) {
  settingsStore.ai[system] = { ...settingsStore.ai[system], ...config }
}
export function updateWeglot(config: Partial<AdminSettings["weglot"]>) {
  Object.assign(settingsStore.weglot, config)
}
export function updatePlannerBehavior(config: Partial<PlannerBehaviorSettings>) {
  Object.assign(settingsStore.plannerBehavior, config)
}
export function updateHeaderFooter(part: "header" | "footer", html: string) {
  settingsStore[part].customHtml = html
}
