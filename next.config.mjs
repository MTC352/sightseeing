/** @type {import('next').NextConfig} */
// hero uses plain <img> tag — no next/image restriction applies
const nextConfig = {
  allowedDevOrigins: ["*.picard.replit.dev", "*.replit.dev"],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Keep heavy Node-only packages out of the client/edge bundle
  serverExternalPackages: ["pdfkit", "canvas"],
  // Requests pass through proxy.ts, which otherwise truncates bodies at 10MB.
  // Raise to the upload hard ceiling (HARD_MAX_MB in lib/file-rules.ts) so the
  // configurable per-user/global size rules are actually reachable.
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "media.tacdn.com" },
      { protocol: "https", hostname: "**.tacdn.com" },
      { protocol: "https", hostname: "cdn.tourcms.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_mapbox: process.env.mapbox,
    NEXT_PUBLIC_WEGLOT_KEY: process.env.NEXT_PUBLIC_WEGLOT_KEY,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
}

export default nextConfig
