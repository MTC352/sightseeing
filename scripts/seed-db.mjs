/**
 * scripts/seed-db.mjs
 * Seeds all data into PostgreSQL using parameterized queries.
 * Run: node scripts/seed-db.mjs
 */
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function query(sql, params = []) {
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

// ── Admin user ─────────────────────────────────────────────────────────────

async function seedAdminUser() {
  // Hash is for "Admin1234!" — bcrypt 12 rounds
  const hash = '$2b$12$PO05akiDVS5qAVrdcDWOR.lk0XwmaoNgYO4/bPm7Qi2yQ6XTT8zrC'
  await query(
    `INSERT INTO admin_users (email, name, password_hash, role) 
     VALUES ($1, $2, $3, 'superadmin') 
     ON CONFLICT (email) DO NOTHING`,
    ['admin@sightseeing.lu', 'Admin', hash]
  )
  const { rows } = await query(`SELECT id FROM admin_users WHERE email = $1`, ['admin@sightseeing.lu'])
  console.log('✓ admin_users seeded, id =', rows[0].id)
  return rows[0].id
}

// ── Trips ──────────────────────────────────────────────────────────────────

const tripsData = [
  { id: '31318', title: 'Climbing Initiation in Echternach', description: 'The modern climbing wall at Echternach youth hostel is 14 metres high. Ideal for regular climbing courses and free climbing, for beginners, advanced climbers or families.', price: 9, duration: '2 hours', category: 'Sports & Nature', tags: ['outdoor','sport','family','adventure'], city: 'Echternach', provider: 'Luxemburgische Jugendherbergen VoG', image: '/images/trips/climbing-echternach.jpg', highlights: ['Climbing','Learn how to secure','Climbing wall','Sports youth hostel Echternach, located at the lake','Mullerthal Region'], badge: null, rating: 5, reviewCount: 14, featured: false },
  { id: '31415', title: '6th Rotary Indian Summer Tour 2023', description: 'Participate in the tourist orientation rally for classic cars, youngtimers and sports cars. A spectacular 200km drive through the Luxembourg and German countryside.', price: 175, duration: '1 day', category: 'Tours', tags: ['outdoor','premium','culture','car'], city: 'Losheim am See', provider: 'Sightseeing.lu', image: '/images/trips/indian-summer-tour.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 8, featured: false },
  { id: '31464', title: 'Guided Tour - Printing Museum in Grevenmacher', description: 'Explore the history of letterpress printing from the pre-Gutenberg period to the present day, presented across two floors.', price: 5, duration: '1.5 hours', category: 'Culture', tags: ['indoor','culture','family','museum'], city: 'Grevenmacher', provider: 'Kulturhuef Grevenmacher', image: '/images/trips/printing-museum.jpg', highlights: ['Educational','Family-fun','Sunday afternoon'], badge: null, rating: 4.6, reviewCount: 22, featured: false },
  { id: '31466', title: 'Guided Tour - Playing Card Museum in Grevenmacher', description: "Jean Dieudonné was the founder of the playing card production in Grevenmacher. Interactive elements offer fun for the entire family.", price: 5, duration: '1.5 hours', category: 'Culture', tags: ['indoor','culture','family','museum'], city: 'Grevenmacher', provider: 'Kulturhuef Grevenmacher', image: '/images/trips/playing-card-museum.jpg', highlights: ['Family-friendly','Educational','Sunday'], badge: null, rating: 4.6, reviewCount: 18, featured: false },
  { id: '31532', title: 'Concert Sascha Ley at Kulturhuef - SUNSET UNPLUGGED', description: 'A free outdoor concert at sunset on the terrace of the Kulturhuef Bistro.', price: 0, duration: '1 hour', category: 'Food & Events', tags: ['outdoor','night','music','free'], city: 'Grevenmacher', provider: 'Kulturhuef Grevenmacher', image: '/images/trips/sunset-concert.jpg', highlights: ['Free outdoor concert','Dinner on the terrace at sunset','Musical dinner experience'], badge: 'Free', rating: 4.8, reviewCount: 31, featured: false },
  { id: '31536', title: 'Concert Painting Birds at Kulturhuef - SUNSET UNPLUGGED', description: 'A free outdoor concert at sunset on the terrace of the Kulturhuef Bistro.', price: 0, duration: '1 hour', category: 'Food & Events', tags: ['outdoor','night','music','free'], city: 'Grevenmacher', provider: 'Kulturhuef Grevenmacher', image: '/images/trips/sunset-painting-birds.jpg', highlights: [], badge: 'Free', rating: 4.7, reviewCount: 25, featured: false },
  { id: '31669', title: 'Slate Museum - Mine Johanna (-42m)', description: 'Discover the underground mine Johanna and its vast slate extraction chambers at -42m depth. Modern lighting and audiovisual projections.', price: 14, duration: '1.5 hours', category: 'Culture', tags: ['indoor','culture','adventure','museum'], city: 'Haut-Martelange', provider: 'Ardoisiere de Haut-Martelange', image: '/images/trips/slate-mine.jpg', highlights: ['Underground mine at -42m','Audiovisual projections','Constant 9 degrees C temperature'], badge: null, rating: 4.8, reviewCount: 47, featured: false },
  { id: '31855', title: 'Taste North-American Flavors on the Dinner Hopping Bus', description: 'Experience the ultimate American culinary tour in Luxembourg aboard our retro American School Bus. A multi-course meal at 3 different restaurants.', price: 99, duration: '4 hours', category: 'Dinnerhopping', tags: ['indoor','food','night','premium','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/dinner-hopping-american.jpg', highlights: ['Surprise menu in a retro American School Bus','3 different restaurants in one evening','Exclusive concept in Luxembourg','VIP table option'], badge: 'Popular', rating: 4.6, reviewCount: 83, featured: true },
  { id: '31860', title: 'Taste Italian Flavors on the Dinner Hopping Bus', description: 'Italian culinary adventure aboard a retro American School Bus. 3-course Italian dinner at 3 different restaurants in Luxembourg.', price: 99, duration: '4 hours', category: 'Dinnerhopping', tags: ['indoor','food','night','premium','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/dinner-hopping-italian.jpg', highlights: ['Italian menu across 3 restaurants','Retro American School Bus','VIP table option','Playlist onboard'], badge: 'Popular', rating: 4.7, reviewCount: 91, featured: true },
  { id: '31861', title: 'Gourmet Food Journey on the Dinner Hopping Bus', description: "A gourmet dinner hopping experience through Luxembourg's finest restaurants aboard an American School Bus.", price: 109, duration: '4 hours', category: 'Dinnerhopping', tags: ['indoor','food','night','premium','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/dinner-hopping-gourmet.jpg', highlights: ['Gourmet surprise menu','3 different restaurants','Retro American School Bus','VIP table with crémant'], badge: 'Bestseller', rating: 4.8, reviewCount: 76, featured: true },
  { id: '31862', title: 'City Train in the Old Town of Luxembourg', description: "Discover Luxembourg City's historic Old Town aboard the City Train. Audio guides in 7 languages.", price: 14.5, duration: '50 minutes', category: 'Tours', tags: ['outdoor','morning','popular','family','culture'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/city-train.jpg', highlights: [], badge: 'Great Value', rating: 4.4, reviewCount: 312, featured: true },
  { id: '31864', title: 'Nature and Castles of Luxembourg: 8-Hour Day Tour', description: 'Explore breathtaking landscapes and visit stunning castles including Beaufort and Vianden on this full-day bus tour.', price: 56, duration: '8 hours', category: 'Tours', tags: ['outdoor','culture','morning','nature','castle'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/nature-castles-tour.jpg', highlights: ['Visit Beaufort and Vianden Castles','Audio guides on the bus','Scenic countryside drive','Full day adventure'], badge: null, rating: 4.7, reviewCount: 78, featured: false },
  { id: '31866', title: '4 Self-Guided Tours to Discover Luxembourg City', description: '4 unique self-guided walking tours to discover Luxembourg City at your own pace with an audio guide app.', price: 4.99, duration: '1-2 hours each', category: 'Tours', tags: ['outdoor','morning','culture','self-guided','family'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/self-guided-tours.jpg', highlights: [], badge: 'Great Value', rating: 4.3, reviewCount: 156, featured: false },
  { id: '31867', title: 'A Story from the Past: Self-Guided Walking Tour', description: "A self-guided walking tour through Luxembourg City's historic past with an audio guide.", price: 4.99, duration: '1.5 hours', category: 'Tours', tags: ['outdoor','culture','self-guided','morning'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/story-from-past.jpg', highlights: [], badge: null, rating: 4.2, reviewCount: 89, featured: false },
  { id: '31871', title: 'City Train in the Old Town & Museum Pass', description: 'Combine the City Train experience with access to all 7 museums of Luxembourg City with the Museum Pass.', price: 24, duration: '1-2 days', category: 'Tours', tags: ['outdoor','indoor','culture','family','museum','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/city-train-museum-pass.jpg', highlights: ['City Train ride','Museum Pass for 7 museums','Audio guides included'], badge: 'Bundle Deal', rating: 4.5, reviewCount: 134, featured: true },
  { id: '31876', title: 'Guided E-Bike Tour: The Best of Luxembourg in 3 Hours', description: 'Discover Luxembourg City from the saddle of a premium e-bike. Wind through the UNESCO-listed old town and cruise along the Alzette River valley.', price: 70, duration: '3 hours', category: 'Sports & Nature', tags: ['outdoor','morning','sport','popular','nature'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/e-bike-tour.jpg', highlights: ['Premium e-bikes make hills effortless','Cover more ground than walking','Petrusse and Alzette valleys','European Quarter on Kirchberg'], badge: null, rating: 4.8, reviewCount: 89, featured: true },
  { id: '31878', title: 'Gentlemen Night Tour in the American School Bus', description: "An exclusive night out aboard a converted American School Bus, visiting Luxembourg's best bars and nightlife spots.", price: 119, duration: '4 hours', category: 'Tours', tags: ['night','indoor','fun','premium'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/gentlemen-night.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 45, featured: false },
  { id: '31879', title: 'Explore Cultural Marvels with Museum Pass and E-Bike Ride', description: 'Uncover hidden gems and cultural treasures in Luxembourg City on a 6 km e-bike tour combined with the Museum Pass for 7 museums.', price: 80, duration: '1 day', category: 'Culture', tags: ['outdoor','culture','sport','museum'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/museum-ebike.jpg', highlights: ['6 km E-bike tour','Museum Pass for 7 museums','Cultural treasures','Hidden gems'], badge: null, rating: 4.7, reviewCount: 42, featured: false },
  { id: '31881', title: 'Famous Cathedral Notre Dame: Self-Guided Audio Tour', description: 'Explore the famous Cathedral Notre Dame of Luxembourg with a self-guided audio tour.', price: 4.99, duration: '45 minutes', category: 'Culture', tags: ['indoor','culture','self-guided','morning'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/cathedral-notre-dame.jpg', highlights: [], badge: 'Great Value', rating: 4.4, reviewCount: 67, featured: false },
  { id: '31882', title: 'Visit of the Brasserie Nationale Brewery', description: 'Discover the heart of Luxembourgish beer production with a guided tour of the Brasserie Nationale brewery.', price: 25, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','morning','beer'], city: 'Bascharage', provider: 'Brasserie Nationale', image: '/images/trips/brewery-visit.jpg', highlights: [], badge: null, rating: 4.7, reviewCount: 58, featured: false },
  { id: '31883', title: 'Brew Your Own Beer - De Brauatelier (max. 15 people)', description: 'A unique hands-on beer brewing workshop at the Brasserie Nationale. Brew your own beer from start to finish.', price: 89, duration: '4 hours', category: 'Food & Events', tags: ['indoor','food','morning','beer','premium'], city: 'Bascharage', provider: 'Brasserie Nationale', image: '/images/trips/brew-your-own.jpg', highlights: ['Hands-on brewing experience','Expert brewmaster guidance','Take your own beer home','Max 15 people'], badge: 'Unique', rating: 4.9, reviewCount: 34, featured: false },
  { id: '31884', title: 'Beer Drafting Course at the Brasserie Nationale', description: "Learn the art of pouring the perfect draft beer at Luxembourg's iconic Brasserie Nationale.", price: 30, duration: '1 hour', category: 'Food & Events', tags: ['indoor','food','beer'], city: 'Bascharage', provider: 'Brasserie Nationale', image: '/images/trips/beer-drafting.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 29, featured: false },
  { id: '31885', title: 'Tasting Session in the Brasserie Nationale', description: "Guided tasting of different beers brewed at the Brasserie Nationale, Luxembourg's largest brewery.", price: 20, duration: '1 hour', category: 'Food & Events', tags: ['indoor','food','beer','morning'], city: 'Bascharage', provider: 'Brasserie Nationale', image: '/images/trips/beer-tasting.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 41, featured: false },
  { id: '31890', title: 'Discover Luxembourg on 1-Day E-Bike Rentals', description: 'Rent a premium e-bike for the full day and discover Luxembourg at your own pace.', price: 35, duration: '1 day', category: 'Sports & Nature', tags: ['outdoor','sport','morning','nature','self-guided'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/e-bike-rental.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 63, featured: false },
  { id: '31891', title: 'Best Guided Walking Tour in Luxembourg City', description: 'Explore Luxembourg City with a professional guide. Visit the Grand Ducal Palace, Notre Dame Cathedral, and the historic fortifications.', price: 25, duration: '2.5 hours', category: 'Tours', tags: ['outdoor','morning','culture','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/walking-tour.jpg', highlights: [], badge: 'Top Rated', rating: 4.7, reviewCount: 203, featured: true },
  { id: '31893', title: 'Private Nature & Castle Day Tour (4 or 8 hours)', description: 'A private tour through Luxembourg\'s stunning nature and majestic castles. Fully customizable itinerary.', price: 320, duration: '4-8 hours', category: 'Private Tours', tags: ['outdoor','premium','culture','nature','castle','private'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/private-castle-tour.jpg', highlights: ['Private tour','Customizable itinerary','Vianden and Beaufort options','Professional driver-guide'], badge: 'Premium', rating: 4.9, reviewCount: 21, featured: false },
  { id: '31898', title: '3-Hour Food Tour: Uncover the Tastes of Luxembourg', description: 'Embark on a mouthwatering journey through Luxembourg City\'s most beloved culinary hotspots. Sample artisan cheeses, pastries, traditional dishes, and local wines.', price: 34, duration: '3 hours', category: 'Food & Events', tags: ['food','indoor','morning','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/food-tour.jpg', highlights: ['8+ tastings from local establishments','Hidden gems in the Grund neighborhood','Wine pairings with certified sommelier','Small group (max 12)'], badge: 'Bestseller', rating: 4.9, reviewCount: 127, featured: true },
  { id: '31932', title: 'Luxembourg City Bus Tour', description: 'See all the highlights of Luxembourg City from the comfort of a modern sightseeing bus with audio guide in 13 languages.', price: 20, duration: '2 hours', category: 'Tours', tags: ['outdoor','morning','popular','family','culture'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/city-bus-tour.jpg', highlights: [], badge: null, rating: 4.3, reviewCount: 189, featured: true },
  { id: '31962', title: 'Beaufort Guided E-Scooter Tours', description: 'Explore the stunning Mullerthal region around Beaufort on electric scooters with a local guide.', price: 49, duration: '2 hours', category: 'Sports & Nature', tags: ['outdoor','sport','adventure','nature'], city: 'Beaufort', provider: 'Sightseeing.lu', image: '/images/trips/e-scooter-beaufort.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 28, featured: false },
  { id: '32069', title: 'Wine Tasting - Caves des Vignerons de Grevenmacher', description: 'Explore the wine cellars and taste a selection of Luxembourgish wines from the Moselle Valley.', price: 15, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','wine','morning'], city: 'Grevenmacher', provider: 'Caves des Vignerons de Grevenmacher', image: '/images/trips/wine-tasting-grevenmacher.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 52, featured: false },
  { id: '32075', title: 'Wine Tasting - Caves du Sud Remerschen', description: 'Discover the wines of southern Luxembourg with a guided tasting at the Caves du Sud in Remerschen.', price: 15, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','wine','morning'], city: 'Remerschen', provider: 'Caves du Sud', image: '/images/trips/wine-tasting-remerschen.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 38, featured: false },
  { id: '32080', title: 'Wine Tasting - Caves de Wellenstein', description: 'Guided wine tasting in the charming village of Wellenstein along the Luxembourg Moselle.', price: 15, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','wine','morning'], city: 'Wellenstein', provider: 'Caves de Wellenstein', image: '/images/trips/wine-tasting-wellenstein.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 44, featured: false },
  { id: '32083', title: 'Wine Tasting - Caves des Crémants POLL-FABAIRE', description: "Taste Luxembourg's finest Crémants at POLL-FABAIRE, one of the country's most prestigious sparkling wine producers.", price: 15, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','wine','premium','morning'], city: 'Wormeldange', provider: 'POLL-FABAIRE', image: '/images/trips/wine-tasting-cremant.jpg', highlights: [], badge: null, rating: 4.7, reviewCount: 36, featured: false },
  { id: '32105', title: "Museums Mile: Explore Luxembourg's 7 Vibrant Museums", description: 'Access all 7 museums of Luxembourg City with a single Museum Pass. From modern art to ancient history.', price: 21, duration: '1-2 days', category: 'Culture', tags: ['indoor','culture','museum','family'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/museums-mile.jpg', highlights: [], badge: null, rating: 4.4, reviewCount: 97, featured: false },
  { id: '32208', title: 'Guided Tour of the Minett Trail', description: "Discover the industrial heritage of Luxembourg's south. The Minett region's iron ore and steel history shaped the country.", price: 15, duration: '2 hours', category: 'Tours', tags: ['outdoor','culture','nature','morning'], city: 'Esch-sur-Alzette', provider: 'Minett Trail', image: '/images/trips/minett-trail.jpg', highlights: [], badge: null, rating: 4.5, reviewCount: 19, featured: false },
  { id: '32222', title: 'Luxembourg City Bus Tour & 7 Museums Pass', description: 'Combine the Luxembourg City Bus Tour with access to all 7 museums with the Museum Pass.', price: 35, duration: '1-2 days', category: 'Tours', tags: ['outdoor','indoor','culture','museum','family','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/bus-tour-museum-pass.jpg', highlights: [], badge: 'Bundle Deal', rating: 4.5, reviewCount: 108, featured: true },
  { id: '32381', title: 'Explore the Best of Diekirch: Museums and Audio Guide', description: 'Discover the charming town of Diekirch with museum visits and an audio guide walking tour.', price: 12, duration: '2-3 hours', category: 'Culture', tags: ['indoor','culture','museum','self-guided'], city: 'Diekirch', provider: 'Sightseeing.lu', image: '/images/trips/diekirch-museums.jpg', highlights: [], badge: null, rating: 4.3, reviewCount: 33, featured: false },
  { id: '32485', title: 'Wine Tasting - Vinocity Luxembourg', description: 'Domaines Vinsmoselle invites you to explore a wide range of wines. An unforgettable journey into Luxembourgish winemaking.', price: 22, duration: '1.5 hours', category: 'Food & Events', tags: ['indoor','food','wine','morning'], city: 'Ehnen', provider: 'Domaines Vinsmoselle', image: '/images/trips/vinocity-wine.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 48, featured: false },
  { id: '32662', title: 'Taste Latin American Flavors on the Dinner Hopping Bus', description: 'Latin American culinary adventure aboard the retro American School Bus. 3-course dinner at 3 different restaurants.', price: 99, duration: '4 hours', category: 'Dinnerhopping', tags: ['indoor','food','night','premium','popular'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/dinner-hopping-latin.jpg', highlights: ['Latin American menu','3 restaurants in one evening','Retro American School Bus','VIP table option'], badge: null, rating: 4.7, reviewCount: 55, featured: true },
  { id: '32677', title: 'City E-Bike Luxembourg: Perfect for Nature Lovers', description: "An e-bike tour designed specifically for nature lovers, exploring Luxembourg City's green spaces and river valleys.", price: 55, duration: '3 hours', category: 'Sports & Nature', tags: ['outdoor','sport','nature','morning'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/e-bike-nature.jpg', highlights: [], badge: null, rating: 4.6, reviewCount: 37, featured: false },
  { id: '32678', title: "Luxembourg City: UNESCO E-Bike Tour", description: "Explore Luxembourg's UNESCO World Heritage sites by e-bike. Cover Bock Casemates, Grand Ducal Palace, and more.", price: 70, duration: '3 hours', category: 'Sports & Nature', tags: ['outdoor','sport','culture','morning'], city: 'Luxembourg', provider: 'Sightseeing.lu', image: '/images/trips/unesco-ebike.jpg', highlights: ['UNESCO World Heritage sites','Premium e-bikes','Expert guide','Panoramic views'], badge: null, rating: 4.8, reviewCount: 44, featured: false },
  { id: '33461', title: 'LOOK 360 Panorama - A Fantastic Experience at 71 Metres High!', description: 'The tallest mobile skylift in the world! A stunning 360-degree panoramic view of Luxembourg City from 71 metres.', price: 15, duration: '30 minutes', category: 'Tours', tags: ['outdoor','popular','family','adventure'], city: 'Luxembourg', provider: 'LOOK 360', image: '/images/trips/look-360.jpg', highlights: [], badge: 'New', rating: 4.9, reviewCount: 112, featured: true },
  { id: '33982', title: 'Museum A Possen - Entry Ticket', description: 'Discover the Museum A Possen in Bech-Kleinmacher in the municipality of Schengen. Living and working conditions from the 19th century.', price: 5, duration: '1.5 hours', category: 'Culture', tags: ['indoor','culture','museum','family'], city: 'Bech-Kleinmacher', provider: 'Museum A Possen', image: '/images/trips/museum-a-possen.jpg', highlights: [], badge: null, rating: 4.3, reviewCount: 26, featured: false },
]

async function seedTrips() {
  let count = 0
  for (const t of tripsData) {
    await query(
      `INSERT INTO trips (id, palisis_id, title, description, price, duration, category, tags, city, provider, image, highlights, badge, rating, review_count, featured, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'published')
       ON CONFLICT (id) DO NOTHING`,
      [t.id, t.id, t.title, t.description, t.price, t.duration, t.category, t.tags, t.city, t.provider, t.image, t.highlights, t.badge, t.rating, t.reviewCount, t.featured]
    )
    count++
  }
  console.log(`✓ trips seeded: ${count} rows`)
}

// ── Blog posts ─────────────────────────────────────────────────────────────

async function seedBlogPosts() {
  const posts = [
    { slug: 'top-10-hidden-gems-luxembourg', title: '10 Hidden Gems in Luxembourg You Probably Missed', excerpt: 'Beyond the Grand Ducal Palace and Casemates, Luxembourg is full of secret spots locals love.', body: 'Full article body goes here. Supports markdown.', image: '/images/trips/city-train.jpg', author: 'Sophie Martin', category: 'Travel Tips', tags: ['hidden gems','luxembourg','local tips'], status: 'published', published_at: '2026-03-04', read_time: '6 min read' },
    { slug: 'dinner-hopping-guide', title: 'The Ultimate Guide to Dinner Hopping in Luxembourg', excerpt: "What is dinner hopping and why is it Luxembourg's best-kept culinary secret?", body: 'Full article body goes here. Supports markdown.', image: '/images/trips/dinner-hopping-gourmet.jpg', author: 'Marc Dubois', category: 'Food & Drink', tags: ['food','dinner hopping','nightlife'], status: 'published', published_at: '2026-02-20', read_time: '8 min read' },
  ]
  for (const p of posts) {
    await query(
      `INSERT INTO blog_posts (slug, title, excerpt, body, image, author, category, tags, status, published_at, read_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.title, p.excerpt, p.body, p.image, p.author, p.category, p.tags, p.status, p.published_at, p.read_time]
    )
  }
  console.log(`✓ blog_posts seeded: ${posts.length} rows`)
}

// ── Jobs ───────────────────────────────────────────────────────────────────

async function seedJobs() {
  const jobs = [
    { title: 'Experienced Tour Guide', department: 'Operations', location: 'Luxembourg City', type: 'Freelance', description: 'Join our team of passionate local guides and share the stories of Luxembourg with visitors from around the world.', requirements: ['Fluency in English plus at least one of French, German, or Luxembourgish','Strong knowledge of Luxembourg history, culture, and gastronomy','Previous guiding or hospitality experience preferred'], status: 'open' },
    { title: 'Digital Marketing Manager', department: 'Marketing', location: 'Luxembourg City (hybrid)', type: 'Full-time', description: 'Drive awareness and bookings for sightseeing.lu through creative campaigns across SEO, social media, and email.', requirements: ['3+ years in digital marketing, ideally in travel or e-commerce','Hands-on experience with Google Ads, Meta Ads, and email platforms','Strong analytical skills and comfort with GA4 / Looker'], status: 'open' },
    { title: 'Full-Stack Developer', department: 'Technology', location: 'Remote (Luxembourg-based preferred)', type: 'Full-time', description: 'Help us build the best sightseeing discovery and booking platform in Luxembourg.', requirements: ['Proficiency in TypeScript, React / Next.js, and Node.js','Experience with REST APIs and third-party integrations','Interest in travel, tourism, or local experiences'], status: 'open' },
  ]
  for (const j of jobs) {
    await query(
      `INSERT INTO jobs (title, department, location, type, description, requirements, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [j.title, j.department, j.location, j.type, j.description, j.requirements, j.status]
    )
  }
  console.log(`✓ jobs seeded: ${jobs.length} rows`)
}

// ── Help articles ──────────────────────────────────────────────────────────

async function seedHelpArticles() {
  const articles = [
    { question: 'How do I book a trip?', answer: "Select your trip, click 'Add to Trip' or 'Book Now', and follow the checkout steps. You will receive a confirmation email once payment is complete.", category: 'Booking', sort_order: 1 },
    { question: 'Can I book for a group?', answer: 'Yes! During checkout you can specify the number of participants. For groups of 10 or more, contact info@sightseeing.lu for a tailored quote.', category: 'Booking', sort_order: 2 },
    { question: 'Do I need an account to book?', answer: 'No account is required. However, creating one makes it easier to manage bookings and access receipts.', category: 'Booking', sort_order: 3 },
    { question: 'Can I modify my booking after confirming?', answer: 'Most bookings can be modified up to 24 hours before the experience. Email info@sightseeing.lu with your booking reference.', category: 'Booking', sort_order: 4 },
    { question: 'What payment methods do you accept?', answer: 'We accept all major credit/debit cards (Visa, Mastercard, Amex) and PayPal. Payments are processed securely via our partner Palisis.', category: 'Payments', sort_order: 1 },
    { question: 'Is my payment secure?', answer: 'Yes. All transactions are processed via PCI-compliant systems. We never store your card details directly.', category: 'Payments', sort_order: 2 },
    { question: 'When is my card charged?', answer: 'Your card is charged immediately upon booking confirmation.', category: 'Payments', sort_order: 3 },
    { question: 'Can I pay in instalments?', answer: 'Currently we do not offer instalment plans. Full payment is required at the time of booking.', category: 'Payments', sort_order: 4 },
    { question: 'What is your cancellation policy?', answer: 'Most experiences offer a full refund if cancelled 24+ hours before start time. Cancellations within 24 hours are generally non-refundable. Each listing shows its specific policy.', category: 'Cancellation', sort_order: 1 },
    { question: 'How do I cancel my booking?', answer: 'Email info@sightseeing.lu with your booking reference and reason. We aim to respond within 2 business hours.', category: 'Cancellation', sort_order: 2 },
    { question: 'How long does a refund take?', answer: 'Refunds are processed within 5-10 business days depending on your bank or card provider.', category: 'Cancellation', sort_order: 3 },
    { question: 'What if the operator cancels?', answer: 'You will receive a full refund within 3 business days, or the option to rebook at no extra charge.', category: 'Cancellation', sort_order: 4 },
    { question: 'Are experiences wheelchair accessible?', answer: 'Accessibility varies by experience. Each listing includes accessibility notes. Contact us for specific advice.', category: 'Accessibility', sort_order: 1 },
    { question: 'Are experiences suitable for young children?', answer: "Many are family-friendly. Look for the 'family' tag on listings or contact us for age-specific recommendations.", category: 'Accessibility', sort_order: 2 },
    { question: 'Where is sightseeing.lu based?', answer: 'We are based in Luxembourg City and our experiences cover the entire Grand Duchy and some cross-border destinations.', category: 'General', sort_order: 1 },
    { question: 'How do I contact customer support?', answer: 'Email info@sightseeing.lu or use the AI chat on this page. We respond within a few hours, Mon-Sat, 9:00-18:00 CET.', category: 'General', sort_order: 2 },
    { question: 'Do you offer gift vouchers?', answer: 'Yes! Gift vouchers are available for any amount. Contact info@sightseeing.lu to purchase one.', category: 'General', sort_order: 3 },
  ]
  for (const a of articles) {
    await query(
      `INSERT INTO help_articles (question, answer, category, status, sort_order)
       VALUES ($1,$2,$3,'published',$4)`,
      [a.question, a.answer, a.category, a.sort_order]
    )
  }
  console.log(`✓ help_articles seeded: ${articles.length} rows`)
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log('Seeding database...')
    const adminId = await seedAdminUser()
    await seedTrips()
    await seedBlogPosts()
    await seedJobs()
    await seedHelpArticles()

    // Verify final counts
    const { rows } = await query(`
      SELECT 
        (SELECT COUNT(*) FROM admin_users)       as admin_users,
        (SELECT COUNT(*) FROM trips)             as trips,
        (SELECT COUNT(*) FROM blog_posts)        as blog_posts,
        (SELECT COUNT(*) FROM jobs)              as jobs,
        (SELECT COUNT(*) FROM help_articles)     as help_articles,
        (SELECT COUNT(*) FROM ai_system_configs) as ai_configs,
        (SELECT COUNT(*) FROM integrations)      as integrations,
        (SELECT COUNT(*) FROM header_footer_blocks) as hf_blocks,
        (SELECT COUNT(*) FROM pages)             as pages
    `)
    console.log('\n── Final row counts ──')
    console.table(rows[0])
    console.log('\n✓ All seeding complete!')
  } catch (err) {
    console.error('Seed error:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
