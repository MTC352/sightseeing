/**
 * lib/db/queries.ts
 * All database query helpers — replaces the in-memory Map operations
 * from lib/admin-store.ts. Shape of returned objects matches AdminTrip,
 * AdminPost, etc. so existing API handlers need minimal changes.
 */
import { query, queryOne } from "@/lib/db"

// ── Trips ──────────────────────────────────────────────────────────────────

export async function dbListTrips() {
  return query(`
    SELECT id, palisis_id, title, title_override, description, description_override,
           price::float, original_price::float as "originalPrice", duration, category, tags, city,
           provider, image, gallery, highlights, badge, rating::float, review_count as "reviewCount",
           permalink, google_business_url as "googleBusinessUrl",
           featured, featured_departure as "featuredDeparture", status, created_at, updated_at
    FROM trips ORDER BY created_at DESC
  `)
}

export async function dbGetTrip(id: string) {
  return queryOne(`
    SELECT id, palisis_id, title, title_override, description, description_override,
           price::float, original_price::float as "originalPrice", duration, category, tags, city,
           provider, image, gallery, highlights, badge, rating::float, review_count as "reviewCount",
           permalink, google_business_url as "googleBusinessUrl",
           featured, featured_departure as "featuredDeparture", status, created_at, updated_at
    FROM trips WHERE id = $1
  `, [id])
}

export async function dbCreateTrip(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO trips (id, palisis_id, title, description, price, original_price, duration, category,
      tags, city, provider, image, gallery, highlights, badge, rating, review_count,
      permalink, google_business_url, featured, featured_departure, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING *
  `, [
    data.id ?? String(Date.now()), data.id ?? String(Date.now()),
    data.title, data.description, data.price, data.originalPrice ?? null,
    data.duration, data.category, data.tags ?? [], data.city ?? 'Luxembourg',
    data.provider ?? null, data.image ?? null, data.gallery ?? null,
    data.highlights ?? [], data.badge ?? null, data.rating ?? 0,
    data.reviewCount ?? 0, data.permalink ?? null, data.googleBusinessUrl ?? null,
    data.featured ?? false, data.featuredDeparture ?? false, data.status ?? 'draft',
  ])
  return rows[0]
}

export async function dbUpdateTrip(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    title: 'title', titleOverride: 'title_override', description: 'description',
    descriptionOverride: 'description_override', price: 'price', originalPrice: 'original_price',
    duration: 'duration', category: 'category', tags: 'tags', city: 'city',
    provider: 'provider', image: 'image', gallery: 'gallery', highlights: 'highlights',
    badge: 'badge', rating: 'rating', reviewCount: 'review_count', permalink: 'permalink',
    googleBusinessUrl: 'google_business_url', featured: 'featured',
    featuredDeparture: 'featured_departure', status: 'status',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${i++}`)
      vals.push(data[key])
    }
  }
  if (sets.length === 0) return dbGetTrip(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(
    `UPDATE trips SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals
  )
  return rows[0] ?? null
}

export async function dbDeleteTrip(id: string) {
  await query(`DELETE FROM trips WHERE id = $1`, [id])
}

// ── Blog posts ─────────────────────────────────────────────────────────────

export async function dbListPosts() {
  return query(`
    SELECT id, slug, title, excerpt, body, image, author, category, tags,
           status, published_at as "publishedAt", read_time as "readTime",
           seo_title as "seoTitle", seo_description as "seoDescription",
           created_at, updated_at
    FROM blog_posts ORDER BY created_at DESC
  `)
}

export async function dbGetPost(id: string) {
  return queryOne(
    `SELECT id, slug, title, excerpt, body, image, author, category, tags,
            status, published_at as "publishedAt", read_time as "readTime",
            seo_title as "seoTitle", seo_description as "seoDescription",
            created_at, updated_at
     FROM blog_posts WHERE id = $1`, [id]
  )
}

export async function dbGetPostBySlug(slug: string) {
  return queryOne(
    `SELECT id, slug, title, excerpt, body, image, author, category, tags,
            status, published_at as "publishedAt", read_time as "readTime",
            seo_title as "seoTitle", seo_description as "seoDescription",
            created_at, updated_at
     FROM blog_posts WHERE slug = $1 AND status = 'published'`, [slug]
  )
}

export async function dbCreatePost(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO blog_posts (slug, title, excerpt, body, image, author, category, tags,
      status, published_at, read_time, seo_title, seo_description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
  `, [
    data.slug, data.title, data.excerpt ?? null, data.body ?? null,
    data.image ?? null, data.author ?? null, data.category ?? null,
    data.tags ?? [], data.status ?? 'draft',
    data.publishedAt ?? null, data.readTime ?? null,
    data.seoTitle ?? null, data.seoDescription ?? null,
  ])
  return rows[0]
}

export async function dbUpdatePost(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    slug: 'slug', title: 'title', excerpt: 'excerpt', body: 'body', image: 'image',
    author: 'author', category: 'category', tags: 'tags', status: 'status',
    publishedAt: 'published_at', readTime: 'read_time',
    seoTitle: 'seo_title', seoDescription: 'seo_description',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetPost(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeletePost(id: string) {
  await query(`DELETE FROM blog_posts WHERE id = $1`, [id])
}

// ── Jobs ───────────────────────────────────────────────────────────────────

export async function dbListJobs() {
  return query(`
    SELECT id, title, department, location, type, description, requirements,
           status, created_at as "createdAt", updated_at
    FROM jobs ORDER BY created_at DESC
  `)
}

export async function dbGetJob(id: string) {
  return queryOne(
    `SELECT id, title, department, location, type, description, requirements,
            status, created_at as "createdAt", updated_at
     FROM jobs WHERE id = $1`, [id]
  )
}

export async function dbCreateJob(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO jobs (title, department, location, type, description, requirements, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
  `, [
    data.title, data.department ?? null, data.location ?? null, data.type ?? 'Full-time',
    data.description ?? null, data.requirements ?? [], data.status ?? 'open',
  ])
  return rows[0]
}

export async function dbUpdateJob(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    title: 'title', department: 'department', location: 'location', type: 'type',
    description: 'description', requirements: 'requirements', status: 'status',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetJob(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteJob(id: string) {
  await query(`DELETE FROM jobs WHERE id = $1`, [id])
}

// ── Job Applications ───────────────────────────────────────────────────────

export async function dbListApplications(filters?: { jobId?: string; status?: string }) {
  let sql = `
    SELECT a.id, a.job_id as "jobId", j.title as "jobTitle",
           a.full_name as "fullName", a.email, a.phone,
           a.cover_letter as "coverLetter", a.resume_url as "resumeUrl",
           a.portfolio_url as "portfolioUrl", a.linkedin_url as "linkedinUrl",
           a.attachments, a.status, a.notes, a.created_at as "createdAt", a.updated_at
    FROM job_applications a JOIN jobs j ON j.id = a.job_id`
  const params: unknown[] = []
  const wheres: string[] = []
  if (filters?.jobId) { params.push(filters.jobId); wheres.push(`a.job_id = $${params.length}`) }
  if (filters?.status) { params.push(filters.status); wheres.push(`a.status = $${params.length}`) }
  if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`
  sql += ` ORDER BY a.created_at DESC`
  return query(sql, params)
}

export async function dbUpdateApplication(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if ('status' in data) { sets.push(`status = $${i++}`); vals.push(data.status) }
  if ('notes' in data) { sets.push(`notes = $${i++}`); vals.push(data.notes) }
  if (sets.length === 0) return null
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE job_applications SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteApplication(id: string) {
  await query(`DELETE FROM job_applications WHERE id = $1`, [id])
}

export async function dbCreateApplication(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO job_applications (job_id, full_name, email, phone, cover_letter,
      resume_url, portfolio_url, linkedin_url, attachments)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    data.jobId, data.fullName, data.email, data.phone ?? null,
    data.coverLetter, data.resumeUrl ?? null, data.portfolioUrl ?? null,
    data.linkedinUrl ?? null, JSON.stringify(data.attachments ?? []),
  ])
  return rows[0]
}

// ── Help Articles ──────────────────────────────────────────────────────────

export async function dbListHelpArticles() {
  return query(`
    SELECT id, question, answer, category, status,
           sort_order as "order", created_at as "createdAt", updated_at
    FROM help_articles ORDER BY category, sort_order
  `)
}

export async function dbGetHelpArticle(id: string) {
  return queryOne(`
    SELECT id, question, answer, category, status,
           sort_order as "order", created_at as "createdAt", updated_at
    FROM help_articles WHERE id = $1
  `, [id])
}

export async function dbCreateHelpArticle(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO help_articles (question, answer, category, status, sort_order)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [data.question, data.answer, data.category, data.status ?? 'published', data.order ?? 0])
  return rows[0]
}

export async function dbUpdateHelpArticle(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    question: 'question', answer: 'answer', category: 'category',
    status: 'status', order: 'sort_order',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetHelpArticle(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE help_articles SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteHelpArticle(id: string) {
  await query(`DELETE FROM help_articles WHERE id = $1`, [id])
}

// ── Support Tickets ────────────────────────────────────────────────────────

export async function dbListTickets(filters?: { status?: string }) {
  let sql = `
    SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
           t.author_name as "authorName", t.author_email as "authorEmail",
           t.author_role as "authorRole", t.assigned_to as "assignedTo",
           t.created_at as "createdAt", t.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', r.id, 'ticketId', r.ticket_id,
                 'authorName', r.author_name, 'authorRole', r.author_role,
                 'message', r.message, 'createdAt', r.created_at
               ) ORDER BY r.created_at
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) as replies
    FROM support_tickets t
    LEFT JOIN ticket_replies r ON r.ticket_id = t.id`
  const params: unknown[] = []
  if (filters?.status) { params.push(filters.status); sql += ` WHERE t.status = $1` }
  sql += ` GROUP BY t.id ORDER BY t.created_at DESC`
  return query(sql, params)
}

export async function dbGetTicket(id: string) {
  const rows = await query(`
    SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
           t.author_name as "authorName", t.author_email as "authorEmail",
           t.author_role as "authorRole", t.assigned_to as "assignedTo",
           t.created_at as "createdAt", t.updated_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', r.id, 'ticketId', r.ticket_id,
                 'authorName', r.author_name, 'authorRole', r.author_role,
                 'message', r.message, 'createdAt', r.created_at
               ) ORDER BY r.created_at
             ) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) as replies
    FROM support_tickets t
    LEFT JOIN ticket_replies r ON r.ticket_id = t.id
    WHERE t.id = $1
    GROUP BY t.id
  `, [id])
  return rows[0] ?? null
}

export async function dbCreateTicket(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO support_tickets (subject, description, category, priority, status,
      author_name, author_email, author_role)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    data.subject, data.description ?? null, data.category ?? 'other',
    data.priority ?? 'medium', data.status ?? 'open',
    data.authorName ?? 'Admin', data.authorEmail ?? 'admin@sightseeing.lu',
    data.authorRole ?? 'admin',
  ])
  return rows[0]
}

export async function dbUpdateTicket(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    status: 'status', priority: 'priority', assignedTo: 'assigned_to',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) { sets.push(`${col} = $${i++}`); vals.push(data[key]) }
  }
  if (sets.length === 0) return dbGetTicket(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeleteTicket(id: string) {
  await query(`DELETE FROM support_tickets WHERE id = $1`, [id])
}

export async function dbAddTicketReply(ticketId: string, data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO ticket_replies (ticket_id, author_name, author_role, message)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [ticketId, data.authorName ?? 'Admin', data.authorRole ?? 'admin', data.message])
  return rows[0]
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function dbGetSettings() {
  const [intRows, aiRows, hfRows] = await Promise.all([
    query(`SELECT key, value, meta FROM integrations`),
    query(`SELECT system_key, system_prompt, model, temperature::float, max_tokens, extra_config FROM ai_system_configs`),
    query(`SELECT name, label, placement, html, enabled FROM header_footer_blocks`),
  ])

  const apiKeys: Record<string, string> = {}
  let weglot: Record<string, unknown> = { originalLang: 'en', destinationLangs: [], showFlags: true }

  for (const row of intRows as Record<string, unknown>[]) {
    const key = row.key as string
    if (key === 'weglot' && row.meta && typeof row.meta === 'object' && Object.keys(row.meta as object).length > 0) {
      weglot = { ...(row.meta as Record<string, unknown>), apiKey: row.value ?? '' }
    } else {
      apiKeys[key] = (row.value as string) ?? ''
    }
  }

  const ai: Record<string, unknown> = {}
  let plannerBehavior: Record<string, unknown> = {
    model: 'openai/gpt-4o-mini', optimizationPriority: 'balanced',
    preferenceWeighting: 70, suggestionRandomness: 30, localFavoritesBias: 50,
    bufferTimeBetweenStops: 30, maxStopsPerDay: 5, defaultActivityDuration: 90,
    dayStartTime: '09:00', dayEndTime: '21:00', autoInsertMealBreaks: true,
    lunchBreakTime: '12:30', dinnerBreakTime: '19:00', mealBreakDuration: 60,
    travelTimeMethod: 'public_transport',
  }
  for (const r of aiRows as Record<string, unknown>[]) {
    ai[r.system_key as string] = {
      systemPrompt: r.system_prompt ?? '',
      model: r.model,
      temperature: r.temperature,
      maxTokens: r.max_tokens,
    }
    if (r.system_key === 'planner' && r.extra_config && typeof r.extra_config === 'object') {
      plannerBehavior = { ...plannerBehavior, ...(r.extra_config as Record<string, unknown>) }
    }
  }

  const headerBlocks = (hfRows as Record<string, unknown>[]).filter(b => b.placement !== 'body_end')
  const footerBlocks = (hfRows as Record<string, unknown>[]).filter(b => b.placement === 'body_end')
  const mergeHtml = (blocks: Record<string, unknown>[]) =>
    blocks.filter(b => b.enabled && b.html).map(b => `<!-- ${b.label} -->\n${b.html}`).join('\n\n')

  return { apiKeys, ai, plannerBehavior, weglot, header: { customHtml: mergeHtml(headerBlocks) }, footer: { customHtml: mergeHtml(footerBlocks) } }
}

export async function dbUpdateApiKeys(data: Record<string, string>) {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'weglot') continue
    await query(`UPDATE integrations SET value = $1, updated_at = NOW() WHERE key = $2`, [value, key])
  }
}

export async function dbUpdateWeglot(data: Record<string, unknown>) {
  const apiKey = (data.apiKey as string) ?? ''
  const meta = { ...data }
  delete meta.apiKey
  await query(`UPDATE integrations SET value = $1, meta = $2, updated_at = NOW() WHERE key = 'weglot'`, [apiKey, JSON.stringify(meta)])
}

export async function dbUpdateAiSystem(systemKey: string, config: Record<string, unknown>) {
  await query(`
    UPDATE ai_system_configs 
    SET system_prompt = COALESCE($1, system_prompt),
        model = COALESCE($2, model),
        temperature = COALESCE($3, temperature),
        max_tokens = COALESCE($4, max_tokens),
        updated_at = NOW()
    WHERE system_key = $5
  `, [config.systemPrompt ?? null, config.model ?? null, config.temperature ?? null, config.maxTokens ?? null, systemKey])
}

export async function dbUpdatePlannerBehavior(data: Record<string, unknown>) {
  await query(`
    UPDATE ai_system_configs 
    SET extra_config = $1, updated_at = NOW()
    WHERE system_key = 'planner'
  `, [JSON.stringify(data)])
}

export async function dbUpdateHeaderFooter(section: 'header' | 'footer', customHtml: string) {
  const placement = section === 'header' ? 'body_start' : 'body_end'
  const blockName = section === 'header' ? 'announcement_banner' : 'chat_widget'
  await query(`
    UPDATE header_footer_blocks 
    SET html = $1, enabled = ($1 != '' AND $1 IS NOT NULL), updated_at = NOW()
    WHERE name = $2
  `, [customHtml, blockName])
}

// ── Dashboard stats ────────────────────────────────────────────────────────

export async function dbGetDashboardStats() {
  const rows = await query(`
    SELECT
      (SELECT COUNT(*) FROM trips) as "totalTrips",
      (SELECT COUNT(*) FROM trips WHERE status = 'published') as "publishedTrips",
      (SELECT COUNT(*) FROM trips WHERE status = 'draft') as "draftTrips",
      (SELECT COUNT(*) FROM trips WHERE featured = true) as "featuredTrips",
      (SELECT COUNT(*) FROM blog_posts) as "totalPosts",
      (SELECT COUNT(*) FROM blog_posts WHERE status = 'published') as "publishedPosts",
      (SELECT COUNT(*) FROM jobs) as "totalJobs",
      (SELECT COUNT(*) FROM jobs WHERE status = 'open') as "openJobs",
      (SELECT COUNT(*) FROM job_applications) as "totalApplications",
      (SELECT COUNT(*) FROM job_applications WHERE status = 'new') as "newApplications",
      (SELECT COUNT(*) FROM support_tickets) as "totalTickets",
      (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') as "openTickets",
      (SELECT COUNT(*) FROM help_articles) as "totalHelpArticles"
  `)
  const r = rows[0] as Record<string, string>
  return {
    trips: { total: +r.totalTrips, published: +r.publishedTrips, draft: +r.draftTrips, featured: +r.featuredTrips },
    posts: { total: +r.totalPosts, published: +r.publishedPosts, draft: +r.totalPosts - +r.publishedPosts },
    jobs: { total: +r.totalJobs, open: +r.openJobs, closed: +r.totalJobs - +r.openJobs },
    applications: { total: +r.totalApplications, new: +r.newApplications },
    tickets: { total: +r.totalTickets, open: +r.openTickets },
    helpArticles: { total: +r.totalHelpArticles },
  }
}
