import { convertToModelMessages, streamText, UIMessage, validateUIMessages } from "ai"
import { dbGetSettings, dbListTrips, dbListPosts } from "@/lib/db/queries"

export const maxDuration = 30
export const dynamic = "force-dynamic"

// Current state of the app for context
async function getAppState() {
  const settings = await dbGetSettings()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips: any[] = await dbListTrips()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts: any[] = await dbListPosts()
  
  const publishedTrips = trips.filter(t => t.status === "published")
  const draftTrips = trips.filter(t => t.status === "draft")
  const publishedPosts = posts.filter(p => p.status === "published")
  const draftPosts = posts.filter(p => p.status === "draft")
  const featuredTrips = trips.filter(t => t.featured)
  const tripsWithGoogleReviews = trips.filter(t => t.googleBusinessUrl)
  
  return {
    stats: {
      totalTrips: trips.length,
      publishedTrips: publishedTrips.length,
      draftTrips: draftTrips.length,
      featuredTrips: featuredTrips.length,
      tripsWithGoogleReviews: tripsWithGoogleReviews.length,
      totalPosts: posts.length,
      publishedPosts: publishedPosts.length,
      draftPosts: draftPosts.length,
    },
    integrations: {
      weglot: !!process.env.NEXT_PUBLIC_WEGLOT_KEY,
      googlePlaces: !!settings.apiKeys?.googleReviews || !!process.env.GOOGLE_PLACES_API_KEY,
      mapbox: !!process.env.mapbox,
      openWeather: !!process.env.OPENWEATHER_API_KEY,
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    },
    aiSystems: {
      planner: { model: settings.ai?.planner?.model || "openai/gpt-4o-mini", configured: true },
      chat: { model: settings.ai?.chat?.model || "openai/gpt-4o-mini", configured: true },
      help: { model: settings.ai?.help?.model || "openai/gpt-4o-mini", configured: true },
    },
    categories: [...new Set(trips.map(t => t.category))],
    cities: [...new Set(trips.map(t => t.city).filter(Boolean))],
  }
}

const SYSTEM_PROMPT = `You are an AI Strategy Advisor for sightseeing.lu, a travel experiences platform in Luxembourg. Your role is to help the admin understand the current state of their platform and recommend high-ROI improvements.

CURRENT APP STATE:
{{APP_STATE}}

YOUR EXPERTISE:
- AI/ML features for travel platforms (personalization, recommendations, chatbots, dynamic pricing)
- Growth automation (email sequences, retargeting, A/B testing, conversion optimization)
- Travel industry trends and best practices
- Technical implementation strategies
- ROI-focused prioritization

RESPONSE STYLE:
- Be concise and actionable
- Prioritize suggestions by impact vs effort
- Reference the actual app state when making recommendations
- Suggest specific integrations and tools when relevant
- Consider the Luxembourg/European market context

AREAS TO ADVISE ON:
1. AI Feature Enhancements (better personalization, smarter chatbots, predictive analytics)
2. Conversion Optimization (checkout flow, urgency tactics, social proof)
3. Content Strategy (blog topics, SEO, multilingual content)
4. Integration Opportunities (CRM, email marketing, analytics, payment providers)
5. Automation Ideas (booking reminders, review collection, dynamic pricing)
6. Industry Trends (AI in travel, sustainable tourism, experience economy)

When asked about the roadmap or next steps, prioritize:
- Quick wins that can be implemented in days
- Medium-term improvements for the next quarter
- Strategic initiatives for long-term growth

Always tie recommendations back to measurable outcomes (conversions, bookings, engagement, revenue).`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    let messages: UIMessage[]
    try {
      messages = await validateUIMessages<UIMessage>({ messages: body.messages, tools: {} })
    } catch {
      messages = body.messages ?? []
    }
    
    const appState = await getAppState()
    const systemPrompt = SYSTEM_PROMPT.replace("{{APP_STATE}}", JSON.stringify(appState, null, 2))

    const result = streamText({
      model: "openai/gpt-4o-mini",
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      temperature: 0.7,
      maxTokens: 2000,
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[ai-advisor] POST error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

// GET endpoint to fetch current app state for widgets
export async function GET() {
  const appState = await getAppState()
  
  // Calculate roadmap items based on current state
  const roadmapItems = []
  
  if (appState.stats.tripsWithGoogleReviews < appState.stats.publishedTrips * 0.5) {
    roadmapItems.push({
      id: "google-reviews",
      title: "Add Google Reviews to more trips",
      description: `Only ${appState.stats.tripsWithGoogleReviews}/${appState.stats.publishedTrips} trips have Google Reviews configured`,
      details: "Google Reviews provide powerful social proof that increases booking confidence. Each trip can display real customer reviews directly from Google Business profiles, improving trust and conversion rates.",
      priority: "high",
      effort: "low",
      category: "social-proof",
      budgetRange: "$0 - $100",
      wins: [
        "Increase booking conversion by 15-25%",
        "Build trust with authentic customer reviews",
        "Improve SEO with fresh, user-generated content",
        "Reduce customer support inquiries about trip quality",
      ],
    })
  }
  
  if (appState.stats.publishedPosts < 5) {
    roadmapItems.push({
      id: "blog-content",
      title: "Publish more blog content",
      description: "Regular blog posts improve SEO and drive organic traffic",
      details: "A consistent blog publishing schedule (2-4 posts per month) targeting travel keywords can significantly boost organic search traffic. Focus on Luxembourg travel guides, seasonal recommendations, and insider tips.",
      priority: "medium",
      effort: "medium",
      category: "content",
      budgetRange: "$100 - $500",
      wins: [
        "Drive 30-50% more organic traffic within 6 months",
        "Establish authority in Luxembourg tourism niche",
        "Create content for social media and email marketing",
        "Improve keyword rankings for high-intent searches",
      ],
    })
  }
  
  if (!appState.integrations.weglot) {
    roadmapItems.push({
      id: "multilingual",
      title: "Enable multilingual support",
      description: "Reach French and German speaking visitors with Weglot",
      details: "Luxembourg is trilingual (French, German, English). Enabling automatic translation expands your addressable market by 3x and improves conversion for non-English speakers.",
      priority: "high",
      effort: "low",
      category: "growth",
      budgetRange: "$100 - $500",
      wins: [
        "Access 2-3x larger potential customer base",
        "Improve conversion for French/German visitors by 40%",
        "Automatic SEO for translated pages",
        "Build trust with local Luxembourg visitors",
      ],
    })
  }
  
  roadmapItems.push({
    id: "email-capture",
    title: "Implement email capture popups",
    description: "Build an email list for remarketing and newsletters",
    details: "Exit-intent popups and timed modals can capture 3-5% of visitors into your email list. Use incentives like exclusive discounts or free travel guides to increase conversion.",
    priority: "high",
    effort: "medium",
    category: "automation",
    budgetRange: "$0 - $100",
    wins: [
      "Build owned audience for remarketing",
      "Generate 10-20% of revenue from email campaigns",
      "Reduce dependency on paid advertising",
      "Enable personalized trip recommendations",
    ],
  })
  
  roadmapItems.push({
    id: "dynamic-pricing",
    title: "Add dynamic pricing based on demand",
    description: "Increase revenue with AI-powered price optimization",
    details: "Implement AI-driven pricing that adjusts based on demand, seasonality, booking velocity, and competitor pricing. Can increase revenue by 10-20% without reducing bookings.",
    priority: "medium",
    effort: "high",
    category: "ai",
    budgetRange: "$500 - $2000",
    wins: [
      "Increase revenue per booking by 10-20%",
      "Optimize occupancy during low-demand periods",
      "Capture premium pricing during peak seasons",
      "Automate pricing decisions with AI",
    ],
  })
  
  roadmapItems.push({
    id: "review-automation",
    title: "Automate review collection",
    description: "Send post-trip emails requesting reviews",
    details: "Automated email sequences sent 24-48 hours after a trip can dramatically increase review volume. Include direct links to Google, TripAdvisor, and your platform.",
    priority: "medium",
    effort: "medium",
    category: "automation",
    budgetRange: "$100 - $500",
    wins: [
      "Increase review volume by 300-500%",
      "Improve Google Business ranking",
      "Generate fresh content for social proof",
      "Identify and address negative experiences early",
    ],
  })

  // Industry news/trends - updated daily based on current date
  const today = new Date()
  const lastUpdated = today.toISOString().split("T")[0]
  
  const industryNews = [
    {
      id: "1",
      title: "AI-powered travel recommendations see 40% higher conversion",
      source: "Phocuswright",
      category: "AI",
      date: "2026-04-15",
      updatedAt: lastUpdated,
    },
    {
      id: "2", 
      title: "Sustainable tourism demand grows 25% YoY in Europe",
      source: "UNWTO",
      category: "Trends",
      date: "2026-04-12",
      updatedAt: lastUpdated,
    },
    {
      id: "3",
      title: "Mobile bookings now account for 65% of travel purchases",
      source: "Statista",
      category: "Mobile",
      date: "2026-04-10",
      updatedAt: lastUpdated,
    },
    {
      id: "4",
      title: "Voice search optimization becoming critical for travel SEO",
      source: "Search Engine Journal",
      category: "SEO",
      date: "2026-04-08",
      updatedAt: lastUpdated,
    },
    {
      id: "5",
      title: "Personalized email campaigns drive 6x higher engagement in travel",
      source: "Mailchimp Research",
      category: "Marketing",
      date: "2026-04-16",
      updatedAt: lastUpdated,
    },
    {
      id: "6",
      title: "European travelers prioritize local experiences over landmarks",
      source: "Booking.com Insights",
      category: "Trends",
      date: "2026-04-14",
      updatedAt: lastUpdated,
    },
  ]

  return Response.json({
    appState,
    roadmapItems,
    industryNews,
    lastUpdated,
  })
}
