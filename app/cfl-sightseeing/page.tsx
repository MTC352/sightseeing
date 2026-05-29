import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { CflLogoImage, CflHeroImage } from "./cfl-images"

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sightseeing.lu"

export const metadata: Metadata = {
  title: "CFL Sightseeing — Self-guided Walking Tours",
  description:
    "Your smartphone becomes your travel assistant! Discover different walking routes in Luxembourg with the help of our sightseeing.lu application. Explore Luxembourg City and Diekirch with CFL's free audio-guided walking tours.",
  alternates: { canonical: `${BASE}/cfl-sightseeing` },
  openGraph: {
    title: "CFL Sightseeing — Self-guided Walking Tours",
    description:
      "Discover Luxembourg City and Diekirch with CFL's self-guided audio walking tours.",
    url: `${BASE}/cfl-sightseeing`,
    images: ["/cfl-sightseeing/hero.jpg"],
  },
}

export default function CflSightseeingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        {/* Hero: text on left, image on right */}
        <section className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full">
                <CflLogoImage />
              </div>
              <h1 className="text-3xl font-bold text-foreground lg:text-4xl">
                Self-guided Walking Tours
              </h1>
              <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
                Your smartphone becomes your travel assistant! Discover different
                walking routes in Luxembourg with the help of our sightseeing.lu
                application. You will discover the city of Luxembourg with its
                districts combining modernity and history as well as the city of
                Diekirch.
              </p>
            </div>
            <div className="relative h-64 w-full overflow-hidden rounded-2xl shadow-sm lg:h-80 lg:w-[560px]">
              <CflHeroImage />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <hr className="border-t border-border" />
        </div>

        {/* Audio-guide iframe */}
        <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <iframe
              src="https://cflsightseeingaudioguide.palisis.com/"
              title="CFL Sightseeing Audio Guide"
              className="block h-[80vh] min-h-[640px] w-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="geolocation; autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
