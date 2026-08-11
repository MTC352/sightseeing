import type { FooterMenu } from "@/lib/footer-menu-types"

export const FOOTER_MENU_DEFAULT: FooterMenu = {
  groups: [
    {
      id: "about",
      title: "About sightseeing.lu",
      items: [
        { id: "about-about-us", label: "About us", href: "/about", pageKey: null },
        { id: "about-blog", label: "Blog", href: "/blog", pageKey: null },
        { id: "about-careers", label: "Careers", href: "/careers", pageKey: null },
        { id: "about-contact", label: "Contact", href: "#", pageKey: null },
      ],
    },
    {
      id: "explore",
      title: "Explore",
      items: [
        { id: "explore-all", label: "All Experiences", href: "/explore", pageKey: null },
        { id: "explore-departures", label: "Departures", href: "/departures", pageKey: null },
        { id: "explore-live-tracking", label: "Live Tracking", href: "/live-tracking", pageKey: null },
        { id: "explore-search", label: "Search", href: "/search", pageKey: null },
        { id: "explore-food-events", label: "Food & Events", href: "/experiences/food-events", pageKey: null },
        { id: "explore-tours", label: "Tours", href: "/experiences/tours", pageKey: null },
        { id: "explore-sports-nature", label: "Sports & Nature", href: "/experiences/sports-nature", pageKey: null },
        { id: "explore-culture", label: "Culture", href: "/experiences/culture", pageKey: null },
        { id: "explore-private-tours", label: "Private Tours", href: "/experiences/private-tours", pageKey: null },
        { id: "explore-cfl", label: "CFL Sightseeing", href: "/cfl-sightseeing", pageKey: null },
      ],
    },
    {
      id: "plan",
      title: "Plan Your Trip",
      items: [
        { id: "plan-planner", label: "AI Trip Planner", href: "/planner", pageKey: null },
        { id: "plan-travel", label: "Vacation Aggregator", href: "/travel", pageKey: "travel" },
        { id: "plan-flights", label: "Flights", href: "/flights", pageKey: "flights" },
        { id: "plan-trains", label: "Trains", href: "/trains", pageKey: "trains" },
        { id: "plan-cars", label: "Cars", href: "/cars", pageKey: "cars" },
        { id: "plan-hotels", label: "Hotels", href: "/hotels", pageKey: "hotels" },
        { id: "plan-my-trips", label: "My Trips", href: "/my-trips", pageKey: null },
      ],
    },
    {
      id: "support",
      title: "Support",
      items: [
        { id: "support-help", label: "Help & FAQ", href: "/help", pageKey: null },
        { id: "support-emergency", label: "Emergency & 24/7 Support", href: "/emergency", pageKey: null },
        { id: "support-sitemap", label: "Sitemap", href: "/sitemap.xml", pageKey: null },
        { id: "support-terms", label: "Terms & Conditions", href: "/uploads/1780480029465-u38d41.pdf", external: true, pageKey: null },
        { id: "support-ebike", label: "Ebike Conditions", href: "/uploads/1781248651946-ac09tq.pdf", external: true, pageKey: null },
        { id: "support-privacy", label: "Privacy Policy", href: "https://www.slg.lu/politique-de-confidentialite/", external: true, pageKey: null },
        { id: "support-legal", label: "Legal Notice", href: "/impressum", pageKey: null },
        { id: "support-whistleblower", label: "Whistleblower", href: "https://whistleblowersoftware.com/secure/SLG", external: true, pageKey: null },
      ],
    },
  ],
}
