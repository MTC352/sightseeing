"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin, Mail, Phone } from "lucide-react"
import { EditableText } from "@/components/editable-text"
import { CookieSettingsButton } from "@/components/cookie-banner"

const TERMS_LABEL = "Terms & Conditions"

const LINKS = {
  "About sightseeing.lu": [
    { label: "About us", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "#" },
  ],
  "Explore": [
    { label: "All Experiences", href: "/explore" },
    { label: "Departures", href: "/departures" },
    { label: "Search", href: "/search" },
    { label: "Food & Events", href: "/experiences/food-events" },
    { label: "Tours", href: "/experiences/tours" },
    { label: "Sports & Nature", href: "/experiences/sports-nature" },
    { label: "Culture", href: "/experiences/culture" },
    { label: "Private Tours", href: "/experiences/private-tours" },
    { label: "CFL Sightseeing", href: "/cfl-sightseeing" },
  ],
  "Plan Your Trip": [
    { label: "AI Trip Planner", href: "/planner" },
    { label: "Vacation Agregator", href: "/travel" },
    { label: "Flights", href: "/flights" },
    { label: "Trains", href: "/trains" },
    { label: "Cars", href: "/cars" },
    { label: "Hotels", href: "/hotels" },
    { label: "My Trips", href: "/my-trips" },
  ],
  "Support": [
    { label: "Help & FAQ", href: "/help" },
    { label: "Emergency & 24/7 Support", href: "/emergency" },
    { label: "Sitemap", href: "/sitemap.xml" },
    { label: "Terms & Conditions", href: "#" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Legal Notice", href: "/impressum" },
  ],
}

export function SiteFooter() {
  const [termsUrl, setTermsUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/legal-documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active && data) setTermsUrl(data.termsOfService ?? null) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div>
            <Image src="/images/logo.png" alt="sightseeing.lu" width={140} height={32} className="h-7 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              <EditableText id="footer:brand:tagline" defaultValue="Handpicked experiences in and around Luxembourg, guided by passionate locals." multiline />
            </p>
            <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> <EditableText id="footer:contact:address" defaultValue="Luxembourg City" /></span>
              <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> <EditableText id="footer:contact:email" defaultValue="info@sightseeing.lu" /></span>
              <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> <EditableText id="footer:contact:phone" defaultValue="+352 123 456" /></span>
            </div>
          </div>
          {/* Link columns */}
          {Object.entries(LINKS).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              <ul className="mt-3 flex flex-col gap-2">
                {links.map((l) => {
                  if (l.label === TERMS_LABEL && termsUrl) {
                    return (
                      <li key={l.label}>
                        <a href={termsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground transition-colors hover:text-primary">{l.label}</a>
                      </li>
                    )
                  }
                  return <li key={l.label}><Link href={l.href} className="text-xs text-muted-foreground transition-colors hover:text-primary">{l.label}</Link></li>
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} sightseeing.lu S.à r.l. — All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              <Link href="/privacy" className="text-xs text-muted-foreground transition-colors hover:text-primary">Privacy Policy</Link>
              <Link href="/impressum" className="text-xs text-muted-foreground transition-colors hover:text-primary">Legal Notice</Link>
              <CookieSettingsButton />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
