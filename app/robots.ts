import type { MetadataRoute } from "next"
import { isIndexingEnabled } from "@/lib/seo"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export default function robots(): MetadataRoute.Robots {
  /* Staging / Replit-published demo: block every crawler entirely so the
     staging copy can never surface on Google. Indexing is opt-in via the
     ALLOW_INDEXING env var on the live domain only. */
  if (!isIndexingEnabled()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    }
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/planner", "/my-trips"],
      },
      /* Explicitly allow all major AI crawlers */
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Googlebot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
      { userAgent: "cohere-ai", allow: "/" },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
