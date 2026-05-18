export interface Trip {
  id: string
  title: string
  image: string
  gallery?: string[]
  price: number
  originalPrice?: number
  rating: number
  reviewCount: number
  duration: string
  category: string
  tags: string[]
  badge?: string
  city?: string
  description?: string
  permalink?: string
  provider?: string
  highlights?: string[]
  googleBusinessUrl?: string
}

export interface Guide {
  id: string; name: string; avatar: string; languages: string[]; bio: string; rating: number; reviewCount: number; verified: boolean
}

export interface ItineraryStep {
  title: string; description: string; duration?: string
}

export interface TripDetail {
  tripId: string; description: string; highlights: string[]; includes: string[]; notIncluded: string[]
  gallery: string[]; guides: Guide[]; itinerary: ItineraryStep[]
  cancellationPolicy: string[]; goodToKnow: { question: string; answer: string }[]
  reasons: string[]; maxGroupSize: number; languages: string[]
}

/* ── REAL TRIP DATA (from sightseeing.lu CSV export) ────────────── */

export const trips: Trip[] = [
  {
    id: "31318", title: "Climbing Initiation in Echternach",
    image: "/images/trips/climbing-echternach.jpg",
    price: 9, rating: 5, reviewCount: 14, duration: "2 hours", category: "Sports & Nature",
    tags: ["outdoor", "sport", "family", "adventure"], city: "Echternach", provider: "Luxemburgische Jugendherbergen VoG",
    description: "The modern climbing wall at Echternach youth hostel is 14 metres high. Ideal for regular climbing courses and free climbing, for beginners, advanced climbers or families.",
    highlights: ["Climbing", "Learn how to secure", "Climbing wall", "Sports youth hostel Echternach, located at the lake", "Mullerthal Region"],
  },
  {
    id: "31415", title: "6th Rotary Indian Summer Tour 2023",
    image: "/images/trips/indian-summer-tour.jpg",
    price: 175, rating: 4.5, reviewCount: 8, duration: "1 day", category: "Tours",
    tags: ["outdoor", "premium", "culture", "car"], city: "Losheim am See", provider: "Sightseeing.lu",
    description: "Participate in the tourist orientation rally for classic cars, youngtimers and sports cars. A spectacular 200km drive through the Luxembourg and German countryside.",
  },
  {
    id: "31464", title: "Guided Tour - Printing Museum in Grevenmacher",
    image: "/images/trips/printing-museum.jpg",
    price: 5, rating: 4.6, reviewCount: 22, duration: "1.5 hours", category: "Culture",
    tags: ["indoor", "culture", "family", "museum"], city: "Grevenmacher", provider: "Kulturhuef Grevenmacher",
    description: "Explore the history of letterpress printing from the pre-Gutenberg period to the present day, presented across two floors.",
    highlights: ["Educational", "Family-fun", "Sunday afternoon"],
  },
  {
    id: "31466", title: "Guided Tour - Playing Card Museum in Grevenmacher",
    image: "/images/trips/playing-card-museum.jpg",
    price: 5, rating: 4.6, reviewCount: 18, duration: "1.5 hours", category: "Culture",
    tags: ["indoor", "culture", "family", "museum"], city: "Grevenmacher", provider: "Kulturhuef Grevenmacher",
    description: "Jean Dieudonn\u00e9 was the founder of the playing card production in Grevenmacher. Interactive elements offer fun for the entire family.",
    highlights: ["Family-friendly", "Educational", "Sunday"],
  },
  {
    id: "31532", title: "Concert Sascha Ley at Kulturhuef - SUNSET UNPLUGGED",
    image: "/images/trips/sunset-concert.jpg",
    price: 0, rating: 4.8, reviewCount: 31, duration: "1 hour", category: "Food & Events",
    tags: ["outdoor", "night", "music", "free"], city: "Grevenmacher", provider: "Kulturhuef Grevenmacher",
    description: "A free outdoor concert at sunset on the terrace of the Kulturhuef Bistro.",
    highlights: ["Free outdoor concert", "Dinner on the terrace at sunset", "Musical dinner experience"], badge: "Free",
  },
  {
    id: "31536", title: "Concert Painting Birds at Kulturhuef - SUNSET UNPLUGGED",
    image: "/images/trips/sunset-painting-birds.jpg",
    price: 0, rating: 4.7, reviewCount: 25, duration: "1 hour", category: "Food & Events",
    tags: ["outdoor", "night", "music", "free"], city: "Grevenmacher", provider: "Kulturhuef Grevenmacher",
    description: "A free outdoor concert at sunset on the terrace of the Kulturhuef Bistro.", badge: "Free",
  },
  {
    id: "31669", title: "Slate Museum - Mine Johanna (-42m)",
    image: "/images/trips/slate-mine.jpg",
    price: 14, rating: 4.8, reviewCount: 47, duration: "1.5 hours", category: "Culture",
    tags: ["indoor", "culture", "adventure", "museum"], city: "Haut-Martelange", provider: "Ardoisiere de Haut-Martelange",
    description: "Discover the underground mine Johanna and its vast slate extraction chambers at -42m depth. Modern lighting and audiovisual projections.",
    highlights: ["Underground mine at -42m", "Audiovisual projections", "Constant 9 degrees C temperature"],
  },
  {
    id: "31855", title: "Taste North-American Flavors on the Dinner Hopping Bus",
    image: "/images/trips/dinner-hopping-american.jpg",
    price: 99, rating: 4.6, reviewCount: 83, duration: "4 hours", category: "Dinnerhopping",
    tags: ["indoor", "food", "night", "premium", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Experience the ultimate American culinary tour in Luxembourg aboard our retro American School Bus. A multi-course meal at 3 different restaurants.",
    highlights: ["Surprise menu in a retro American School Bus", "3 different restaurants in one evening", "Exclusive concept in Luxembourg", "VIP table option"], badge: "Popular",
  },
  {
    id: "31860", title: "Taste Italian Flavors on the Dinner Hopping Bus",
    image: "/images/trips/dinner-hopping-italian.jpg",
    price: 99, rating: 4.7, reviewCount: 91, duration: "4 hours", category: "Dinnerhopping",
    tags: ["indoor", "food", "night", "premium", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Italian culinary adventure aboard a retro American School Bus. 3-course Italian dinner at 3 different restaurants in Luxembourg.",
    highlights: ["Italian menu across 3 restaurants", "Retro American School Bus", "VIP table option", "Playlist onboard"], badge: "Popular",
  },
  {
    id: "31861", title: "Gourmet Food Journey on the Dinner Hopping Bus",
    image: "/images/trips/dinner-hopping-gourmet.jpg",
    price: 109, rating: 4.8, reviewCount: 76, duration: "4 hours", category: "Dinnerhopping",
    tags: ["indoor", "food", "night", "premium", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "A gourmet dinner hopping experience through Luxembourg's finest restaurants aboard an American School Bus.",
    highlights: ["Gourmet surprise menu", "3 different restaurants", "Retro American School Bus", "VIP table with cr\u00e9mant"], badge: "Bestseller",
  },
  {
    id: "31862", title: "City Train in the Old Town of Luxembourg",
    image: "/images/trips/city-train.jpg",
    price: 14.5, rating: 4.4, reviewCount: 312, duration: "50 minutes", category: "Tours",
    tags: ["outdoor", "morning", "popular", "family", "culture"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Discover Luxembourg City's historic Old Town aboard the City Train. Audio guides in 7 languages.", badge: "Great Value",
  },
  {
    id: "31864", title: "Nature and Castles of Luxembourg: 8-Hour Day Tour",
    image: "/images/trips/nature-castles-tour.jpg",
    price: 56, rating: 4.7, reviewCount: 78, duration: "8 hours", category: "Tours",
    tags: ["outdoor", "culture", "morning", "nature", "castle"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Explore breathtaking landscapes and visit stunning castles including Beaufort and Vianden on this full-day bus tour.",
    highlights: ["Visit Beaufort and Vianden Castles", "Audio guides on the bus", "Scenic countryside drive", "Full day adventure"],
  },
  {
    id: "31866", title: "4 Self-Guided Tours to Discover Luxembourg City",
    image: "/images/trips/self-guided-tours.jpg",
    price: 4.99, rating: 4.3, reviewCount: 156, duration: "1-2 hours each", category: "Tours",
    tags: ["outdoor", "morning", "culture", "self-guided", "family"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "4 unique self-guided walking tours to discover Luxembourg City at your own pace with an audio guide app.", badge: "Great Value",
  },
  {
    id: "31867", title: "A Story from the Past: Self-Guided Walking Tour",
    image: "/images/trips/story-from-past.jpg",
    price: 4.99, rating: 4.2, reviewCount: 89, duration: "1.5 hours", category: "Tours",
    tags: ["outdoor", "culture", "self-guided", "morning"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "A self-guided walking tour through Luxembourg City's historic past with an audio guide.",
  },
  {
    id: "31871", title: "City Train in the Old Town & Museum Pass",
    image: "/images/trips/city-train-museum-pass.jpg",
    price: 24, rating: 4.5, reviewCount: 134, duration: "1-2 days", category: "Tours",
    tags: ["outdoor", "indoor", "culture", "family", "museum", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Combine the City Train experience with access to all 7 museums of Luxembourg City with the Museum Pass.",
    highlights: ["City Train ride", "Museum Pass for 7 museums", "Audio guides included"], badge: "Bundle Deal",
  },
  {
    id: "31876", title: "Guided E-Bike Tour: The Best of Luxembourg in 3 Hours",
    image: "/images/trips/e-bike-tour.jpg",
    price: 70, rating: 4.8, reviewCount: 89, duration: "3 hours", category: "Sports & Nature",
    tags: ["outdoor", "morning", "sport", "popular", "nature"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Discover Luxembourg City from the saddle of a premium e-bike. Wind through the UNESCO-listed old town and cruise along the Alzette River valley.",
    highlights: ["Premium e-bikes make hills effortless", "Cover more ground than walking", "Petrusse and Alzette valleys", "European Quarter on Kirchberg"],
  },
  {
    id: "31878", title: "Gentlemen Night Tour in the American School Bus",
    image: "/images/trips/gentlemen-night.jpg",
    price: 119, originalPrice: 139, rating: 4.6, reviewCount: 45, duration: "4 hours", category: "Tours",
    tags: ["night", "indoor", "fun", "premium"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "An exclusive night out aboard a converted American School Bus, visiting Luxembourg's best bars and nightlife spots.",
  },
  {
    id: "31879", title: "Explore Cultural Marvels with Museum Pass and E-Bike Ride",
    image: "/images/trips/museum-ebike.jpg",
    price: 80, rating: 4.7, reviewCount: 42, duration: "1 day", category: "Culture",
    tags: ["outdoor", "culture", "sport", "museum"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Uncover hidden gems and cultural treasures in Luxembourg City on a 6 km e-bike tour combined with the Museum Pass for 7 museums.",
    highlights: ["6 km E-bike tour", "Museum Pass for 7 museums", "Cultural treasures", "Hidden gems"],
  },
  {
    id: "31881", title: "Famous Cathedral Notre Dame: Self-Guided Audio Tour",
    image: "/images/trips/cathedral-notre-dame.jpg",
    price: 4.99, rating: 4.4, reviewCount: 67, duration: "45 minutes", category: "Culture",
    tags: ["indoor", "culture", "self-guided", "morning"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Explore the famous Cathedral Notre Dame of Luxembourg with a self-guided audio tour.", badge: "Great Value",
  },
  {
    id: "31882", title: "Visit of the Brasserie Nationale Brewery",
    image: "/images/trips/brewery-visit.jpg",
    price: 25, rating: 4.7, reviewCount: 58, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "morning", "beer"], city: "Bascharage", provider: "Brasserie Nationale",
    description: "Discover the heart of Luxembourgish beer production with a guided tour of the Brasserie Nationale brewery.",
  },
  {
    id: "31883", title: "Brew Your Own Beer - De Brauatelier (max. 15 people)",
    image: "/images/trips/brew-your-own.jpg",
    price: 89, rating: 4.9, reviewCount: 34, duration: "4 hours", category: "Food & Events",
    tags: ["indoor", "food", "morning", "beer", "premium"], city: "Bascharage", provider: "Brasserie Nationale",
    description: "A unique hands-on beer brewing workshop at the Brasserie Nationale. Brew your own beer from start to finish.",
    highlights: ["Hands-on brewing experience", "Expert brewmaster guidance", "Take your own beer home", "Max 15 people"], badge: "Unique",
  },
  {
    id: "31884", title: "Beer Drafting Course at the Brasserie Nationale",
    image: "/images/trips/beer-drafting.jpg",
    price: 30, rating: 4.6, reviewCount: 29, duration: "1 hour", category: "Food & Events",
    tags: ["indoor", "food", "beer"], city: "Bascharage", provider: "Brasserie Nationale",
    description: "Learn the art of pouring the perfect draft beer at Luxembourg's iconic Brasserie Nationale.",
  },
  {
    id: "31885", title: "Tasting Session in the Brasserie Nationale",
    image: "/images/trips/beer-tasting.jpg",
    price: 20, rating: 4.5, reviewCount: 41, duration: "1 hour", category: "Food & Events",
    tags: ["indoor", "food", "beer", "morning"], city: "Bascharage", provider: "Brasserie Nationale",
    description: "Guided tasting of different beers brewed at the Brasserie Nationale, Luxembourg's largest brewery.",
  },
  {
    id: "31890", title: "Discover Luxembourg on 1-Day E-Bike Rentals",
    image: "/images/trips/e-bike-rental.jpg",
    price: 35, rating: 4.5, reviewCount: 63, duration: "1 day", category: "Sports & Nature",
    tags: ["outdoor", "sport", "morning", "nature", "self-guided"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Rent a premium e-bike for the full day and discover Luxembourg at your own pace.",
  },
  {
    id: "31891", title: "Best Guided Walking Tour in Luxembourg City",
    image: "/images/trips/walking-tour.jpg",
    price: 25, rating: 4.7, reviewCount: 203, duration: "2.5 hours", category: "Tours",
    tags: ["outdoor", "morning", "culture", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Explore Luxembourg City with a professional guide. Visit the Grand Ducal Palace, Notre Dame Cathedral, and the historic fortifications.", badge: "Top Rated",
  },
  {
    id: "31893", title: "Private Nature & Castle Day Tour (4 or 8 hours)",
    image: "/images/trips/private-castle-tour.jpg",
    price: 320, rating: 4.9, reviewCount: 21, duration: "4-8 hours", category: "Private Tours",
    tags: ["outdoor", "premium", "culture", "nature", "castle", "private"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "A private tour through Luxembourg's stunning nature and majestic castles. Fully customizable itinerary.",
    highlights: ["Private tour", "Customizable itinerary", "Vianden and Beaufort options", "Professional driver-guide"], badge: "Premium",
  },
  {
    id: "31898", title: "3-Hour Food Tour: Uncover the Tastes of Luxembourg",
    image: "/images/trips/food-tour.jpg",
    price: 34, rating: 4.9, reviewCount: 127, duration: "3 hours", category: "Food & Events",
    tags: ["food", "indoor", "morning", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Embark on a mouthwatering journey through Luxembourg City's most beloved culinary hotspots. Sample artisan cheeses, pastries, traditional dishes, and local wines.",
    highlights: ["8+ tastings from local establishments", "Hidden gems in the Grund neighborhood", "Wine pairings with certified sommelier", "Small group (max 12)"], badge: "Bestseller",
  },
  {
    id: "31932", title: "Luxembourg City Bus Tour",
    image: "/images/trips/city-bus-tour.jpg",
    price: 20, rating: 4.3, reviewCount: 189, duration: "2 hours", category: "Tours",
    tags: ["outdoor", "morning", "popular", "family", "culture"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "See all the highlights of Luxembourg City from the comfort of a modern sightseeing bus with audio guide in 13 languages.",
  },
  {
    id: "31962", title: "Beaufort Guided E-Scooter Tours",
    image: "/images/trips/e-scooter-beaufort.jpg",
    price: 49, rating: 4.5, reviewCount: 28, duration: "2 hours", category: "Sports & Nature",
    tags: ["outdoor", "sport", "adventure", "nature"], city: "Beaufort", provider: "Sightseeing.lu",
    description: "Explore the stunning Mullerthal region around Beaufort on electric scooters with a local guide.",
  },
  {
    id: "32069", title: "Wine Tasting - Caves des Vignerons de Grevenmacher",
    image: "/images/trips/wine-tasting-grevenmacher.jpg",
    price: 15, rating: 4.6, reviewCount: 52, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "wine", "morning"], city: "Grevenmacher", provider: "Caves des Vignerons de Grevenmacher",
    description: "Explore the wine cellars and taste a selection of Luxembourgish wines from the Moselle Valley.",
  },
  {
    id: "32075", title: "Wine Tasting - Caves du Sud Remerschen",
    image: "/images/trips/wine-tasting-remerschen.jpg",
    price: 15, rating: 4.5, reviewCount: 38, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "wine", "morning"], city: "Remerschen", provider: "Caves du Sud",
    description: "Discover the wines of southern Luxembourg with a guided tasting at the Caves du Sud in Remerschen.",
  },
  {
    id: "32080", title: "Wine Tasting - Caves de Wellenstein",
    image: "/images/trips/wine-tasting-wellenstein.jpg",
    price: 15, rating: 4.6, reviewCount: 44, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "wine", "morning"], city: "Wellenstein", provider: "Caves de Wellenstein",
    description: "Guided wine tasting in the charming village of Wellenstein along the Luxembourg Moselle.",
  },
  {
    id: "32083", title: "Wine Tasting - Caves des Cr\u00e9mants POLL-FABAIRE",
    image: "/images/trips/wine-tasting-cremant.jpg",
    price: 15, rating: 4.7, reviewCount: 36, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "wine", "premium", "morning"], city: "Wormeldange", provider: "POLL-FABAIRE",
    description: "Taste Luxembourg's finest Cr\u00e9mants at POLL-FABAIRE, one of the country's most prestigious sparkling wine producers.",
  },
  {
    id: "32105", title: "Museums Mile: Explore Luxembourg's 7 Vibrant Museums",
    image: "/images/trips/museums-mile.jpg",
    price: 21, rating: 4.4, reviewCount: 97, duration: "1-2 days", category: "Culture",
    tags: ["indoor", "culture", "museum", "family"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Access all 7 museums of Luxembourg City with a single Museum Pass. From modern art to ancient history.",
  },
  {
    id: "32208", title: "Guided Tour of the Minett Trail",
    image: "/images/trips/minett-trail.jpg",
    price: 15, rating: 4.5, reviewCount: 19, duration: "2 hours", category: "Tours",
    tags: ["outdoor", "culture", "nature", "morning"], city: "Esch-sur-Alzette", provider: "Minett Trail",
    description: "Discover the industrial heritage of Luxembourg's south. The Minett region's iron ore and steel history shaped the country.",
  },
  {
    id: "32222", title: "Luxembourg City Bus Tour & 7 Museums Pass",
    image: "/images/trips/bus-tour-museum-pass.jpg",
    price: 35, rating: 4.5, reviewCount: 108, duration: "1-2 days", category: "Tours",
    tags: ["outdoor", "indoor", "culture", "museum", "family", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Combine the Luxembourg City Bus Tour with access to all 7 museums with the Museum Pass.", badge: "Bundle Deal",
  },
  {
    id: "32381", title: "Explore the Best of Diekirch: Museums and Audio Guide",
    image: "/images/trips/diekirch-museums.jpg",
    price: 12, rating: 4.3, reviewCount: 33, duration: "2-3 hours", category: "Culture",
    tags: ["indoor", "culture", "museum", "self-guided"], city: "Diekirch", provider: "Sightseeing.lu",
    description: "Discover the charming town of Diekirch with museum visits and an audio guide walking tour.",
  },
  {
    id: "32485", title: "Wine Tasting - Vinocity Luxembourg",
    image: "/images/trips/vinocity-wine.jpg",
    price: 22, rating: 4.6, reviewCount: 48, duration: "1.5 hours", category: "Food & Events",
    tags: ["indoor", "food", "wine", "morning"], city: "Ehnen", provider: "Domaines Vinsmoselle",
    description: "Domaines Vinsmoselle invites you to explore a wide range of wines. An unforgettable journey into Luxembourgish winemaking.",
  },
  {
    id: "32662", title: "Taste Latin American Flavors on the Dinner Hopping Bus",
    image: "/images/trips/dinner-hopping-latin.jpg",
    price: 99, rating: 4.7, reviewCount: 55, duration: "4 hours", category: "Dinnerhopping",
    tags: ["indoor", "food", "night", "premium", "popular"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Latin American culinary adventure aboard the retro American School Bus. 3-course dinner at 3 different restaurants.",
    highlights: ["Latin American menu", "3 restaurants in one evening", "Retro American School Bus", "VIP table option"],
  },
  {
    id: "32677", title: "City E-Bike Luxembourg: Perfect for Nature Lovers",
    image: "/images/trips/e-bike-nature.jpg",
    price: 55, rating: 4.6, reviewCount: 37, duration: "3 hours", category: "Sports & Nature",
    tags: ["outdoor", "sport", "nature", "morning"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "An e-bike tour designed specifically for nature lovers, exploring Luxembourg City's green spaces and river valleys.",
  },
  {
    id: "32678", title: "Luxembourg City: UNESCO E-Bike Tour",
    image: "/images/trips/unesco-ebike.jpg",
    price: 70, rating: 4.8, reviewCount: 44, duration: "3 hours", category: "Sports & Nature",
    tags: ["outdoor", "sport", "culture", "morning"], city: "Luxembourg", provider: "Sightseeing.lu",
    description: "Explore Luxembourg's UNESCO World Heritage sites by e-bike. Cover Bock Casemates, Grand Ducal Palace, and more.",
    highlights: ["UNESCO World Heritage sites", "Premium e-bikes", "Expert guide", "Panoramic views"],
  },
  {
    id: "33461", title: "LOOK 360 Panorama - A Fantastic Experience at 71 Metres High!",
    image: "/images/trips/look-360.jpg",
    price: 15, rating: 4.9, reviewCount: 112, duration: "30 minutes", category: "Tours",
    tags: ["outdoor", "popular", "family", "adventure"], city: "Luxembourg", provider: "LOOK 360",
    description: "The tallest mobile skylift in the world! A stunning 360-degree panoramic view of Luxembourg City from 71 metres.", badge: "New",
  },
  {
    id: "33982", title: "Museum A Possen - Entry Ticket",
    image: "/images/trips/museum-a-possen.jpg",
    price: 5, rating: 4.3, reviewCount: 26, duration: "1.5 hours", category: "Culture",
    tags: ["indoor", "culture", "museum", "family"], city: "Bech-Kleinmacher", provider: "Museum A Possen",
    description: "Discover the Museum A Possen in Bech-Kleinmacher in the municipality of Schengen. Living and working conditions from the 19th century.",
  },
]

export const guides: Guide[] = [
  { id: "g1", name: "Sophie", avatar: "/images/guide-sophie.jpg", languages: ["English", "French", "Luxembourgish"], bio: "Born and raised in Luxembourg City, Sophie has been sharing her love for local cuisine and hidden gems for over 8 years. She's a certified sommelier and passionate foodie.", rating: 4.9, reviewCount: 127, verified: true },
  { id: "g2", name: "Marc", avatar: "/images/guide-marc.jpg", languages: ["English", "German", "French"], bio: "A history professor turned tour guide, Marc brings Luxembourg's rich past to life with captivating stories and deep local knowledge.", rating: 4.8, reviewCount: 203, verified: true },
  { id: "g3", name: "Elena", avatar: "/images/guide-elena.jpg", languages: ["English", "French", "Spanish"], bio: "Elena is an adventure enthusiast and certified cycling instructor. She designs unique routes that combine physical activity with cultural discovery.", rating: 4.9, reviewCount: 89, verified: true },
]

/** Lightweight trip objects safe to bundle in client components — heavy optional fields stripped. */
export type TripSummary = Omit<Trip, "description" | "highlights" | "permalink" | "provider">
export const tripSummaries: TripSummary[] = trips.map(
  ({ description: _d, highlights: _h, permalink: _p, provider: _pr, ...rest }) => rest
)

export const tripDetails: Record<string, TripDetail> = {
  "31898": {
    tripId: "31898", description: "Embark on a mouthwatering journey through Luxembourg City's most beloved culinary hotspots. This 3-hour guided food tour takes you beyond the tourist traps and into the heart of local gastronomy. Sample artisan cheeses, freshly baked pastries, traditional Luxembourgish dishes, and locally produced wines.",
    highlights: ["Sample 8+ tastings from carefully selected local establishments", "Explore hidden culinary gems in the historic Grund neighborhood", "Learn about Luxembourg's unique food culture and traditions", "Enjoy wine pairings with a certified local sommelier guide", "Small group experience (max 12 people) for a personal touch"],
    includes: ["All food tastings (8+ stops)", "Wine and drink pairings", "Professional local guide", "Small group experience"],
    notIncluded: ["Hotel pickup and drop-off", "Additional food or beverages", "Gratuities (optional)"],
    gallery: ["/images/trips/food-tour.jpg", "/images/trips/wine-tasting-grevenmacher.jpg", "/images/trips/brewery-visit.jpg", "/images/trips/wine-tasting-cremant.jpg"],
    guides: [guides[0], guides[1]],
    itinerary: [
      { title: "Meeting Point", description: "Meet your guide at Place d'Armes, the heart of Luxembourg City.", duration: "5 min" },
      { title: "Artisan Cheese Tasting", description: "Start at a beloved fromagerie where you'll sample three local cheeses paired with Cremant.", duration: "25 min" },
      { title: "Walk Through the Old Town", description: "Stroll through the Petrusse Valley with panoramic views of the historic fortifications.", duration: "15 min" },
      { title: "Traditional Bouneschlupp", description: "Enjoy Luxembourg's national dish -- a hearty green bean soup -- at a family-run restaurant.", duration: "30 min" },
      { title: "Patisserie & Sweet Treats", description: "Visit a famous local bakery for freshly made Quetschentaart and Bamkuch.", duration: "20 min" },
      { title: "Wine Cellar Visit", description: "Descend into a historic wine cellar for a tasting of Moselle Valley wines.", duration: "30 min" },
      { title: "Final Stop & Farewell", description: "End at a cozy bistro with a digestif and insider tips for the rest of your stay.", duration: "15 min" },
    ],
    cancellationPolicy: ["Full refund if cancelled 24+ hours before the experience", "No refund if cancelled less than 24 hours before", "Changes accepted up to 24 hours before"],
    goodToKnow: [
      { question: "Is this tour suitable for dietary restrictions?", answer: "Yes! Please inform us of any allergies when booking. We accommodate vegetarian, vegan, gluten-free, and most other dietary needs." },
      { question: "What happens if it rains?", answer: "The tour runs rain or shine. Most stops are indoors. We recommend comfortable shoes and an umbrella." },
    ],
    reasons: ["Certified local foodie guide", "8+ specialties you won't find in guidebooks", "Small groups mean personal attention", "Flexible cancellation up to 24 hours before"],
    maxGroupSize: 12, languages: ["English", "French", "German"],
  },
  "31876": {
    tripId: "31876", description: "Discover Luxembourg City from the saddle of a premium e-bike on this exhilarating 3-hour guided cycling tour. Wind through the historic UNESCO-listed old town, cruise along the Alzette River valley, and pedal up to the stunning Kirchberg plateau with ease.",
    highlights: ["Premium e-bikes make hills effortless", "Cover more ground than a walking tour", "Ride through the stunning Petrusse and Alzette valleys", "Visit the European Quarter on the Kirchberg plateau"],
    includes: ["Premium e-bike rental", "Helmet", "Professional cycling guide", "Water bottle"],
    notIncluded: ["Food and beverages", "Hotel pickup", "Gratuities"],
    gallery: ["/images/trips/e-bike-tour.jpg", "/images/trips/museum-ebike.jpg", "/images/trips/e-bike-nature.jpg", "/images/trips/unesco-ebike.jpg"],
    guides: [guides[2]],
    itinerary: [
      { title: "Bike Fitting", description: "Meet at our shop for bike fitting and safety briefing.", duration: "15 min" },
      { title: "Old Town Loop", description: "Ride through the historic center past the Grand Ducal Palace.", duration: "40 min" },
      { title: "Valley Descent", description: "Cruise into the Petrusse Valley with stunning views.", duration: "30 min" },
      { title: "Kirchberg Ascent", description: "E-bike up to the modern European Quarter.", duration: "35 min" },
      { title: "Panoramic Return", description: "Return via the Viaduc and Red Bridge for a final photo stop.", duration: "20 min" },
    ],
    cancellationPolicy: ["Full refund 48+ hours before", "50% refund 24-48 hours before", "No refund under 24 hours"],
    goodToKnow: [
      { question: "Do I need cycling experience?", answer: "No! Our e-bikes make it easy for everyone." },
      { question: "What should I wear?", answer: "Comfortable clothing and closed-toe shoes. We provide helmets." },
    ],
    reasons: ["E-bikes for effortless riding", "Cover 3x more than walking", "Expert local cycling guide", "All equipment included"],
    maxGroupSize: 10, languages: ["English", "French"],
  },
}

export function getTripDetail(id: string): TripDetail | undefined {
  if (tripDetails[id]) return tripDetails[id]
  const trip = trips.find((t) => t.id === id)
  if (!trip) return undefined
  return {
    tripId: id,
    description: trip.description ?? `Enjoy ${trip.title} in ${trip.city ?? "Luxembourg"}.`,
    highlights: trip.highlights ?? [trip.category, trip.duration, trip.city ?? "Luxembourg"],
    includes: ["Activity as described", "Professional guidance"],
    notIncluded: ["Transportation to meeting point", "Gratuities (optional)"],
    gallery: [
      trip.image,
      ...trips.filter((t) => t.id !== id && t.category === trip.category).slice(0, 3).map((t) => t.image),
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4),
    guides: [],
    itinerary: [
      { title: "Meeting Point", description: "Meet at the designated location.", duration: "10 min" },
      { title: "Experience", description: trip.description ?? trip.title, duration: trip.duration },
    ],
    cancellationPolicy: ["Full refund if cancelled 24+ hours before", "No refund less than 24 hours before"],
    goodToKnow: [
      { question: "What should I bring?", answer: "Comfortable clothing and shoes. Check the weather forecast and dress accordingly." },
    ],
    reasons: [trip.category, `${trip.duration} experience`, `In ${trip.city ?? "Luxembourg"}`],
    maxGroupSize: 20,
    languages: ["English", "French", "German"],
  }
}
export function getTripById(id: string): Trip | undefined { 
  const staticTrip = trips.find((t) => t.id === id)
  
  // Try to get admin store data (dynamic import to avoid circular deps)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTrip } = require("./admin-store")
    const adminTrip = getTrip(id)
    if (adminTrip) {
      console.log("[v0] getTripById: Found admin trip, googleBusinessUrl:", adminTrip.googleBusinessUrl)
      // Merge admin data over static data (admin fields take precedence)
      const merged = {
        ...staticTrip,
        ...adminTrip,
        // Ensure id is always present
        id: adminTrip.id || staticTrip?.id || id,
      } as Trip
      console.log("[v0] getTripById: Merged trip googleBusinessUrl:", merged.googleBusinessUrl)
      return merged
    }
  } catch (e) {
    console.log("[v0] getTripById: Admin store error:", e)
    // Admin store not available, fall back to static data
  }
  
  return staticTrip
}

/* ── Google Reviews ─────────────────────────────────────────────── */

export interface GoogleReview {
  id: string
  author: string
  initial: string
  rating: number
  date: string
  text: string
  language: string
  platform: "google" | "viator" | "getyourguide" | "tripadvisor"
  tourName?: string
}

const REVIEW_POOL: GoogleReview[] = [
  { id: "r1", author: "Sophie M.", initial: "S", rating: 5, date: "3/8/2026", text: "An absolutely magical experience! Our guide was incredibly knowledgeable and made the whole tour feel personal. Highly recommend to anyone visiting Luxembourg.", language: "en", platform: "viator", tourName: "Nature and Castles of Luxembourg" },
  { id: "r2", author: "Thomas K.", initial: "T", rating: 5, date: "3/7/2026", text: "One of the highlights of our Luxembourg trip. Perfect organisation, small group, and the local insights were priceless. We already booked again for next summer.", language: "en", platform: "getyourguide", tourName: "The Best of Luxembourg Guided E-Bike Tour" },
  { id: "r3", author: "Marie-Claire D.", initial: "M", rating: 4, date: "2/28/2026", text: "Sehr gut organisiert und ein freundlicher Guide. Das Erlebnis war perfekt für unsere Familie. Wir kommen definitiv wieder!", language: "de", platform: "tripadvisor", tourName: "Best Guided 2-hour Walking Tour" },
  { id: "r4", author: "James R.", initial: "J", rating: 5, date: "2/15/2026", text: "Worth every cent. Booking was seamless, the team responded quickly to all our questions, and the experience itself exceeded every expectation.", language: "en", platform: "google", tourName: "Luxembourg City Highlights" },
  { id: "r5", author: "Lucia B.", initial: "L", rating: 4, date: "1/22/2026", text: "Superbe expérience, guide passionné et très professionnel. Je recommande vivement à tous ceux qui visitent le Luxembourg pour la première fois.", language: "fr", platform: "viator", tourName: "Luxembourg Old Town Walking Tour" },
  { id: "r6", author: "Pieter V.", initial: "P", rating: 5, date: "1/10/2026", text: "We joined as a group of 8 and everyone loved it. The guide adapted the tour to suit all ages. A truly memorable afternoon in Luxembourg.", language: "en", platform: "getyourguide", tourName: "Moselle Valley Wine Tour" },
  { id: "r7", author: "Anna S.", initial: "A", rating: 5, date: "12/18/2025", text: "Brilliant experience from start to finish. Loved the small group size — felt exclusive and personalised. The photos I took are now my favourite from the whole trip.", language: "en", platform: "tripadvisor", tourName: "Castles and Fortresses Day Trip" },
  { id: "r8", author: "Henrik L.", initial: "H", rating: 4, date: "11/30/2025", text: "Great value for money. Very professional setup and the experience was unique. Only minor quibble is we could have used slightly more time at certain stops.", language: "en", platform: "google", tourName: "Nature and Castles of Luxembourg" },
]

export function getGoogleReviews(tripId: string): GoogleReview[] {
  // Rotate the pool based on tripId hash so each trip shows different reviews
  const seed = tripId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const start = seed % REVIEW_POOL.length
  const rotated = [...REVIEW_POOL.slice(start), ...REVIEW_POOL.slice(0, start)]
  return rotated.slice(0, 5)
}

export interface PhotoSpot {
  id: string
  name: string
  description: string
  coords: [number, number] // [lng, lat]
}

export const photoSpots: PhotoSpot[] = [
  { id: "ps1", name: "Chemin de la Corniche", description: "The most beautiful balcony of Europe -- panoramic views of the Grund valley", coords: [6.1345, 49.6105] },
  { id: "ps2", name: "Pont Adolphe", description: "Iconic bridge with stunning views of the Petrusse Valley", coords: [6.1262, 49.6088] },
  { id: "ps3", name: "Bock Casemates Lookout", description: "Bird's-eye view from the top of the historic fortification ruins", coords: [6.1367, 49.6118] },
  { id: "ps4", name: "Pfaffenthal Elevator Top", description: "Panoramic glass elevator with views of the old and new city", coords: [6.1370, 49.6147] },
  { id: "ps5", name: "Place Guillaume II", description: "Central square with the statue of William II and City Hall", coords: [6.1310, 49.6110] },
  { id: "ps6", name: "Kirchberg Philharmonie", description: "Striking modern architecture of the Philharmonie Luxembourg", coords: [6.1420, 49.6210] },
  { id: "ps7", name: "Stierchen Bridge", description: "Charming stone bridge in the Grund with reflections on the Alzette", coords: [6.1340, 49.6090] },
  { id: "ps8", name: "Mudam Terrace", description: "Modern art museum with glass facade and city skyline backdrop", coords: [6.1370, 49.6205] },
  { id: "ps9", name: "Vianden Castle Hill", description: "Fairy-tale castle rising above the Our valley in Vianden", coords: [6.2090, 49.9340] },
  { id: "ps10", name: "Echternach Lake", description: "Peaceful lake reflection shots with the abbey in the background", coords: [6.4180, 49.8130] },
  { id: "ps11", name: "Mullerthal Trail Schiessentumpel", description: "Famous three-tiered waterfall in Luxembourg's Little Switzerland", coords: [6.3540, 49.7940] },
  { id: "ps12", name: "Red Bridge (Passerelle)", description: "Historic viaduct offering sweeping valley and city views", coords: [6.1340, 49.6060] },
]

export const weatherData = {
  current: { temp: 12, condition: "Partly Cloudy" as const, humidity: 65, wind: 14, icon: "cloud-sun" as const },
  forecast: [
    { day: "Today", high: 14, low: 8, icon: "cloud-sun" as const },
    { day: "Tue", high: 11, low: 6, icon: "cloud-rain" as const },
    { day: "Wed", high: 9, low: 5, icon: "cloud-rain" as const },
    { day: "Thu", high: 13, low: 7, icon: "sun" as const },
  ],
}

export const categories = [
  { name: "Food & Events", icon: "utensils", count: 12 },
  { name: "Sports & Nature", icon: "bike", count: 6 },
  { name: "Culture", icon: "landmark", count: 9 },
  { name: "Tours", icon: "map", count: 14 },
  { name: "Dinnerhopping", icon: "wine", count: 4 },
  { name: "Private Tours", icon: "users", count: 2 },
]

export const reviews = [
  { id: "r1", author: "Mike Stone", rating: 5, date: "12/07/2025", text: "I haven't looked at your website, however Marc didn't get my reservation from me apparently. I'd recommend this to my colleagues with who I'm here as a cycling tour guide.", tripTitle: "Guided E-Bike Tour" },
  { id: "r2", author: "Pierre Tchoumba", rating: 5, date: "11/15/2025", text: "Wonderful experience to admire the beauty of the Luxembourg town and history.", tripTitle: "Walking Tour" },
  { id: "r3", author: "Noemi El Jazri", rating: 4, date: "11/02/2025", text: "Magical to walk through the old streets. La guide etait tres sympa et les stops du tour tres bien choisis.", tripTitle: "3-Hour Food Tour" },
]
