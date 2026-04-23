import PDFDocument from 'pdfkit'
import fs from 'fs'

// Ensure public directory exists
if (!fs.existsSync('/vercel/share/v0-project/public')) {
  fs.mkdirSync('/vercel/share/v0-project/public', { recursive: true })
}

const doc = new PDFDocument({ margin: 50, size: 'A4' })
doc.pipe(fs.createWriteStream('/vercel/share/v0-project/public/sightseeing-lu-pitch.pdf'))

// Colors
const primaryColor = '#0ea5e9'
const darkGray = '#1f2937'
const mediumGray = '#6b7280'
const lightGray = '#f3f4f6'

// Helper functions
function addHeading(text, size = 20) {
  doc.fontSize(size).fillColor(darkGray).font('Helvetica-Bold').text(text, { align: 'left' })
  doc.moveDown(0.5)
}

function addSubHeading(text) {
  doc.fontSize(14).fillColor(primaryColor).font('Helvetica-Bold').text(text)
  doc.moveDown(0.3)
}

function addParagraph(text) {
  doc.fontSize(10).fillColor(darkGray).font('Helvetica').text(text, { align: 'left', lineGap: 3 })
  doc.moveDown(0.5)
}

function addBullet(text) {
  doc.fontSize(10).fillColor(darkGray).font('Helvetica')
    .text('•  ', { continued: true, indent: 0 })
    .text(text, { indent: 15, lineGap: 2 })
  doc.moveDown(0.2)
}

function addSectionBreak() {
  doc.moveDown(1)
  doc.strokeColor(lightGray).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke()
  doc.moveDown(1)
}

// Title Page
doc.fontSize(32).fillColor(primaryColor).font('Helvetica-Bold').text('sightseeing.lu', { align: 'center' })
doc.moveDown(0.3)
doc.fontSize(16).fillColor(mediumGray).font('Helvetica').text('Product Pitch & Feature Brief', { align: 'center' })
doc.moveDown(2)
doc.fontSize(11).fillColor(darkGray).text('AI-Powered Tourism & Experience Booking Platform', { align: 'center' })
doc.moveDown(0.5)
doc.fontSize(10).fillColor(mediumGray).text('Next.js 16 • React 19 • Vercel AI SDK • OpenAI GPT-4o • Anthropic Claude', { align: 'center' })
doc.moveDown(0.3)
doc.text('Mapbox • OpenWeatherMap • Mobiliteit.lu HAFAS', { align: 'center' })

doc.addPage()

// Executive Pitch
addHeading('Executive Pitch', 24)
addParagraph('sightseeing.lu is not a brochure website. It is a fully operational, AI-native travel commerce platform built for the Luxembourg tourism market — a market that attracts over 1 million overnight visitors per year and tens of thousands of day-trippers crossing from France, Germany, and Belgium daily.')
addParagraph('The platform replaces the static, catalog-style experience that dominates the regional tourism web with a conversational, intelligent assistant that understands the user\'s mood, the current weather, upcoming holidays, group composition, and personal preferences — then recommends, books, plans routes, and upsells in real time.')
addParagraph('It is the product that platforms like Viator, GetYourGuide, and Expedia have spent hundreds of millions building for global markets, delivered here for the specific needs of Luxembourg\'s operators, with full admin control, white-label embeddability, and no vendor lock-in.')

addSectionBreak()

// Core Features
addHeading('Core Feature Set', 22)

addSubHeading('Visitor-Facing Platform')
addBullet('AI Trip Planner — Streaming chat interface powered by Claude/GPT-4o-mini with live weather data, user profiles, cart state, and tool-calling for visual trip cards, itineraries, and real-time recommendations.')
addBullet('Per-Trip AI Concierge — Context-aware assistant on every listing page with full trip details, FAQ, and pricing knowledge.')
addBullet('Smart Itinerary Builder — AI sequences stops geographically, assigns departure times, calculates transit between locations, and suggests car rental/hotels inline.')
addBullet('Live Weather Integration — OpenWeatherMap API feeds current conditions into homepage, planner prompts, and recommendation logic.')
addBullet('Real-Time Departures Board — Urgency-driven display of upcoming bookable slots.')
addBullet('Interactive Mapbox Integration — Geographic exploration with price pins, popups, and secure server-side token management.')
addBullet('Mobiliteit.lu Transit Planner — Official Luxembourg public transport HAFAS widget natively embedded.')
addBullet('Advanced Search & Filter — Full-text search with category, tag, price, duration, and rating filters; URL-based state for shareable results.')
addBullet('Explore Page — Category-driven discovery grid with featured highlights and tag faceting.')
addBullet('Checkout Flow — Complete cart and booking experience.')
addBullet('Blog & Careers — Editorial content management and job board with full CRUD.')
addBullet('ChatGPT Embeddable Widgets — Four widget formats (List, Carousel, Map, Album) for external embedding.')
addBullet('Multilingual Ready — Weglot integration layer for instant translation.')

doc.addPage()

addSubHeading('Admin Backend (PIN-Protected)')
addBullet('Dashboard — KPI overview cards with quick-action shortcuts.')
addBullet('Trip Management — Full CRUD: create, edit (title, description, pricing, category, tags, media), publish/draft toggle, inline optimistic updates.')
addBullet('Blog & Jobs Management — Markdown editor, status control, delete with confirmation.')
addBullet('Visual Page Builder (Craft.js) — Open-source, self-hosted drag-and-drop editor for live site components. Desktop/tablet/mobile previews, undo/redo, layers panel, per-component settings. Zero vendor lock-in.')
addBullet('AI Systems Panel — Edit system prompts, model selection, temperature, max tokens, and tool toggles for all AI agents from the UI.')
addBullet('Integrations Manager — Centralized API key management for Palisis, Mapbox, OpenWeatherMap, Weglot with health indicators.')
addBullet('Palisis Import — One-click catalog import from Palisis booking system.')
addBullet('Taxonomy Manager — Manage categories, tags, and classification hierarchies.')
addBullet('Header/Footer Editor — Visual global navigation management.')

addSectionBreak()

// Technical Architecture
addHeading('Technical Architecture', 22)
doc.fontSize(10).fillColor(darkGray).font('Helvetica')
const techStack = [
  ['Framework', 'Next.js 16 (App Router, Turbopack, React 19)'],
  ['AI Runtime', 'Vercel AI SDK 6 — streaming, tool-calling, structured output'],
  ['LLM Providers', 'OpenAI GPT-4o-mini, Anthropic Claude opus-4.6 (swappable)'],
  ['Mapping', 'Mapbox GL with secure server-side token proxy'],
  ['Weather', 'OpenWeatherMap Current + Forecast API'],
  ['Transit', 'Mobiliteit.lu HAFAS official widget'],
  ['Booking API', 'Palisis integration layer'],
  ['Styling', 'Tailwind CSS v4 + shadcn/ui'],
  ['Page Builder', 'Craft.js (MIT, fully self-hosted)'],
  ['Fonts', 'Instrument Sans (Google Fonts, self-hosted)'],
  ['Deployment', 'Vercel (Edge-ready, ISR, serverless)'],
  ['SEO', 'JSON-LD schema, Open Graph, canonical tags'],
]

techStack.forEach(([key, value]) => {
  doc.font('Helvetica-Bold').text(key + ': ', { continued: true, indent: 0 })
  doc.font('Helvetica').text(value, { indent: 0 })
  doc.moveDown(0.3)
})

doc.addPage()

// Competitive Comparison
addHeading('Competitive Comparison', 22)
addParagraph('Comparison of sightseeing.lu against major platforms:')
doc.moveDown(0.5)

const comparisonTable = [
  ['Platform', 'AI Planning', 'Per-Trip AI', 'Page Builder', 'Transit', 'White-Label', 'Cost'],
  ['sightseeing.lu', 'Yes', 'Yes', 'Yes (Craft.js)', 'Yes (HAFAS)', 'Yes', 'See below'],
  ['GetYourGuide', 'No', 'No', 'No', 'No', 'No', '20–30% revenue share'],
  ['Viator', 'No', 'No', 'No', 'No', 'No', '20–25% revenue share'],
  ['Fareharbor', 'No', 'No', 'Basic', 'No', 'Partial', '$200–800/mo + fees'],
  ['Bokun', 'No', 'No', 'Limited', 'No', 'Partial', '$49–349/mo'],
  ['Regiondo', 'No', 'No', 'Basic', 'No', 'Partial', '€79–499/mo'],
  ['Custom Build', 'Yes', 'Rare', 'Rare', 'Rare', 'Yes', '€80k–250k build'],
]

const colWidths = [100, 60, 60, 70, 60, 60, 90]
let startY = doc.y

comparisonTable.forEach((row, i) => {
  let x = 50
  row.forEach((cell, j) => {
    doc.fontSize(i === 0 ? 9 : 8)
       .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
       .fillColor(i === 0 ? primaryColor : darkGray)
       .text(cell, x, startY, { width: colWidths[j], align: 'left' })
    x += colWidths[j]
  })
  startY += (i === 0 ? 20 : 18)
  doc.y = startY
})

doc.moveDown(1)

addSubHeading('Key Differentiators')
addBullet('vs. Marketplace Platforms (GetYourGuide, Viator): Operator owns customer relationship, pays zero commission, controls full booking flow and data. Marketplaces commoditize operators and charge 20–30% perpetually.')
addBullet('vs. SaaS Booking Tools (Fareharbor, Bokun): AI-native by design, not bolted-on. Planning, recommendations, itinerary building, and upsell are all LLM-driven with live context.')
addBullet('vs. Custom Build: Comparable platform built from scratch would require 6–12 months and €80k–250k in agency costs.')

doc.addPage()

// Commercial Positioning
addHeading('Commercial Positioning', 22)
addParagraph('Suggested pricing packages:')
doc.moveDown(0.5)

const packages = [
  ['Platform License + Setup', 'White-label, configured for client catalog and branding', '€15,000–25,000 one-time'],
  ['Annual Maintenance & Hosting', 'Vercel hosting, dependency updates, AI monitoring', '€3,600–6,000/year'],
  ['AI Prompt Engineering', 'Custom system prompts, tool configuration, persona design', '€2,500–5,000/project'],
  ['Palisis/API Integration', 'Live credentials setup, catalog sync, webhook handling', '€2,000–4,000/project'],
  ['Additional Language Markets', 'Localized content, Weglot setup, regional SEO', '€1,500–3,000/market'],
  ['Custom Feature Development', 'New sections, integrations, or admin tools', '€800–1,200/day'],
]

packages.forEach(([name, desc, price]) => {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text(name)
  doc.fontSize(9).font('Helvetica').fillColor(mediumGray).text(desc)
  doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text(price)
  doc.moveDown(0.5)
})

addSectionBreak()

addSubHeading('Total Cost of Ownership')
addParagraph('3-year TCO: €30,000–50,000 (setup + maintenance)')
addParagraph('vs. Marketplace Commission: €500,000+ cumulative for an operator doing €600k/year at 25% commission')
addParagraph('ROI: Platform pays for itself within 60–90 days of live bookings.')

doc.addPage()

// Summary
addHeading('Summary', 24)
addParagraph('sightseeing.lu is a production-grade, AI-powered tourism commerce platform that gives operators full ownership of their customer relationship, a differentiated booking experience no regional competitor can match, and a technical foundation built on open standards with zero proprietary lock-in.')
addParagraph('It combines the conversion intelligence of a modern e-commerce platform with the personalization capability of a dedicated AI travel agent — available 24/7, in any language, at the cost of API tokens rather than human staff.')
addParagraph('The platform is ready for white-label deployment, integration with existing booking systems, and customization for specific market requirements.')

doc.moveDown(2)
doc.fontSize(12).fillColor(primaryColor).font('Helvetica-Bold').text('Contact Us', { align: 'center' })
doc.fontSize(10).fillColor(darkGray).font('Helvetica').text('For a live demo, custom quote, or technical deep-dive:', { align: 'center' })
doc.fontSize(10).fillColor(mediumGray).text('info@sightseeing.lu', { align: 'center' })

doc.end()

console.log('PDF generated at /vercel/share/v0-project/public/sightseeing-lu-pitch.pdf')
