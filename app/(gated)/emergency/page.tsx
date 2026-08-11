import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import Link from "next/link"
import {
  Phone, Mail, Clock, MessageCircle, AlertTriangle,
  ChevronRight, Shield, HeadphonesIcon, MapPin,
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Emergency & 24/7 Support | sightseeing.lu",
  description:
    "Need urgent help? Reach our 24/7 emergency line or business support team. Contact details, business hours, and quick links for trip-related assistance.",
}

const BUSINESS_HOURS = [
  { day: "Monday", hours: "09:00 – 18:00" },
  { day: "Tuesday", hours: "09:00 – 18:00" },
  { day: "Wednesday", hours: "09:00 – 18:00" },
  { day: "Thursday", hours: "09:00 – 18:00" },
  { day: "Friday", hours: "09:00 – 18:00" },
  { day: "Saturday", hours: "10:00 – 16:00" },
  { day: "Sunday", hours: "Closed" },
]

export default function EmergencyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero — urgent red-tinted banner */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm font-semibold text-destructive">24/7 Emergency Support</p>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-foreground lg:text-4xl">
            Help Center & Emergency Contact
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
            If you are currently on an experience and need immediate assistance, call our
            24/7 emergency line below. For general questions and booking support during
            business hours, use the options further down this page.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">

          {/* Left: contact cards */}
          <div className="flex flex-col gap-5 lg:col-span-2">

            {/* 24/7 Emergency card */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-6">
              <div className="absolute right-4 top-4 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-destructive">
                24 / 7
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">Emergency Helpline</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Available around the clock for urgent situations during an active experience
                — missed pickups, safety concerns, or on-site emergencies.
              </p>
              <a
                href="tel:+14252876321"
                className="mt-5 flex items-center gap-3 rounded-xl bg-destructive px-5 py-4 text-white transition-opacity hover:opacity-90"
              >
                <Phone className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-xs font-medium opacity-80">Call emergency line</p>
                  <p className="text-xl font-bold tracking-wide">+1 425 287 6321</p>
                </div>
              </a>
              <p className="mt-3 text-xs text-muted-foreground">
                International charges may apply depending on your mobile plan.
              </p>
            </div>

            {/* Business phone */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <HeadphonesIcon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">General Support Line</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                For booking changes, cancellations, pre-trip questions, and non-urgent
                enquiries. Available during business hours (CET).
              </p>
              <a
                href="tel:+352123456"
                className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4 text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <Phone className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Call general support</p>
                  <p className="text-xl font-bold">+352 123 456</p>
                </div>
              </a>
            </div>

            {/* Email */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">Email Support</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                For written requests, refund queries, or detailed enquiries. We aim to
                respond within 2 business hours during business hours.
              </p>
              <a
                href="mailto:hello@sightseeing.lu"
                className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4 text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <Mail className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Send us an email</p>
                  <p className="text-lg font-bold">hello@sightseeing.lu</p>
                </div>
              </a>
            </div>

            {/* AI chat tip */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-foreground">
                Get Instant Trip Answers — AI Chat
              </h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                The fastest way to get answers about a specific experience is through
                the per-trip AI chat. Open any trip page and tap{" "}
                <span className="font-semibold text-foreground">"Ask about this trip"</span>{" "}
                to instantly get details about meeting points, what to bring, cancellation
                policies, accessibility, and more — no waiting required.
              </p>
              <Link
                href="/explore"
                className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Browse experiences &amp; open trip chat
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Right: business hours + location */}
          <div className="flex flex-col gap-5">

            {/* Business hours */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Business Hours</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  CET / UTC+1
                </span>
              </div>
              <ul className="mt-4 flex flex-col gap-1">
                {BUSINESS_HOURS.map(({ day, hours }) => {
                  const isClosed = hours === "Closed"
                  return (
                    <li
                      key={day}
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm odd:bg-muted/40"
                    >
                      <span className="font-medium text-foreground">{day}</span>
                      <span className={isClosed ? "text-destructive/70 font-medium" : "text-muted-foreground"}>
                        {hours}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Outside business hours? Our 24/7 emergency line is always available for
                urgent situations, and our AI trip chat is available around the clock.
              </p>
            </div>

            {/* Location */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Our Location</h2>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Luxembourg City, Grand Duchy of Luxembourg
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Experiences operate across the entire Grand Duchy and select
                cross-border destinations.
              </p>
            </div>

            {/* Quick links */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-bold text-foreground">Quick Links</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  { label: "Help & FAQ", href: "/help" },
                  { label: "Browse Experiences", href: "/explore" },
                  { label: "AI Trip Planner", href: "/planner" },
                  { label: "Manage Booking (Palisis)", href: "https://sightseeingluxembourg.palisis.com", external: true },
                ].map(({ label, href, external }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
                    >
                      {label}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
