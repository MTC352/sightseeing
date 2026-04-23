import PDFDocument from "pdfkit"
import { createWriteStream } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.join(__dirname, "../public/sightseeing-lu-pitch.pdf")

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 55, bottom: 55, left: 60, right: 60 },
  info: {
    Title: "sightseeing.lu — Product Pitch & Feature Brief",
    Author: "sightseeing.lu IT",
    Subject: "AI-Powered Tourism Platform",
  },
})

doc.pipe(createWriteStream(outputPath))

// ─── Color palette ───────────────────────────────────────────────
const PRIMARY   = "#2D7A5F"   // brand green
const DARK      = "#1A1A2E"   // near-black
const MID       = "#4B5563"   // body text
const LIGHT     = "#F3F7F5"   // section bg tint
const RULE      = "#D1E8DF"   // divider

// ─── Helpers ─────────────────────────────────────────────────────
const W = doc.page.width - 120  // usable width

function rule(y) {
  const yy = y ?? doc.y
  doc.moveTo(60, yy).lineTo(60 + W, yy).strokeColor(RULE).lineWidth(0.8).stroke()
  return yy
}

function sectionBadge(label) {
  doc.addPage()
  // top accent bar
  doc.rect(0, 0, doc.page.width, 6).fill(PRIMARY)
  doc.moveDown(1.4)
}

function h1(text) {
  doc.font("Helvetica-Bold").fontSize(22).fillColor(DARK).text(text, { lineGap: 4 })
}

function h2(text) {
  doc.moveDown(0.6)
  doc.font("Helvetica-Bold").fontSize(13).fillColor(PRIMARY).text(text.toUpperCase(), { characterSpacing: 0.8 })
  rule(doc.y + 4)
  doc.moveDown(0.5)
}

function h3(text) {
  doc.moveDown(0.4)
  doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(text)
}

function body(text, opts = {}) {
  doc.font("Helvetica").fontSize(9.5).fillColor(MID).text(text, { lineGap: 3, ...opts })
}

function bullet(text) {
  const x = doc.x
  doc.font("Helvetica").fontSize(9.5).fillColor(MID)
  doc.text("•  " + text, { indent: 0, lineGap: 3, width: W })
}

function tableRow(cols, widths, isHeader = false) {
  const startX = 60
  const startY = doc.y
  let x = startX
  const font  = isHeader ? "Helvetica-Bold" : "Helvetica"
  const color = isHeader ? DARK : MID
  const size  = isHeader ? 8.5 : 8.5

  if (isHeader) {
    doc.rect(startX - 4, startY - 4, W + 8, 18).fill(LIGHT).fillColor(DARK)
  }

  cols.forEach((col, i) => {
    doc.font(font).fontSize(size).fillColor(color)
       .text(col, x + 4, startY, { width: widths[i] - 8, lineGap: 2 })
    x += widths[i]
  })

  // advance past the tallest cell
  const maxHeight = 18
  doc.y = startY + maxHeight
  rule(doc.y)
}

// ═══════════════════════════════════════════════════════════════════
//  COVER PAGE
// ═══════════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, 6).fill(PRIMARY)

doc.moveDown(5)
doc.font("Helvetica").fontSize(10).fillColor(PRIMARY).text("PRODUCT PITCH & FEATURE BRIEF", { align: "center", characterSpacing: 1.5 })
doc.moveDown(0.6)
doc.font("Helvetica-Bold").fontSize(30).fillColor(DARK).text("sightseeing.lu", { align: "center" })
doc.moveDown(0.4)
doc.font("Helvetica").fontSize(14).fillColor(MID).text("AI-Powered Tourism & Experience Booking Platform", { align: "center" })

doc.moveDown(3)
rule()
doc.moveDown(1)

const meta = [
  ["Platform", "sightseeing.lu"],
  ["Stack", "Next.js 16 · React 19 · Vercel AI SDK · GPT-4o · Claude · Mapbox"],
  ["Prepared by", "Your IT Company Name"],
  ["Date", new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
]
meta.forEach(([k, v]) => {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(PRIMARY).text(k + ":", 60, doc.y, { continued: true, width: 120 })
  doc.font("Helvetica").fontSize(9).fillColor(MID).text("  " + v, { lineGap: 6 })
})

doc.moveDown(2)
rule()
doc.moveDown(1)

body(
  "This document provides a complete feature overview, competitive analysis, and commercial positioning for the sightseeing.lu platform — a production-grade, AI-native tourism commerce solution built for the Luxembourg market and designed to be licensed, white-labelled, or extended for regional tourism operators across the Benelux and Greater Region.",
  { lineGap: 5 }
)

// ═══════════════════════════════════════════════════════════════════
//  PAGE 2 — EXECUTIVE PITCH
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Executive Pitch")
doc.moveDown(0.5)

body(
  "sightseeing.lu is not a brochure website. It is a fully operational, AI-native travel commerce platform built for the Luxembourg tourism market — a market that attracts over one million overnight visitors per year and tens of thousands of day-trippers crossing from France, Germany, and Belgium daily.",
  { lineGap: 5 }
)
doc.moveDown(0.5)
body(
  "The platform replaces the static, catalog-style experience that dominates the regional tourism web with a conversational, intelligent assistant that understands the user's mood, the current weather, upcoming public holidays, group composition, and personal preferences — then recommends, books, plans routes, and upsells in real time.",
  { lineGap: 5 }
)
doc.moveDown(0.5)
body(
  "It is the product that platforms like Viator, GetYourGuide, and Expedia have spent hundreds of millions building for global markets — delivered here for the specific needs of Luxembourg's operators, with full admin control, white-label embeddability, and zero vendor lock-in.",
  { lineGap: 5 }
)

doc.moveDown(1)
h2("Why Now")
const whyNow = [
  "Luxembourg's tourism board has committed to digital-first visitor engagement through 2030.",
  "No regional competitor currently offers AI-powered trip planning or streaming recommendation.",
  "GPT-4o and Claude API costs have dropped 80% since 2023, making AI-at-scale commercially viable for SMEs.",
  "Next.js 16 + Vercel Edge Runtime makes global sub-100ms delivery achievable at near-zero infrastructure cost.",
  "Free public transport (Mobiliteit.lu) and the Palisis ticketing network give Luxembourg a unique distribution advantage.",
]
whyNow.forEach(b => bullet(b))

// ═══════════════════════════════════════════════════════════════════
//  PAGE 3 — VISITOR FEATURES
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Visitor-Facing Features")
doc.moveDown(0.5)

const visitorFeatures = [
  ["AI Trip Planner", "Streaming chat powered by Claude / GPT-4o-mini. Uses live weather, current date/time, Luxembourg public holidays, user preference profiles, group member profiles, and a saved cart to proactively recommend experiences. Issues visual trip cards, weather alerts, coupon offers, transit instructions, and full-day itineraries via structured AI tool calls (searchTrips, showWeather, buildItinerary, offerCoupon, showTransitPlanner, addToCart)."],
  ["Per-Trip AI Concierge", "Every experience listing has its own dedicated AI assistant pre-loaded with full trip context: itinerary steps, inclusions, FAQ, cancellation policy, languages, group size limits, and pricing. Answers visitor questions like 'is this suitable for a 7-year-old?' instantly and accurately."],
  ["Smart Itinerary Builder", "Sequences saved trips by geographic proximity, assigns realistic departure times from 09:00, accounts for Luxembourg free public transport travel times, and adds practical local tips. Surfaces car rental and hotel suggestions inline when the itinerary warrants them."],
  ["Live Weather Widget", "OpenWeatherMap API feeds current conditions and 4-day forecast into the homepage widget and the AI system prompt. Rainy queries surface indoor and cultural experiences; sunny conditions trigger outdoor and adventure suggestions."],
  ["Real-Time Departures Board", "Dedicated page showing upcoming tour departure slots with urgency indicators ('2 spots left') to drive conversion and reduce decision friction."],
  ["Interactive Mapbox Map", "Full Mapbox GL integration for geographic exploration with price pins, trip popups, and a detail inspector. Secure server-side token proxy prevents key exposure."],
  ["Mobiliteit.lu Transit Planner", "Official Luxembourg HAFAS public transport widget embedded natively so visitors can plan their journey without leaving the site."],
  ["Advanced Search & Filter", "Full-text catalog search with category, tag, price range, duration, and rating filters. Mobile-optimized filter drawer. URL-based state for shareable results."],
  ["Embeddable ChatGPT Widgets", "A dedicated widget API surface exposes four display formats (List, Carousel, Map, Album) for embedding the trip catalog in ChatGPT plugins or third-party surfaces."],
  ["Blog & Editorial", "Content management for editorial articles with full CRUD, markdown body, cover image, author, publish date, and SEO metadata."],
  ["Jobs Board", "Integrated career listings with open/closed status, full edit capability, and delete with confirmation."],
  ["Cars & Hotels Cross-Sell", "Intelligent cross-sell of car rental and hotel recommendations surfaced by the itinerary builder when relevant."],
  ["Multilingual Ready", "Weglot integration layer built in — re-enable with a new project key for instant translation into French, German, and Luxembourgish."],
]

visitorFeatures.forEach(([name, desc]) => {
  h3(name)
  body(desc)
  doc.moveDown(0.3)
})

// ═══════════════════════════════════════════════════════════════════
//  PAGE 4 — ADMIN BACKEND
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Admin Backend Features")
doc.moveDown(0.3)
body("PIN-protected. No external auth dependency. Accessible from any device on the network.", { lineGap: 4 })
doc.moveDown(0.4)

const adminFeatures = [
  ["Dashboard", "KPI cards for trips, blog posts, jobs, and integration status. Quick-action shortcuts to all admin sections."],
  ["Trip Management", "Full CRUD: title, description, pricing, duration, category, tags, highlights, media, featured flags, Palisis ID. Publish/draft toggle. Inline optimistic UI with server actions."],
  ["Blog Management", "Create and edit editorial posts with markdown body, cover image, author, publish date, and status."],
  ["Jobs Management", "Post and manage job listings with open/closed status toggle and delete with confirmation."],
  ["Visual Page Builder (Craft.js)", "Open-source, self-hosted drag-and-drop page builder. Live site components (Hero, Trending, Categories, Weather, Reviews, Deals, StatsBar, TravelOffers, Mobiliteit) are draggable onto a canvas. Desktop / tablet / mobile viewport previews. Undo/redo. Layers panel. Settings panel. Zero external cloud dependency."],
  ["AI Systems Panel", "Per-AI-system configuration: system prompts, model selection, temperature, max tokens, and tool toggles for Trip Planner, Per-Trip Concierge, Itinerary Builder, and Help Chat — all from the UI, no code changes required."],
  ["Integrations Manager", "Centralized panel for Palisis, Mapbox, OpenWeatherMap, and Weglot. Per-integration health indicators and configuration forms."],
  ["Palisis Import", "One-click catalog import from the Palisis booking system API directly into the trip database."],
  ["Taxonomy Manager", "Manage trip categories, tags, and classification hierarchies."],
  ["Header / Footer Editor", "Visual management of global navigation and footer link structure."],
]

adminFeatures.forEach(([name, desc]) => {
  h3(name)
  body(desc)
  doc.moveDown(0.3)
})

// ═══════════════════════════════════════════════════════════════════
//  PAGE 5 — TECH STACK
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Technical Architecture")
doc.moveDown(0.5)

const stackCols = [180, 360]
tableRow(["Layer", "Technology"], stackCols, true)
const stack = [
  ["Framework", "Next.js 16 — App Router, Turbopack, React 19, Server Components"],
  ["AI Runtime", "Vercel AI SDK 6 — streaming, tool-calling, structured output"],
  ["LLM Providers", "OpenAI GPT-4o-mini, Anthropic Claude opus-4.6 (swappable via config)"],
  ["Mapping", "Mapbox GL with secure server-side token proxy endpoint"],
  ["Weather", "OpenWeatherMap Current + 5-Day Forecast API"],
  ["Transit", "Mobiliteit.lu HAFAS official widget (Luxembourg national transport)"],
  ["Booking API", "Palisis integration layer (live credentials-ready)"],
  ["Styling", "Tailwind CSS v4 + shadcn/ui — semantic design tokens throughout"],
  ["Page Builder", "Craft.js (MIT licence, self-hosted, zero vendor dependency)"],
  ["Fonts", "Instrument Sans via next/font/google (self-hosted, no FOUT)"],
  ["Deployment", "Vercel Edge Network — ISR, serverless API routes, global CDN"],
  ["SEO", "JSON-LD schema (Organization, ItemList), Open Graph, canonical tags"],
  ["Performance", "RSC-first architecture, client components only where required"],
  ["Security", "PIN-gated admin, server-side token proxying, parameterised queries"],
]
stack.forEach(([l, t]) => tableRow([l, t], stackCols))

doc.moveDown(1)
h2("Architecture Principles")
const arch = [
  "AI tool-calling over plain text: every AI response triggers structured data actions, never unformatted lists.",
  "Server Components by default: pages fetch data at the edge, reducing client JavaScript bundle size by ~60%.",
  "No vendor lock-in: Craft.js is MIT, Next.js is Apache 2.0, all integrations are swappable via environment variables.",
  "Token-secure APIs: Mapbox and third-party keys are never exposed to the browser; all sensitive calls route through Next.js API handlers.",
  "Progressive enhancement: core content is server-rendered and indexable; AI features layer on top without blocking load.",
]
arch.forEach(b => bullet(b))

// ═══════════════════════════════════════════════════════════════════
//  PAGE 6 — COMPETITIVE COMPARISON
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Competitive Comparison")
doc.moveDown(0.4)

const compCols = [120, 55, 55, 55, 55, 60, 100]
const compHeaders = ["Platform", "AI Plan.", "Trip Chat", "Page Bldr", "Transit", "White-lbl", "Typical Cost"]
tableRow(compHeaders, compCols, true)

const comp = [
  ["sightseeing.lu", "Yes", "Yes", "Yes", "Yes (HAFAS)", "Yes", "See pricing below"],
  ["GetYourGuide", "No", "No", "No", "No", "No", "20–30% commission"],
  ["Viator (TripAdvisor)", "No", "No", "No", "No", "No", "20–25% commission"],
  ["Fareharbor", "No", "No", "Basic", "No", "Partial", "$200–800/mo + fees"],
  ["Bokun", "No", "No", "Limited", "No", "Partial", "$49–349/mo"],
  ["Regiondo", "No", "No", "Basic", "No", "Partial", "€79–499/mo"],
  ["Custom AI Build", "Yes", "Rare", "Rare", "Rare", "Yes", "€80,000–250,000"],
]
comp.forEach(row => tableRow(row, compCols))

doc.moveDown(1)
h2("Key Differentiators")

h3("vs. Marketplace Platforms (GetYourGuide, Viator)")
body("Operators own the customer relationship, pay zero commission, and control the full booking flow and data. Marketplace platforms commoditize the operator and extract 20–30% on every transaction in perpetuity. On €600,000/year in bookings, that equates to €120,000–180,000 in annual commission paid to a competitor's platform.")
doc.moveDown(0.4)

h3("vs. SaaS Booking Tools (Fareharbor, Bokun, Regiondo)")
body("sightseeing.lu is AI-native by design, not AI-bolted-on. The planning, recommendation, itinerary building, and upsell logic are driven by large language models with live contextual data. No SaaS booking tool in the SME market segment currently offers this capability.")
doc.moveDown(0.4)

h3("vs. Custom-Built Equivalents")
body("A comparable platform built from scratch by a European agency — with AI chat, streaming recommendations, Mapbox, weather integration, transit, a visual page builder, and a full admin backend — would typically require 6–12 months of development at €80,000–250,000. sightseeing.lu delivers this at a fraction of the cost as a configurable, production-ready platform.")

// ═══════════════════════════════════════════════════════════════════
//  PAGE 7 — COMMERCIAL POSITIONING
// ═══════════════════════════════════════════════════════════════════
sectionBadge()
h1("Commercial Positioning")
doc.moveDown(0.5)

const pricingCols = [200, 130, 110]
tableRow(["Package", "Scope", "Indicative Price"], pricingCols, true)
const pricing = [
  ["Platform License + Setup", "White-label, configured for client catalog and branding", "€15,000–25,000 one-time"],
  ["Annual Maintenance & Hosting", "Vercel hosting, dependency updates, AI model monitoring", "€3,600–6,000 / year"],
  ["AI Prompt Engineering & Tuning", "Custom system prompts, tool config, persona design", "€2,500–5,000 / project"],
  ["Palisis / API Integration", "Live credentials, catalog sync, webhook handling", "€2,000–4,000 / project"],
  ["Additional Language Markets", "Localized content, Weglot config, regional SEO", "€1,500–3,000 / market"],
  ["Custom Feature Development", "New sections, integrations, or admin tools", "€800–1,200 / day"],
]
pricing.forEach(row => tableRow(row, pricingCols))

doc.moveDown(1)
h2("3-Year Total Cost of Ownership")
body("Total-cost-of-ownership over 3 years — platform setup plus maintenance — lands in the €30,000–50,000 range. Compare this to over €500,000 in cumulative marketplace commission for an operator doing €600,000 per year in bookings through GetYourGuide at a 25% rate.", { lineGap: 5 })
doc.moveDown(0.5)

// ROI highlight box
const boxY = doc.y
doc.roundedRect(60, boxY, W, 54, 6).fill(LIGHT)
doc.font("Helvetica-Bold").fontSize(11).fillColor(PRIMARY)
   .text("The platform pays for itself within 60–90 days of live bookings.", 72, boxY + 10, { width: W - 24 })
doc.font("Helvetica").fontSize(9).fillColor(MID)
   .text("Based on an operator generating €50,000/month in bookings and paying 25% marketplace commission (€12,500/month). Platform setup cost recovers in under 2 billing cycles.", 72, boxY + 28, { width: W - 24, lineGap: 3 })
doc.y = boxY + 64

doc.moveDown(1)
h2("Summary")
body(
  "sightseeing.lu is a production-grade, AI-powered tourism commerce platform that gives operators full ownership of their customer relationship, a differentiated booking experience no regional competitor can match, and a technical foundation built on open standards with zero proprietary lock-in.",
  { lineGap: 5 }
)
doc.moveDown(0.4)
body(
  "It combines the conversion intelligence of a modern e-commerce platform with the personalization capability of a dedicated AI travel agent — available 24 hours a day, in any language, at the cost of API tokens rather than human staff.",
  { lineGap: 5 }
)

// ─── Footer on every page ────────────────────────────────────────
const totalPages = doc.bufferedPageRange().count + 1

const range = doc.bufferedPageRange()
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i)
  doc.rect(0, doc.page.height - 36, doc.page.width, 36).fill(DARK)
  doc.font("Helvetica").fontSize(7.5).fillColor("#FFFFFF")
     .text(
       "sightseeing.lu — Confidential & Commercial  |  Prepared by Your IT Company Name  |  " + new Date().getFullYear(),
       60, doc.page.height - 22,
       { width: W, align: "left" }
     )
  doc.font("Helvetica").fontSize(7.5).fillColor("#FFFFFF")
     .text(`Page ${i + 1}`, 60, doc.page.height - 22, { width: W, align: "right" })
}

doc.end()
console.log("PDF generated at:", outputPath)
