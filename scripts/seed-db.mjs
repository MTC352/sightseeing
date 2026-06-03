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
//
// The bootstrap admin account is created with a randomly-generated password
// that is printed once to stdout and never stored in this file.
// Change the password via the admin panel after first login.

import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

// The original bcrypt hash for the well-known default password "Admin1234!"
// that was shipped in the initial seed. Any account still using this hash
// must be force-reset to a new random password.
const LEGACY_KNOWN_HASH = '$2b$12$PO05akiDVS5qAVrdcDWOR.lk0XwmaoNgYO4/bPm7Qi2yQ6XTT8zrC'

// Idempotent migration: employee accounts (username login + per-section RBAC).
async function ensureUserManagementSchema() {
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS username text`)
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb`)
  await query(`ALTER TABLE admin_users ALTER COLUMN email DROP NOT NULL`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_unique ON admin_users (lower(username)) WHERE username IS NOT NULL`)
  console.log('✓ admin_users: username + permissions columns ensured')
}

// Idempotent migration: file-upload validation rules (global default +
// per-user overrides) and help-article document attachments.
async function ensureFileRulesSchema() {
  await query(`ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb`)
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS file_rules jsonb`)
  const def = JSON.stringify({ maxSizeMb: 25, allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'mp4', 'md', 'docx'] })
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('file_upload_rules', 'File Upload Rules', '', $1::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [def],
  )
  console.log('✓ file_upload_rules + help_articles.attachments + admin_users.file_rules ensured')
}

// Idempotent migration: media library (Files) table.
async function ensureMediaSchema() {
  await query(`CREATE TABLE IF NOT EXISTS media_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text NOT NULL,
    title text,
    url text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL DEFAULT 0,
    storage text NOT NULL DEFAULT 'local',
    content_hash text,
    uploaded_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`)
  await query(`ALTER TABLE media_files ADD COLUMN IF NOT EXISTS content_hash text`)
  await query(`CREATE INDEX IF NOT EXISTS media_files_created_idx ON media_files (created_at DESC)`)
  // Unique partial index enforces dedup atomically (race-safe). NULL hashes are
  // allowed to coexist (legacy rows without a computed hash).
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS media_files_hash_uniq ON media_files (content_hash) WHERE content_hash IS NOT NULL`)
  console.log('✓ media_files table ensured')
}

// Idempotent: seed the Active AI Provider selector (Task #15). Stored in the
// integrations table under key 'ai_provider'. Default 'anthropic'. The DB value
// is the *admin-selected* provider; resolveAi falls back to whichever provider
// actually has a key when this is unset.
async function ensureAiProviderDefault() {
  await query(
    `INSERT INTO integrations (key, label, value, meta)
     VALUES ('ai_provider', 'Active AI Provider', 'anthropic', '{}'::jsonb)
     ON CONFLICT (key) DO NOTHING`,
  )
  console.log('✓ ai_provider integration ensured (default: anthropic)')
}

async function seedAdminUser() {
  const existing = await query(`SELECT id, password_hash FROM admin_users WHERE email = $1`, ['admin@sightseeing.lu'])

  if (existing.rows.length > 0) {
    const row = existing.rows[0]
    // If the account still carries the publicly-known default password hash,
    // force-reset it to a fresh random password.
    if (row.password_hash === LEGACY_KNOWN_HASH) {
      const password = randomBytes(12).toString('base64url')
      const hash = await bcrypt.hash(password, 12)
      await query(`UPDATE admin_users SET password_hash = $1 WHERE id = $2`, [hash, row.id])
      console.log('✓ admin_users: legacy default password force-reset for id =', row.id)
      console.log('')
      console.log('╔══════════════════════════════════════════════════════╗')
      console.log('║  SECURITY: DEFAULT PASSWORD REPLACED — SAVE THIS    ║')
      console.log('║                                                      ║')
      console.log('║  Email:    admin@sightseeing.lu                      ║')
      console.log(`║  Password: ${password.padEnd(42)}║`)
      console.log('║                                                      ║')
      console.log('║  Change this password via the admin panel.           ║')
      console.log('╚══════════════════════════════════════════════════════╝')
      console.log('')
    } else {
      console.log('✓ admin_users: account already exists with non-default password, skipping (id =', row.id, ')')
    }
    return row.id
  }

  const password = randomBytes(12).toString('base64url')
  const hash = await bcrypt.hash(password, 12)

  await query(
    `INSERT INTO admin_users (email, name, password_hash, role) 
     VALUES ($1, $2, $3, 'superadmin')`,
    ['admin@sightseeing.lu', 'Admin', hash]
  )

  const { rows } = await query(`SELECT id FROM admin_users WHERE email = $1`, ['admin@sightseeing.lu'])
  console.log('✓ admin_users seeded, id =', rows[0].id)
  console.log('')
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║  BOOTSTRAP ADMIN CREDENTIALS — SAVE AND THEN DELETE ║')
  console.log('║                                                      ║')
  console.log('║  Email:    admin@sightseeing.lu                      ║')
  console.log(`║  Password: ${password.padEnd(42)}║`)
  console.log('║                                                      ║')
  console.log('║  Change this password immediately after first login. ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log('')
  return rows[0].id
}

// ── Trips ──────────────────────────────────────────────────────────────────
//
// NOTE: Trip seeding has been intentionally removed.
//
// Per replit.md → "Palisis/TourCMS is ONE-WAY ONLY", trips are sourced
// exclusively from TourCMS via the Palisis importer. There are no static
// trips in the codebase. To populate the `trips` table, run the importer:
//
//   Admin → Palisis → "Run import now"
//   or POST /api/admin/palisis-import { override: true }
//
// The legacy `tripsData` array (43 WordPress-export rows) was deleted.

async function seedTrips() {
  // Intentionally a no-op. Trips come from TourCMS via the Palisis importer.
  console.log("✓ trips seed skipped (use Palisis importer)")
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
       SELECT $1,$2,$3,'published',$4
       WHERE NOT EXISTS (
         SELECT 1 FROM help_articles WHERE question = $1 AND category = $3
       )`,
      [a.question, a.answer, a.category, a.sort_order]
    )
  }
  console.log(`✓ help_articles seeded: ${articles.length} rows`)
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Trip Tags — canonical tag catalog shared by:
 *   • trip edit form's "Suggested" picker
 *   • Trip Planner Chat onboarding "Interests"
 *   • homepage "Currently trending categories" grid
 */
async function seedTripTags() {
  await query(`
    CREATE TABLE IF NOT EXISTS trip_tags (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      show_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_trip_tags_homepage
      ON trip_tags (show_on_homepage, sort_order)
      WHERE show_on_homepage = TRUE
  `)

  const vocab = [
    ['adults-only','Adults only'],['animals','Animals'],['audio-guide','Audio guide'],
    ['beaches','Beaches'],['bike-tours','Bike tours'],['boat-tours','Boat tours'],
    ['city-cards','City cards'],['classes','Classes'],['day-trips','Day trips'],
    ['family-friendly','Family friendly'],['fast-track','Fast track'],['food','Food'],
    ['history','History'],['hop-on-hop-off','Hop on hop off'],['literature','Literature'],
    ['live-music','Live music'],['museums','Museums'],['nightlife','Nightlife'],
    ['outdoors','Outdoors'],['private-tours','Private tours'],['romantic','Romantic'],
    ['small-group-tours','Small group tours'],['sports','Sports'],
    ['suitable-for-solo','Suitable for solo'],['suitable-for-couples','Suitable for couples'],
    ['suitable-for-children','Suitable for children'],['suitable-for-groups','Suitable for groups'],
    ['suitable-for-students','Suitable for students'],['suitable-for-business','Suitable for business'],
    ['suitable-for-wheelchairs','Suitable for wheelchairs'],['theme-parks','Theme parks'],
    ['walking-tours','Walking tours'],['official-ticket','Official ticket'],
    ['operator-direct-product','Operator direct product'],['transfer','Transfer'],
    ['entrance-ticket','Entrance ticket'],
  ]
  const homepageDefaults = new Set([
    'food','sports','museums','walking-tours','day-trips','private-tours',
  ])
  for (let i = 0; i < vocab.length; i++) {
    const [slug, label] = vocab[i]
    await query(
      `INSERT INTO trip_tags (slug, label, show_on_homepage, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, label, homepageDefaults.has(slug), i],
    )
  }
  await query(`
    INSERT INTO trip_tags (slug, label, show_on_homepage, sort_order)
    SELECT DISTINCT tag, INITCAP(REPLACE(tag, '-', ' ')), FALSE, 999
      FROM (SELECT DISTINCT unnest(trip_tags) AS tag FROM trips WHERE status='published') t
     WHERE tag ~ '^[a-z0-9-]+$' AND tag NOT IN (SELECT slug FROM trip_tags)
    ON CONFLICT (slug) DO NOTHING
  `)
  console.log('  ✓ trip_tags seeded')
}

async function seedErrorLogs() {
  await query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'error',
      message TEXT NOT NULL,
      status_code INTEGER,
      context JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs (source, created_at DESC)`)
}

async function seedActivityLog() {
  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID,
      user_name TEXT,
      user_email TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      summary TEXT NOT NULL,
      context JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log (user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action, created_at DESC)`)
}

async function main() {
  try {
    console.log('Seeding database...')
    await ensureUserManagementSchema()
    await ensureFileRulesSchema()
    await ensureMediaSchema()
    await ensureAiProviderDefault()
    const adminId = await seedAdminUser()
    await seedTrips()
    await seedBlogPosts()
    await seedJobs()
    await seedHelpArticles()
    await seedTripTags()
    await seedErrorLogs()
    await seedActivityLog()

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
        (SELECT COUNT(*) FROM pages)             as pages,
        (SELECT COUNT(*) FROM trip_tags)         as trip_tags
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
