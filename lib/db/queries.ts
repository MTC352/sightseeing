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
    FROM trips WHERE status != 'archived' ORDER BY created_at DESC
  `)
}

export async function dbListArchivedTrips() {
  return query(`
    SELECT id, palisis_id, title, title_override, description, description_override,
           price::float, original_price::float as "originalPrice", duration, category, tags, city,
           provider, image, gallery, highlights, badge, rating::float, review_count as "reviewCount",
           permalink, google_business_url as "googleBusinessUrl",
           featured, featured_departure as "featuredDeparture", status, created_at, updated_at
    FROM trips WHERE status = 'archived' ORDER BY created_at DESC
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
  // palisisId = TourCMS tour_id (external identity). id = our internal PK.
  // For seed data from lib/data.ts, callers pass `id` only and we use it for both
  // (preserves the legacy id==palisis_id contract for static seed trips).
  // For TourCMS imports, callers pass `palisisId` separately and we generate a
  // fresh id so two tours imported in the same millisecond cannot collide.
  const palisisId = (data.palisisId ?? data.id) as string | undefined
  const tripId    = (data.id as string | undefined)
                 ?? (palisisId ? `tcms_${palisisId}` : `t_${Date.now()}_${Math.random().toString(36).slice(2,8)}`)
  const rows = await query(`
    INSERT INTO trips (id, palisis_id, title, description, price, original_price, duration, category,
      tags, city, provider, image, gallery, highlights, badge, rating, review_count,
      permalink, google_business_url, featured, featured_departure, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING *
  `, [
    tripId, palisisId ?? tripId,
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

function generateSlug(title: string): string {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base || `post-${Date.now()}`
  let suffix = 0
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`
    const rows = await query(
      `SELECT id FROM blog_posts WHERE slug = $1${excludeId ? ' AND id != $2' : ''}`,
      excludeId ? [candidate, excludeId] : [candidate]
    )
    if (rows.length === 0) return candidate
    suffix++
  }
}

export async function dbCreatePost(data: Record<string, unknown>) {
  const baseSlug = data.slug ? generateSlug(String(data.slug)) : generateSlug(String(data.title ?? ''))
  const slug = await uniqueSlug(baseSlug)
  const rows = await query(`
    INSERT INTO blog_posts (slug, title, excerpt, body, image, author, category, tags,
      status, published_at, read_time, seo_title, seo_description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
  `, [
    slug, data.title, data.excerpt ?? null, data.body ?? null,
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

// ── Taxonomies ─────────────────────────────────────────────────────────────

export async function dbListTaxonomies() {
  return query(`
    SELECT id, key, label, value, group_key as "groupKey", created_at, updated_at
    FROM taxonomies ORDER BY group_key, key
  `)
}

export async function dbGetTaxonomy(key: string) {
  return queryOne(`SELECT id, key, label, value, group_key as "groupKey" FROM taxonomies WHERE key = $1`, [key])
}

export async function dbCreateTaxonomy(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO taxonomies (key, label, value, group_key)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [data.key, data.label ?? data.key, data.value ?? '', data.groupKey ?? (String(data.key).split('_')[0])])
  return rows[0]
}

export async function dbUpsertTaxonomies(items: { key: string; value: string }[]) {
  let count = 0
  for (const item of items) {
    await query(`
      INSERT INTO taxonomies (key, label, value, group_key)
      VALUES ($1,$1,$2,$3)
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [item.key, item.value, item.key.split('_')[0]])
    count++
  }
  return count
}

export async function dbDeleteTaxonomy(key: string) {
  await query(`DELETE FROM taxonomies WHERE key = $1`, [key])
}

// ── Pages ──────────────────────────────────────────────────────────────────

export async function dbListPages() {
  return query(`
    SELECT id, slug, title, description, url, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription",
           created_at, updated_at
    FROM pages ORDER BY is_system_page DESC, title
  `)
}

export async function dbGetPage(id: string) {
  return queryOne(`
    SELECT id, slug, title, description, url, content, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription", og_image as "ogImage",
           template, created_at, updated_at
    FROM pages WHERE id = $1
  `, [id])
}

export async function dbGetPageBySlug(slug: string) {
  return queryOne(`
    SELECT id, slug, title, description, url, content, status, is_system_page as "isSystemPage",
           seo_title as "seoTitle", seo_description as "seoDescription"
    FROM pages WHERE slug = $1
  `, [slug])
}

export async function dbCreatePage(data: Record<string, unknown>) {
  const rows = await query(`
    INSERT INTO pages (slug, title, description, url, content, status, is_system_page, seo_title, seo_description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [
    data.slug, data.title, data.description ?? null, data.url ?? ('/' + data.slug),
    JSON.stringify(data.content ?? {}), data.status ?? 'draft',
    data.isSystemPage ?? false, data.seoTitle ?? null, data.seoDescription ?? null,
  ])
  return rows[0]
}

export async function dbUpdatePage(id: string, data: Record<string, unknown>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', url: 'url', status: 'status',
    content: 'content', seoTitle: 'seo_title', seoDescription: 'seo_description', ogImage: 'og_image',
  }
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${i++}`)
      vals.push(key === 'content' ? JSON.stringify(data[key]) : data[key])
    }
  }
  if (sets.length === 0) return dbGetPage(id)
  sets.push(`updated_at = NOW()`)
  vals.push(id)
  const rows = await query(`UPDATE pages SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals)
  return rows[0] ?? null
}

export async function dbDeletePage(id: string) {
  await query(`DELETE FROM pages WHERE id = $1`, [id])
}

export async function dbGetPageRevisions(pageId: string) {
  return query(`
    SELECT id, page_id as "pageId", revision_number as "revisionNumber",
           title, label, status, created_at, created_by as "createdBy"
    FROM page_revisions WHERE page_id = $1 ORDER BY revision_number DESC
  `, [pageId])
}

export async function dbCreatePageRevision(pageId: string, data: Record<string, unknown>, label?: string) {
  const maxRows = await query(`SELECT COALESCE(MAX(revision_number), 0) as max FROM page_revisions WHERE page_id = $1`, [pageId])
  const nextNum = (parseInt((maxRows[0] as Record<string, string>).max, 10) || 0) + 1
  const rows = await query(`
    INSERT INTO page_revisions (page_id, revision_number, title, content, status, seo_title, seo_description, label)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [
    pageId, nextNum, data.title ?? null,
    JSON.stringify(data.content ?? {}), data.status ?? 'published',
    data.seoTitle ?? null, data.seoDescription ?? null, label ?? 'Auto-save',
  ])
  return rows[0]
}

export async function dbRestorePageRevision(pageId: string, revisionId: string) {
  const rev = await queryOne(`SELECT * FROM page_revisions WHERE id = $1 AND page_id = $2`, [revisionId, pageId])
  if (!rev) return null
  const r = rev as Record<string, unknown>
  await dbUpdatePage(pageId, { title: r.title, content: r.content, status: r.status, seoTitle: r.seo_title, seoDescription: r.seo_description })
  const newRev = await dbCreatePageRevision(pageId, r, `Restored from revision #${r.revision_number}`)
  return newRev
}

// ── Page content ───────────────────────────────────────────────────────────

export async function dbGetPageContent(slug: string) {
  const rows = await query(`
    SELECT element_id, content FROM page_content WHERE page_slug = $1
  `, [slug])
  const result: Record<string, string> = {}
  for (const row of rows as { element_id: string; content: string }[]) {
    result[row.element_id] = row.content
  }
  return result
}

export async function dbSavePageContent(pageSlug: string, changes: Record<string, string>) {
  let saved = 0
  for (const [elementId, content] of Object.entries(changes)) {
    await query(`
      INSERT INTO page_content (page_slug, element_id, content)
      VALUES ($1,$2,$3)
      ON CONFLICT (page_slug, element_id) DO UPDATE SET content = $3, updated_at = NOW()
    `, [pageSlug, elementId, content])
    saved++
  }
  return saved
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

// ── Departures ─────────────────────────────────────────────────────────────

export async function dbListDepartures() {
  return query(`
    SELECT id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
           category, city, to_char(date, 'YYYY-MM-DD') as date,
           to_char(time, 'HH24:MI') as time,
           spots_total as "spotsTotal", spots_booked as "spotsBooked",
           guide_id as "guideId", guide_name as "guideName",
           status, price::float, created_at as "createdAt"
    FROM departures ORDER BY date ASC, time ASC
  `)
}

export async function dbGetDeparture(id: string) {
  return queryOne<Record<string, unknown>>(`
    SELECT id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
           category, city, to_char(date, 'YYYY-MM-DD') as date,
           to_char(time, 'HH24:MI') as time,
           spots_total as "spotsTotal", spots_booked as "spotsBooked",
           guide_id as "guideId", guide_name as "guideName",
           status, price::float
    FROM departures WHERE id = $1
  `, [id])
}

export async function dbCreateDeparture(data: Record<string, unknown>) {
  return queryOne<Record<string, unknown>>(`
    INSERT INTO departures (trip_id, trip_title, trip_image, category, city, date, time,
                            spots_total, spots_booked, guide_id, guide_name, status, price)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, trip_id as "tripId", trip_title as "tripTitle", trip_image as "tripImage",
              category, city, to_char(date, 'YYYY-MM-DD') as date,
              to_char(time, 'HH24:MI') as time,
              spots_total as "spotsTotal", spots_booked as "spotsBooked",
              guide_id as "guideId", guide_name as "guideName",
              status, price::float
  `, [
    data.tripId ?? "", data.tripTitle ?? "", data.tripImage ?? "",
    data.category ?? "Tours", data.city ?? "Luxembourg",
    data.date ?? new Date().toISOString().slice(0,10),
    data.time ?? "09:00",
    data.spotsTotal ?? 20, data.spotsBooked ?? 0,
    data.guideId ?? "", data.guideName ?? "",
    data.status ?? "scheduled",
    data.price ?? 0,
  ])
}

export async function dbUpdateDeparture(id: string, data: Record<string, unknown>) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1
  const map: Record<string, string> = {
    tripId: "trip_id", tripTitle: "trip_title", tripImage: "trip_image",
    category: "category", city: "city", date: "date", time: "time",
    spotsTotal: "spots_total", spotsBooked: "spots_booked",
    guideId: "guide_id", guideName: "guide_name", status: "status", price: "price",
  }
  for (const [k, col] of Object.entries(map)) {
    if (k in data) { fields.push(`${col} = $${i++}`); values.push(data[k]) }
  }
  if (!fields.length) return dbGetDeparture(id)
  fields.push(`updated_at = NOW()`)
  values.push(id)
  return queryOne<Record<string, unknown>>(
    `UPDATE departures SET ${fields.join(", ")} WHERE id = $${i} RETURNING id`,
    values
  )
}

export async function dbDeleteDeparture(id: string) {
  return query(`DELETE FROM departures WHERE id = $1`, [id])
}

// ── Integrations (dedicated table) ────────────────────────────────────────

export async function dbListIntegrations() {
  return query(`SELECT key, label, value, updated_at FROM integrations ORDER BY label`)
}

export async function dbGetIntegration(key: string) {
  return queryOne<{ key: string; label: string; value: string }>(
    `SELECT key, label, value FROM integrations WHERE key = $1`, [key]
  )
}

export async function dbUpsertIntegration(key: string, label: string, value: string) {
  return queryOne<{ key: string }>(
    `INSERT INTO integrations (key, label, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label, updated_at = NOW()
     RETURNING key`,
    [key, label, value]
  )
}

// ── Palisis Sync Log ─────────────────────────────────────────────────────────

export async function dbInsertPalisisSyncLog(data: {
  trigger_type: string
  action: string
  note?: string
  changes?: Record<string, unknown>
  palisis_id?: string
  triggered_by?: string
}) {
  return queryOne(
    `INSERT INTO palisis_sync_log (id, trigger_type, palisis_id, action, changes, triggered_by, note, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::uuid, $6, NOW())
     RETURNING id`,
    [
      data.trigger_type,
      data.palisis_id ?? null,
      data.action,
      data.changes ? JSON.stringify(data.changes) : null,
      data.triggered_by ?? null,
      data.note ?? null,
    ]
  )
}

export async function dbListPalisisSyncLogs(limit = 20, offset = 0) {
  return query<{
    id: string
    trigger_type: string
    palisis_id: string | null
    action: string
    changes: Record<string, unknown> | null
    note: string | null
    created_at: string
  }>(
    `SELECT id, trigger_type, palisis_id, action, changes, note, created_at
     FROM palisis_sync_log
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
}

export async function dbCountPalisisSyncLogs() {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM palisis_sync_log`,
    []
  )
  return parseInt(rows[0]?.count ?? "0", 10)
}
