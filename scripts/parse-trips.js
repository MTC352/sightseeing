import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

// Try multiple possible locations for the CSV
const possiblePaths = [
  join(process.cwd(), 'scripts', 'trips.csv'),
  join(process.cwd(), 'trips.csv'),
  '/vercel/share/v0-project/scripts/trips.csv',
  '/home/user/scripts/trips.csv',
]

console.log('CWD:', process.cwd())
console.log('Looking for CSV in:', possiblePaths)

let csvPath = null
for (const p of possiblePaths) {
  if (existsSync(p)) {
    csvPath = p
    break
  }
}

if (!csvPath) {
  console.error('Could not find trips.csv in any of:', possiblePaths)
  process.exit(1)
}
console.log('Found CSV at:', csvPath)
const raw = readFileSync(csvPath, 'utf-8')

// Parse CSV with quoted fields (handles multiline quoted fields)
function parseCSV(text) {
  const rows = []
  let current = []
  let field = ''
  let inQuotes = false
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        current.push(field)
        field = ''
      } else if (ch === '\n') {
        current.push(field)
        field = ''
        if (current.length > 5) { // skip broken lines
          rows.push(current)
        }
        current = []
      } else if (ch !== '\r') {
        field += ch
      }
    }
  }
  if (current.length > 5) {
    current.push(field)
    rows.push(current)
  }
  return rows
}

const rows = parseCSV(raw)
const header = rows[0]

// Print header indices for key columns
const keyColumns = [
  'ID', 'Title', 'Permalink', 'Image URL', 'Image Alt Text',
  'Trip Region / Country', 'Language', 'Suitable For', 'Categories',
  'short-description', 'trip-highlights', 'included-in-the-offer',
  'not-included-in-the-offer', 'number-of-participants-per-group',
  'trip-price', 'trip-original-price', 'trip-review-score', 'trip-duration',
  'location-geo-city', 'provider', 'gallery', 'cover', 'location',
  'important-information-for-customers', 'customer-should-bring'
]

console.log('Total rows:', rows.length)
console.log('\nColumn mapping:')
for (const col of keyColumns) {
  const idx = header.indexOf(col)
  console.log(`  ${col}: index ${idx}`)
}

// Extract trips
function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseHighlights(raw) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return arr.map(h => h['highlight-item']).filter(Boolean)
  } catch {
    return []
  }
}

const trips = []
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const get = (name) => {
    const idx = header.indexOf(name)
    return idx >= 0 ? (r[idx] || '') : ''
  }
  
  const id = get('ID')
  const title = get('Title')
  if (!id || !title) continue
  
  const price = parseFloat(get('trip-price')) || 0
  const originalPrice = parseFloat(get('trip-original-price')) || 0
  const rating = parseFloat(get('trip-review-score')) || 0
  const ratingNormalized = rating > 5 ? (rating / 20) : rating  // convert from 100-scale if needed
  
  const categories = get('Categories').split('|').map(c => c.trim()).filter(Boolean)
  const city = get('location-geo-city') || ''
  const duration = get('trip-duration') || ''
  const image = get('Image URL') || get('cover') || ''
  const permalink = get('Permalink') || ''
  const shortDesc = stripHtml(get('short-description'))
  const highlights = parseHighlights(get('trip-highlights'))
  const included = stripHtml(get('included-in-the-offer'))
  const notIncluded = stripHtml(get('not-included-in-the-offer'))
  const maxGroup = get('number-of-participants-per-group')
  const languages = get('Language').split('|').map(l => l.trim()).filter(Boolean)
  const provider = get('provider') || ''
  const suitableFor = get('Suitable For').split('|').map(s => s.trim()).filter(Boolean)
  const region = get('Trip Region / Country') || ''
  const customerBring = stripHtml(get('customer-should-bring'))
  const importantInfo = stripHtml(get('important-information-for-customers'))
  const galleryRaw = get('gallery')
  
  // Parse location for coordinates
  let lat = null, lng = null
  const locRaw = get('location')
  if (locRaw) {
    try {
      const loc = JSON.parse(locRaw)
      lat = loc.latitude || null
      lng = loc.longitude || null
    } catch {}
  }

  trips.push({
    id,
    title,
    price,
    originalPrice: originalPrice > price ? originalPrice : null,
    rating: Math.round(ratingNormalized * 10) / 10,
    ratingOutOf100: Math.round(rating),
    duration,
    categories,
    city,
    region,
    image,
    permalink,
    shortDescription: shortDesc,
    highlights,
    included,
    notIncluded,
    maxGroup,
    languages,
    provider,
    suitableFor,
    customerBring,
    importantInfo,
    lat,
    lng,
  })
}

console.log(`\nParsed ${trips.length} trips`)
console.log('\nSample trip:')
console.log(JSON.stringify(trips[0], null, 2))
console.log('\nAll titles:')
trips.forEach(t => console.log(`  - [${t.id}] ${t.title} | ${t.price}€ | ${t.rating} | ${t.duration} | ${t.city} | ${t.categories.join(',')}`))

// Write output
const outPath = join(process.cwd(), 'lib', 'trips-data.json')
writeFileSync(outPath, JSON.stringify(trips, null, 2))
console.log('Output path:', outPath)
console.log('\nWritten to lib/trips-data.json')
