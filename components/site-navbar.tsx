"use client"

import { useState, useEffect, useContext } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X, ShoppingBag, Search, Globe } from "lucide-react"
import { CartContext } from "@/lib/cart-context"

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 10.5651C3 9.9907 3 9.70352 3.07403 9.43905C3.1396 9.20478 3.24737 8.98444 3.39203 8.78886C3.55534 8.56806 3.78202 8.39175 4.23539 8.03912L11.0177 2.764C11.369 2.49075 11.5447 2.35412 11.7387 2.3016C11.9098 2.25526 12.0902 2.25526 12.2613 2.3016C12.4553 2.35412 12.631 2.49075 12.9823 2.764L19.7646 8.03913C20.218 8.39175 20.4447 8.56806 20.608 8.78886C20.7526 8.98444 20.8604 9.20478 20.926 9.43905C21 9.70352 21 9.9907 21 10.5651V17.8C21 18.9201 21 19.4801 20.782 19.908C20.5903 20.2843 20.2843 20.5903 19.908 20.782C19.4802 21 18.9201 21 17.8 21H6.2C5.07989 21 4.51984 21 4.09202 20.782C3.71569 20.5903 3.40973 20.2843 3.21799 19.908C3 19.4801 3 18.9201 3 17.8V10.5651Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconExplore({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 21L17.5001 17.5M20 11.5C20 16.1944 16.1944 20 11.5 20C6.80558 20 3 16.1944 3 11.5C3 6.80558 6.80558 3 11.5 3C16.1944 3 20 6.80558 20 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconTripPlanner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 7C16 6.07003 16 5.60504 15.8978 5.22354C15.6204 4.18827 14.8117 3.37962 13.7765 3.10222C13.395 3 12.93 3 12 3C11.07 3 10.605 3 10.2235 3.10222C9.18827 3.37962 8.37962 4.18827 8.10222 5.22354C8 5.60504 8 6.07003 8 7M12.8 17.5H17.7C17.98 17.5 18.12 17.5 18.227 17.4455C18.3211 17.3976 18.3976 17.3211 18.4455 17.227C18.5 17.12 18.5 16.98 18.5 16.7V14.3C18.5 14.02 18.5 13.88 18.4455 13.773C18.3976 13.6789 18.3211 13.6024 18.227 13.5545C18.12 13.5 17.98 13.5 17.7 13.5H12.8C12.52 13.5 12.38 13.5 12.273 13.5545C12.1789 13.6024 12.1024 13.6789 12.0545 13.773C12 13.88 12 14.02 12 14.3V16.7C12 16.98 12 17.12 12.0545 17.227C12.1024 17.3211 12.1789 17.3976 12.273 17.4455C12.38 17.5 12.52 17.5 12.8 17.5ZM6.8 21H17.2C18.8802 21 19.7202 21 20.362 20.673C20.9265 20.3854 21.3854 19.9265 21.673 19.362C22 18.7202 22 17.8802 22 16.2V11.8C22 10.1198 22 9.27976 21.673 8.63803C21.3854 8.07354 20.9265 7.6146 20.362 7.32698C19.7202 7 18.8802 7 17.2 7H6.8C5.11984 7 4.27976 7 3.63803 7.32698C3.07354 7.6146 2.6146 8.07354 2.32698 8.63803C2 9.27976 2 10.1198 2 11.8V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconHelp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.13626 9.13628L4.92893 4.92896M4.92893 19.0711L9.16797 14.8321M14.8611 14.8638L19.0684 19.0711M19.0684 4.92896L14.8287 9.16862M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const NAV_LINKS = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/explore", label: "Explore", icon: IconExplore },
  { href: "/planner", label: "Trip Planner", icon: IconTripPlanner },
  { href: "/help", label: "Help", icon: IconHelp },
]

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [currentLang, setCurrentLang] = useState("en")
  const [weglotReady, setWeglotReady] = useState(false)
  const pathname = usePathname()
  const cartCtx = useContext(CartContext)
  const totalItems = cartCtx?.totalItems ?? 0

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && typeof (window as any).Weglot !== "undefined") {
        setWeglotReady(true)
        const lang = (window as any).Weglot.getCurrentLang?.() ?? "en"
        setCurrentLang(lang)
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  function switchLanguage(code: string) {
    setCurrentLang(code)
    if (typeof window !== "undefined" && typeof (window as any).Weglot !== "undefined") {
      ;(window as any).Weglot.switchTo(code)
    }
  }

  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo.png" alt="sightseeing.lu" width={160} height={36} priority className="h-8 w-auto" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href.split("?")[0])
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {weglotReady ? (
            <div className="hidden items-center gap-0.5 rounded-lg border border-border p-0.5 md:flex" role="group" aria-label="Language switcher">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => switchLanguage(lang.code)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    currentLang === lang.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={currentLang === lang.code}
                  aria-label={`Switch to ${lang.label}`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground/50">
              <Globe className="h-3.5 w-3.5" />
            </div>
          )}

          <Link
            href="/search?q=Luxembourg+City"
            className="hidden rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex"
          >
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Link>

          <Link
            href="/checkout"
            className="relative flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="sr-only">Cart</span>
            {totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {totalItems}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href.split("?")[0])
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
          {weglotReady && (
            <div className="mt-2 flex items-center gap-1 border-t border-border pt-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-0.5">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => { switchLanguage(lang.code); setOpen(false) }}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      currentLang === lang.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
