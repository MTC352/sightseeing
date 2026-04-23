import { NextResponse } from "next/server"

// Inline pitch content as structured data
const PITCH = {
  title: "sightseeing.lu — Product Pitch & Feature Brief",
  subtitle: "AI-Powered Tourism & Experience Booking Platform",
  stack: "Next.js 16 · React 19 · Vercel AI SDK · OpenAI GPT-4o · Anthropic Claude · Mapbox · OpenWeatherMap · Mobiliteit.lu HAFAS",

  pitch: `sightseeing.lu is a fully operational, AI-native travel commerce platform built for the Luxembourg tourism market — a market attracting over 1 million overnight visitors per year. It replaces the static catalog-style experience that dominates regional tourism with a conversational AI assistant that understands the user's mood, current weather, upcoming holidays, group composition, and preferences — then recommends, plans, and upsells in real time. It delivers what platforms like Viator, GetYourGuide, and Expedia have spent hundreds of millions building for global markets, purpose-built for Luxembourg's operators, with full admin control, white-label support, and zero vendor lock-in.`,

  visitorFeatures: [
    ["AI Trip Planner", "Streaming chat powered by Claude/GPT-4o-mini. Uses live weather, user profiles, saved cart, and tool-calling to generate visual trip cards, itineraries, transit plans, and coupons in real time."],
    ["Per-Trip AI Concierge", "Context-aware assistant on every listing page. Knows the full trip details: itinerary, FAQ, pricing, inclusions, group limits, and cancellation policy."],
    ["Smart Itinerary Builder", "AI sequences stops geographically, assigns departure times from 09:00, calculates transit, and suggests car rental and hotels inline with real listing cards."],
    ["Live Weather Integration", "OpenWeatherMap Current + Forecast API feeds homepage widget, planner system prompt, and recommendation logic. Rainy days surface indoor experiences automatically."],
    ["Real-Time Departures Board", "Urgency-driven display of upcoming bookable slots with remaining capacity indicators."],
    ["Interactive Mapbox Integration", "Geographic exploration with price pins, trip popups, and a detail inspector. Secure server-side token proxy prevents key exposure."],
    ["Mobiliteit.lu Transit Planner", "Official Luxembourg public transport HAFAS widget embedded natively for journey planning without leaving the site."],
    ["Advanced Search & Filter", "Full-text search with category, tag, price, duration, and rating filters. URL-based state for shareable results. Mobile filter drawer."],
    ["Checkout Flow", "Complete cart and booking experience for on-platform transactions."],
    ["Blog & Careers", "Editorial content management and job board with full CRUD, markdown support, and SEO metadata."],
    ["ChatGPT Embeddable Widgets", "Four widget formats (List, Carousel, Map, Album) for external ChatGPT plugin embedding."],
    ["Multilingual Ready", "Weglot integration layer built in — re-enable with a new key for instant French, German, and Luxembourgish translation."],
  ],

  adminFeatures: [
    ["Dashboard", "KPI overview for trips, posts, jobs, and integration status with quick-action shortcuts."],
    ["Trip Management", "Full CRUD: create, edit (title, description, pricing, duration, category, tags, highlights, media), publish/draft toggle, delete with confirmation. Inline optimistic UI updates."],
    ["Blog & Jobs Management", "Markdown editor, cover image, status control, delete with confirmation."],
    ["Visual Page Builder (Craft.js)", "Open-source, self-hosted drag-and-drop editor. Site components are draggable onto a canvas. Desktop/tablet/mobile previews, undo/redo, layers panel, per-component settings. No cloud dependency."],
    ["AI Systems Panel", "Edit system prompts, model selection, temperature, max tokens, and tool toggles for all AI agents from the admin UI — no code changes required."],
    ["Integrations Manager", "Centralized API key management for Palisis, Mapbox, OpenWeatherMap, and Weglot with per-integration health indicators."],
    ["Palisis Import", "One-click catalog import from the Palisis booking system API."],
    ["Taxonomy Manager", "Manage trip categories, tags, and classification hierarchies."],
    ["Header/Footer Editor", "Visual management of global navigation and footer links."],
  ],

  techStack: [
    ["Framework", "Next.js 16 (App Router, Turbopack, React 19)"],
    ["AI Runtime", "Vercel AI SDK 6 — streaming, tool-calling, structured output"],
    ["LLM Providers", "OpenAI GPT-4o-mini, Anthropic Claude opus-4.6 (swappable per agent)"],
    ["Mapping", "Mapbox GL with secure server-side token proxy"],
    ["Weather", "OpenWeatherMap Current + Forecast API"],
    ["Transit", "Mobiliteit.lu HAFAS official widget"],
    ["Booking API", "Palisis integration layer (ready for live credentials)"],
    ["Styling", "Tailwind CSS v4 + shadcn/ui component library"],
    ["Page Builder", "Craft.js (MIT license, fully self-hosted)"],
    ["Fonts", "Instrument Sans (Google Fonts, self-hosted via next/font)"],
    ["Deployment", "Vercel (Edge-ready, ISR, serverless API routes)"],
    ["SEO", "JSON-LD schema (Organization, ItemList), Open Graph, canonical tags"],
  ],

  competition: [
    ["Platform", "AI Planning", "Per-Trip AI", "Page Builder", "Transit", "White-Label", "Cost"],
    ["sightseeing.lu", "Yes (streaming)", "Yes", "Yes (Craft.js)", "Yes (HAFAS)", "Yes", "See pricing"],
    ["GetYourGuide", "No", "No", "No", "No", "No (marketplace)", "20–30% rev. share"],
    ["Viator / TripAdvisor", "No", "No", "No", "No", "No (marketplace)", "20–25% rev. share"],
    ["Fareharbor", "No", "No", "Basic", "No", "Partial", "$200–800/mo + fees"],
    ["Bokun", "No", "No", "Limited", "No", "Partial", "$49–349/mo"],
    ["Regiondo", "No", "No", "Basic", "No", "Partial", "€79–499/mo"],
    ["Custom Agency Build", "Yes (typical)", "Rare", "Rare", "Rare", "Yes", "€80,000–250,000"],
  ],

  pricing: [
    ["Platform License + Setup", "White-label deployment, configured for client catalog and branding", "€15,000–25,000 one-time"],
    ["Annual Maintenance & Hosting", "Vercel hosting, dependency updates, AI model monitoring", "€3,600–6,000 / year"],
    ["AI Prompt Engineering", "Custom system prompts, tool config, persona design per agent", "€2,500–5,000 / project"],
    ["Palisis / API Integration", "Live credentials setup, catalog sync, webhook handling", "€2,000–4,000 / project"],
    ["Additional Language Markets", "Localized content, Weglot setup, regional SEO", "€1,500–3,000 / market"],
    ["Custom Feature Development", "New sections, integrations, or admin tools", "€800–1,200 / day"],
  ],

  roi: `3-Year TCO: €30,000–50,000 (setup + maintenance) vs. €500,000+ in cumulative marketplace commission for an operator doing €600,000/year in bookings at 25% GetYourGuide rate. The platform pays for itself within 60–90 days of live bookings.`,

  summary: `sightseeing.lu is a production-grade, AI-powered tourism commerce platform that gives operators full ownership of their customer relationship, a differentiated booking experience no regional competitor can match, and a technical foundation built on open standards with zero proprietary lock-in. It combines the conversion intelligence of a modern e-commerce platform with the personalization capability of a dedicated AI travel agent — available 24/7, in any language, at the cost of API tokens rather than human staff.`,
}

export async function GET() {
  // Build HTML that browsers can print to PDF
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>sightseeing.lu — Pitch Document</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; color: #1f2937; background: #fff; font-size: 13px; line-height: 1.6; }
  .page { max-width: 800px; margin: 0 auto; padding: 48px 40px; }
  .cover { text-align: center; padding: 80px 40px; border-bottom: 3px solid #0ea5e9; margin-bottom: 48px; }
  h1 { font-size: 36px; color: #0ea5e9; font-family: Arial, sans-serif; margin-bottom: 8px; }
  .subtitle { font-size: 16px; color: #6b7280; margin-bottom: 24px; }
  .stack-line { font-size: 11px; color: #9ca3af; }
  h2 { font-size: 22px; color: #1f2937; font-family: Arial, sans-serif; margin: 36px 0 12px; border-bottom: 2px solid #0ea5e9; padding-bottom: 6px; }
  h3 { font-size: 15px; color: #0ea5e9; font-family: Arial, sans-serif; margin: 24px 0 8px; }
  p { margin-bottom: 12px; color: #374151; }
  ul { margin: 8px 0 16px 0; padding: 0; list-style: none; }
  li { display: flex; gap: 8px; margin-bottom: 8px; }
  li::before { content: "•"; color: #0ea5e9; font-weight: bold; flex-shrink: 0; }
  .feature-name { font-weight: bold; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
  th { background: #0ea5e9; color: white; padding: 8px 10px; text-align: left; font-family: Arial, sans-serif; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .highlight-row td { background: #f0f9ff !important; font-weight: bold; }
  .price-col { text-align: right; font-weight: bold; color: #0ea5e9; }
  .roi-box { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px 20px; margin: 20px 0; border-radius: 4px; }
  .summary-box { background: #1f2937; color: white; padding: 24px; border-radius: 8px; margin-top: 32px; }
  .summary-box p { color: #d1d5db; }
  .contact { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #6b7280; }
  @media print {
    body { font-size: 11px; }
    h2 { font-size: 18px; }
    .page { padding: 20px; }
    table { font-size: 10px; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="cover">
    <h1>sightseeing.lu</h1>
    <div class="subtitle">Product Pitch &amp; Feature Brief<br>AI-Powered Tourism &amp; Experience Booking Platform</div>
    <div class="stack-line">${PITCH.stack}</div>
  </div>

  <h2>Executive Pitch</h2>
  <p>${PITCH.pitch}</p>

  <h2>Visitor-Facing Features</h2>
  <ul>
    ${PITCH.visitorFeatures.map(([name, desc]) => `<li><span><span class="feature-name">${name}</span> — ${desc}</span></li>`).join("\n    ")}
  </ul>

  <h2>Admin Backend</h2>
  <ul>
    ${PITCH.adminFeatures.map(([name, desc]) => `<li><span><span class="feature-name">${name}</span> — ${desc}</span></li>`).join("\n    ")}
  </ul>

  <h2>Technical Architecture</h2>
  <table>
    <thead><tr><th>Layer</th><th>Technology</th></tr></thead>
    <tbody>
      ${PITCH.techStack.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`).join("\n      ")}
    </tbody>
  </table>

  <h2>Competitive Comparison</h2>
  <table>
    <thead>
      <tr>${PITCH.competition[0].map(h => `<th>${h}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${PITCH.competition.slice(1).map((row, i) =>
        `<tr class="${i === 0 ? "highlight-row" : ""}">${row.map(c => `<td>${c}</td>`).join("")}</tr>`
      ).join("\n      ")}
    </tbody>
  </table>

  <h3>Key Differentiators</h3>
  <ul>
    <li><span><span class="feature-name">vs. Marketplaces (GetYourGuide, Viator):</span> Operator owns customer relationship and pays zero commission. Marketplaces charge 20–30% perpetually and commoditize operators.</span></li>
    <li><span><span class="feature-name">vs. SaaS Booking Tools (Fareharbor, Bokun):</span> AI-native by design — not bolted on. All planning, recommendations, and upsell are LLM-driven with live context.</span></li>
    <li><span><span class="feature-name">vs. Custom Agency Build:</span> Comparable platform would require 6–12 months and €80k–250k. This is already built and operational.</span></li>
  </ul>

  <h2>Commercial Pricing</h2>
  <table>
    <thead><tr><th>Package</th><th>Scope</th><th style="text-align:right">Price</th></tr></thead>
    <tbody>
      ${PITCH.pricing.map(([name, desc, price]) =>
        `<tr><td><strong>${name}</strong></td><td>${desc}</td><td class="price-col">${price}</td></tr>`
      ).join("\n      ")}
    </tbody>
  </table>

  <div class="roi-box">
    <strong>Return on Investment</strong><br>
    ${PITCH.roi}
  </div>

  <h2>Summary</h2>
  <div class="summary-box">
    <p>${PITCH.summary}</p>
  </div>

  <div class="contact">
    <strong>Contact for a live demo, custom quote, or technical deep-dive</strong><br>
    info@sightseeing.lu
  </div>

</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'inline; filename="sightseeing-lu-pitch.html"',
    },
  })
}
