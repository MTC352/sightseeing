import Link from "next/link"
import Image from "next/image"
import { MapPin, Mail, Phone } from "lucide-react"
import { EditableText } from "@/components/editable-text"

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
    { label: "Checkout", href: "/checkout" },
  ],
  "Support": [
    { label: "Help & FAQ", href: "/help" },
    { label: "Emergency & 24/7 Support", href: "/emergency" },
    { label: "Sitemap", href: "/sitemap.xml" },
    { label: "Terms & Conditions", href: "#" },
    { label: "Privacy Policy", href: "#" },
  ],
}

export function SiteFooter() {
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
                {links.map((l) => (
                  <li key={l.label}><Link href={l.href} className="text-xs text-muted-foreground transition-colors hover:text-primary">{l.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} sightseeing.lu - All rights reserved.
        </div>
      </div>
    </footer>
  )
}
