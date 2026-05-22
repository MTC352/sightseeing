import {
  Utensils, Bike, Landmark, Map as MapIcon, Gift, Users, Wine, Sparkles,
  Beer, Camera, Ship, Mountain, TreePine, Music, BookOpen, Baby, Accessibility,
  Briefcase, Heart, Moon, Ticket, Bus, Car, GraduationCap, Star, Castle, Building2,
  Headphones, Zap, PartyPopper, Tag as TagIcon, Sun, Sailboat, Footprints,
  type LucideIcon,
} from "lucide-react"

/** Lucide name → component map used by the homepage Categories cards.
 *  Keep this list in sync with the keywords below. */
export const ICONS: Record<string, LucideIcon> = {
  Utensils, Bike, Landmark, MapIcon, Map: MapIcon, Gift, Users, Wine, Sparkles,
  Beer, Camera, Ship, Mountain, TreePine, Music, BookOpen, Baby, Accessibility,
  Briefcase, Heart, Moon, Ticket, Bus, Car, GraduationCap, Star, Castle, Building2,
  Headphones, Zap, PartyPopper, TagIcon, Tag: TagIcon, Sun, Sailboat, Footprints,
}

/** Auto-pick a lucide icon name from a trip-tag slug.
 *  First explicit overrides, then keyword fallback, then generic Tag. */
const SLUG_OVERRIDES: Record<string, string> = {
  food: "Utensils",
  "bike-tours": "Bike",
  museums: "Landmark",
  history: "Castle",
  "walking-tours": "Footprints",
  "boat-tours": "Sailboat",
  "hop-on-hop-off": "Bus",
  "private-tours": "Users",
  "small-group-tours": "Users",
  "day-trips": "MapIcon",
  outdoors: "Mountain",
  sports: "Bike",
  nightlife: "Moon",
  "live-music": "Music",
  literature: "BookOpen",
  romantic: "Heart",
  "family-friendly": "Baby",
  "suitable-for-children": "Baby",
  "suitable-for-couples": "Heart",
  "suitable-for-groups": "Users",
  "suitable-for-solo": "Users",
  "suitable-for-students": "GraduationCap",
  "suitable-for-business": "Briefcase",
  "suitable-for-wheelchairs": "Accessibility",
  "audio-guide": "Headphones",
  "fast-track": "Zap",
  "city-cards": "Ticket",
  "entrance-ticket": "Ticket",
  "official-ticket": "Ticket",
  "operator-direct-product": "Star",
  transfer: "Car",
  classes: "GraduationCap",
  beaches: "Sun",
  animals: "TreePine",
  "theme-parks": "PartyPopper",
  "adults-only": "Wine",
}

export function iconNameForSlug(slug: string): string {
  if (SLUG_OVERRIDES[slug]) return SLUG_OVERRIDES[slug]
  const s = slug.toLowerCase()
  if (s.includes("food") || s.includes("dinner") || s.includes("restaurant")) return "Utensils"
  if (s.includes("bike") || s.includes("cycl")) return "Bike"
  if (s.includes("museum")) return "Landmark"
  if (s.includes("history") || s.includes("heritage") || s.includes("castle")) return "Castle"
  if (s.includes("walk")) return "Footprints"
  if (s.includes("boat") || s.includes("sail") || s.includes("cruise")) return "Sailboat"
  if (s.includes("bus") || s.includes("hop")) return "Bus"
  if (s.includes("private") || s.includes("group")) return "Users"
  if (s.includes("outdoor") || s.includes("hike") || s.includes("nature")) return "Mountain"
  if (s.includes("music")) return "Music"
  if (s.includes("night")) return "Moon"
  if (s.includes("kid") || s.includes("child") || s.includes("family")) return "Baby"
  if (s.includes("ticket") || s.includes("card")) return "Ticket"
  if (s.includes("photo")) return "Camera"
  if (s.includes("beach") || s.includes("sun")) return "Sun"
  if (s.includes("wine") || s.includes("beer") || s.includes("drink")) return "Wine"
  if (s.includes("class") || s.includes("student")) return "GraduationCap"
  if (s.includes("tour") || s.includes("trip") || s.includes("excursion")) return "MapIcon"
  return "Tag"
}

export function iconForSlug(slug: string): LucideIcon {
  return ICONS[iconNameForSlug(slug)] ?? TagIcon
}
