import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const ADMIN_ID = "4102ea5d-fd01-4182-b08b-c751d663cd21"

const articles = [
  // ── Dashboard ─────────────────────────────────────────────────────────
  {
    category: "Admin: Dashboard",
    sort_order: 1,
    question: "What does the admin dashboard show?",
    answer: `The dashboard gives you a real-time snapshot of the whole site.

1. Go to /admin — it is the first page after logging in.
2. The top row shows key counts: total trips, published blog posts, open jobs, and pending support tickets.
3. The Recent Tickets panel lists the 5 newest support tickets with their status and creation date.
4. Numbers update every time you navigate to the dashboard — refresh the page to get the latest figures.`,
  },
  {
    category: "Admin: Dashboard",
    sort_order: 2,
    question: "How do I jump from the dashboard to a specific section quickly?",
    answer: `Use the left-hand sidebar navigation.

1. The sidebar is always visible on the left side of every admin page.
2. Click Trips, Blog, Jobs, Help, Tickets, Pages, or any other item to go straight to that section.
3. Click the sightseeing.lu logo at the top of the sidebar to return to the dashboard at any time.`,
  },

  // ── Trips ─────────────────────────────────────────────────────────────
  {
    category: "Admin: Trips",
    sort_order: 1,
    question: "How do I feature a trip on the homepage?",
    answer: `Featured trips are highlighted in the "Top Experiences" section of the public homepage.

1. Go to Admin > Trips (/admin/trips).
2. Find the trip you want to feature and click its title to open the detail editor.
3. Scroll to the Status & Visibility section.
4. Toggle the "Featured" switch to ON.
5. Click Save. The trip will now appear in the featured carousel on the homepage.

Tip: you can feature up to 6 trips at once. To un-feature a trip, repeat the steps and toggle Featured to OFF.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 2,
    question: "How do I edit a trip's title, description, or price?",
    answer: `All core trip fields are editable in the trip detail editor.

1. Go to Admin > Trips and click the trip you want to edit.
2. Update any of the fields in the form: Title, Short Description, Long Description, Price, Original Price (for showing a strikethrough), Duration, or Category.
3. Click Save Changes at the bottom of the form.
4. The public trip page and any API responses will reflect the new values immediately.

Note: if the trip was imported from Palisis, the next Palisis sync will overwrite fields that come from the Palisis catalog (title, price, description). Edit Palisis-owned fields in TourCMS first, then re-sync.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 3,
    question: "How do I add or remove tags from a trip?",
    answer: `Tags control how the AI planner categorises trips and which trips appear in interest-based searches.

1. Open the trip editor (Admin > Trips > click a trip).
2. Scroll to the Tags section.
3. Click any tag chip to toggle it on or off. Selected tags are highlighted.
4. You can also type in the search box to filter the tag list.
5. Click Save Changes. Tag changes take effect immediately for the AI planner and the Explore page filters.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 4,
    question: "How do I change a trip's hero image or gallery photos?",
    answer: `Trip images are stored as URLs in the database.

1. Open the trip editor (Admin > Trips > click a trip).
2. Scroll to the Images section.
3. Paste a direct image URL (HTTPS) into the Main Image field. This is the photo shown on cards and at the top of the trip detail page.
4. Add extra gallery image URLs in the Additional Images field, one per line.
5. Click Save Changes.

Tip: use a CDN-hosted or Vercel Blob URL for fast loading. Avoid hotlinking from third-party sites as those links can break.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 5,
    question: "How do I mark a trip as active or inactive?",
    answer: `Inactive trips are hidden from the public site but remain in the database.

1. Open the trip editor (Admin > Trips > click a trip).
2. Find the Status field (a dropdown or toggle at the top of the form).
3. Set it to Active to show the trip publicly, or Inactive to hide it.
4. Click Save Changes.

Inactive trips still appear in the admin trips list so you can re-activate them later.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 6,
    question: "How do I add trip highlights, inclusions, and exclusions?",
    answer: `These structured fields appear in the "What's Included" section on the public trip detail page.

1. Open the trip editor and scroll to the Highlights / Included / Excluded section.
2. Enter each highlight on its own line in the Highlights box.
3. Do the same for Included items (e.g. "Guided commentary", "Hotel pick-up") and Excluded items (e.g. "Lunch", "Tips").
4. Click Save Changes.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 7,
    question: "How do I set trip departure location, languages, and restrictions?",
    answer: `These details appear in the trip sidebar on the public detail page.

1. Open the trip editor and scroll to the Details section.
2. Fill in Departure Location (the meeting point address or landmark).
3. Add spoken Languages (e.g. "English, French, German").
4. Add any Age Restrictions or physical requirements in the Restrictions field.
5. Set Min / Max Booking Size if the trip has group limits.
6. Click Save Changes.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 8,
    question: "How do I manually sync a single trip from Palisis/TourCMS?",
    answer: `You can pull the latest data for one trip from Palisis without running a full catalog import.

1. Open the trip editor for the trip you want to sync.
2. Click the "Sync from Palisis" button (top-right of the editor).
3. The system fetches the latest data from TourCMS and overwrites the local DB row for that trip.
4. A success or error message appears. If you see an error, check that your Palisis API key is saved in Admin > Integrations.

This is useful when a price or description changes in TourCMS and you need it live immediately rather than waiting for the next automatic sync.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 9,
    question: "How do I set a trip's cancellation policy?",
    answer: `The cancellation policy is displayed on the trip detail page and in the booking flow.

1. Open the trip editor (Admin > Trips > click the trip).
2. Scroll to the Cancellation Policy field.
3. Enter the policy text — for example: "Free cancellation up to 24 hours before the tour. No refund within 24 hours of the start time."
4. Toggle Non-Refundable to ON if the trip cannot be cancelled under any circumstances.
5. Click Save Changes.`,
  },
  {
    category: "Admin: Trips",
    sort_order: 10,
    question: "How do I duplicate a trip to use it as a template for a new one?",
    answer: `There is no one-click duplicate button, but you can create a new trip and copy fields manually.

1. Open the trip you want to base the new one on and note its details.
2. Go to Admin > Trips and click "New Trip".
3. Fill in the fields, copying from the original trip where relevant.
4. Change the Title, Slug, and any fields that differ.
5. Click Save.

Tip: if the new trip will also come from Palisis, it is faster to run a Palisis import (Admin > Palisis > Import Full Catalog) and let the system create it automatically.`,
  },

  // ── Blog ──────────────────────────────────────────────────────────────
  {
    category: "Admin: Blog",
    sort_order: 1,
    question: "How do I create a new blog post?",
    answer: `Blog posts are published to the /blog section of the public site.

1. Go to Admin > Blog (/admin/blog).
2. Click "New Post" (top-right button).
3. Fill in the Title, Slug (URL-friendly version of the title — auto-generated but editable), Excerpt, and Body content.
4. Choose a Category and add Tags.
5. Set Status to Draft to save without publishing, or Published to make it live immediately.
6. Click Save. The post appears at /blog/[slug] when published.`,
  },
  {
    category: "Admin: Blog",
    sort_order: 2,
    question: "How do I generate blog post content with AI?",
    answer: `The blog editor has a built-in AI writing assistant.

1. Open a blog post (create a new one or open an existing draft).
2. Type a prompt in the AI Generate field — for example: "Write a 400-word post about the best day trips from Luxembourg City in autumn."
3. Click Generate. The AI fills in the Body field with a full draft.
4. Review, edit, and adjust the draft as needed.
5. Set Status to Published and click Save when you are happy with the result.

Tip: the more specific your prompt, the better the output. Include the target audience, tone (friendly, professional), and any key points you want covered.`,
  },
  {
    category: "Admin: Blog",
    sort_order: 3,
    question: "How do I add a featured image to a blog post?",
    answer: `The featured image appears at the top of the post and as the thumbnail on the blog listing page.

1. Open the blog post editor.
2. Find the Featured Image field.
3. Paste a direct HTTPS image URL into the field.
4. Click Save. The image will be shown on /blog and at the top of /blog/[slug].`,
  },
  {
    category: "Admin: Blog",
    sort_order: 4,
    question: "How do I publish, unpublish, or draft a blog post?",
    answer: `The Status field controls visibility on the public site.

1. Open the blog post editor.
2. Find the Status dropdown.
3. Select Published to make the post live now, or Draft to keep it hidden from visitors.
4. Click Save.

Note: there is no built-in scheduler. To publish at a specific time, save as Draft and manually change to Published at your chosen moment.`,
  },
  {
    category: "Admin: Blog",
    sort_order: 5,
    question: "How do I edit a blog post's slug or category?",
    answer: `1. Open the blog post editor (Admin > Blog > click the post title).
2. The Slug field is editable — update it to change the URL.
   Caution: changing a slug breaks any existing links to the old URL.
3. Change the Category using the dropdown or text field.
4. Click Save Changes.`,
  },
  {
    category: "Admin: Blog",
    sort_order: 6,
    question: "How do I add SEO metadata (meta title, meta description) to a blog post?",
    answer: `SEO fields help search engines understand and rank the post.

1. Open the blog post editor.
2. Scroll to the SEO section (below the main content area).
3. Fill in Meta Title (ideally 50–60 characters) and Meta Description (ideally 120–160 characters).
4. Click Save. The values are injected into the page's <head> when the post is published.`,
  },

  // ── Jobs ──────────────────────────────────────────────────────────────
  {
    category: "Admin: Jobs",
    sort_order: 1,
    question: "How do I add a new job listing?",
    answer: `Job listings appear on the public /careers page.

1. Go to Admin > Jobs (/admin/jobs).
2. Click "New Job".
3. Fill in Title, Department, Location, Type (Full-time / Part-time / Contract), and Description.
4. Add a Requirements list and a Benefits list — one item per line.
5. Set Status to Active to publish immediately, or Draft to save without showing it.
6. Click Save. The listing appears on /careers immediately when Status is Active.`,
  },
  {
    category: "Admin: Jobs",
    sort_order: 2,
    question: "How do I close or deactivate a job listing?",
    answer: `1. Go to Admin > Jobs and click the job you want to close.
2. Change Status from Active to Closed (or Inactive).
3. Click Save. The listing disappears from /careers but remains in the admin list.

You can reactivate it at any time by setting Status back to Active.`,
  },
  {
    category: "Admin: Jobs",
    sort_order: 3,
    question: "How do I review job applications?",
    answer: `1. Go to Admin > Jobs > Applications (/admin/jobs/applications).
2. You will see a list of all applications across all job listings, sorted by date (newest first).
3. Click any application to open it and read the applicant's name, email, cover letter, and any attached CV link.
4. Use the Status dropdown to update the application to Under Review, Shortlisted, Rejected, or Hired.`,
  },
  {
    category: "Admin: Jobs",
    sort_order: 4,
    question: "How do I update an application's status?",
    answer: `1. Open the application (Admin > Jobs > Applications > click applicant name).
2. Find the Status dropdown.
3. Choose the appropriate status: New, Under Review, Shortlisted, Rejected, or Hired.
4. Click Save. The status change is stored with a timestamp.`,
  },
  {
    category: "Admin: Jobs",
    sort_order: 5,
    question: "How do I filter applications by job or status?",
    answer: `1. Go to Admin > Jobs > Applications.
2. Use the Job filter dropdown (if shown) to see applications for one specific listing.
3. Use the Status filter to show only applications in a given state (e.g. Shortlisted).
4. Applications are sorted newest-first by default.`,
  },

  // ── Help & FAQ ────────────────────────────────────────────────────────
  {
    category: "Admin: Help & FAQ",
    sort_order: 1,
    question: "How do I add a new help article?",
    answer: `Help articles power the public /help page and the AI help chat.

1. Go to Admin > Help (/admin/help).
2. Click "New Article".
3. Fill in the Question (the heading visitors search for) and the Answer (a clear, step-by-step response).
4. Choose a Category from the dropdown — this groups articles on the /help page (e.g. Booking, Cancellation, Payments).
5. Set Status to Published to make it live, or Draft to save privately.
6. Click Save.`,
  },
  {
    category: "Admin: Help & FAQ",
    sort_order: 2,
    question: "How do I organise help articles into categories?",
    answer: `Categories are free-text labels you set per article — they control how articles are grouped on /help.

1. Open any article and set its Category field to the group name you want (e.g. "Booking", "Cancellation", "Getting Here").
2. All articles sharing the same category text are automatically grouped together on the public help page.
3. To rename a category, update the Category field on every article in that group.

Tip: keep category names short and consistent — even a small spelling difference creates a separate group.`,
  },
  {
    category: "Admin: Help & FAQ",
    sort_order: 3,
    question: "How do I reorder help articles within a category?",
    answer: `1. Open the article you want to reposition (Admin > Help > click the article).
2. Find the Sort Order field (a number).
3. Set a lower number to move the article higher within its category (1 = first).
4. Click Save.
5. Repeat for other articles until the order looks right on the public /help page.`,
  },
  {
    category: "Admin: Help & FAQ",
    sort_order: 4,
    question: "How do I unpublish or delete a help article?",
    answer: `To hide without deleting:
1. Open the article and change Status to Draft.
2. Click Save — the article disappears from /help immediately.

To permanently delete:
1. Open the article.
2. Click the Delete button (bottom of the editor or in the actions menu).
3. Confirm the prompt. Deletion is permanent and cannot be undone.`,
  },

  // ── Support Tickets ───────────────────────────────────────────────────
  {
    category: "Admin: Tickets",
    sort_order: 1,
    question: "How do I view and reply to a customer support ticket?",
    answer: `1. Go to Admin > Tickets (/admin/tickets).
2. The list shows all tickets sorted by date, with a Status badge (Open, In Progress, Resolved, Closed).
3. Click any ticket to open the full conversation thread.
4. Type your reply in the Reply box at the bottom.
5. Click Send Reply. The reply is stored and timestamped in the thread.`,
  },
  {
    category: "Admin: Tickets",
    sort_order: 2,
    question: "How do I change a ticket's status?",
    answer: `1. Open the ticket (Admin > Tickets > click subject line).
2. Find the Status dropdown at the top of the ticket view.
3. Choose: Open (awaiting response), In Progress (being handled), Resolved (issue fixed), or Closed (no further action needed).
4. Click Save Status.`,
  },
  {
    category: "Admin: Tickets",
    sort_order: 3,
    question: "How do I filter tickets by status or search for a specific customer?",
    answer: `1. Go to Admin > Tickets.
2. Use the Status filter tabs at the top to show only Open, In Progress, or Resolved tickets.
3. Use the search bar to search by customer name or email address.
4. Tickets are sorted newest-first by default — click the date column header to reverse the order.`,
  },

  // ── Pages (CMS) ───────────────────────────────────────────────────────
  {
    category: "Admin: Pages",
    sort_order: 1,
    question: "How do I edit a static page's content?",
    answer: `System pages (About, Contact, Privacy Policy, etc.) are managed in Admin > Pages.

1. Go to Admin > Pages (/admin/pages).
2. Click the page you want to edit.
3. Update the Title and Content fields in the editor.
4. Click Save. Changes go live on the public site immediately.`,
  },
  {
    category: "Admin: Pages",
    sort_order: 2,
    question: "How do I update a page's hero image inline on the public site?",
    answer: `Hero images can be changed without navigating to the admin panel.

1. Make sure you are logged into the admin panel in another browser tab.
2. Visit the public page whose hero image you want to change.
3. Hover over the hero image — an "Edit" overlay button appears for logged-in admins.
4. Click Edit, paste a new image URL, and click Save.
5. The new image appears immediately without a page refresh.`,
  },
  {
    category: "Admin: Pages",
    sort_order: 3,
    question: "How do I create a new system page?",
    answer: `1. Go to Admin > Pages and click "New Page".
2. Fill in the Title (shown as the page heading), Slug (the URL path, e.g. "privacy-policy"), and Content.
3. Set Status to Published.
4. Click Save. The page is accessible at /[slug] on the public site.`,
  },

  // ── Integrations ──────────────────────────────────────────────────────
  {
    category: "Admin: Integrations",
    sort_order: 1,
    question: "How do I add or update my Google Reviews Place ID?",
    answer: `The Google Reviews Place ID tells the site which business to pull reviews from.

1. Go to Admin > Integrations (/admin/integrations).
2. Find the "Google Reviews Place ID" field.
3. Paste your Place ID (format: ChIJ...). You can look it up at https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder.
4. Click Save. The homepage reviews section will refresh on the next visitor request.`,
  },
  {
    category: "Admin: Integrations",
    sort_order: 2,
    question: "How do I configure the Mapbox API key?",
    answer: `Mapbox powers the interactive map on the planner and Explore pages.

1. Go to Admin > Integrations.
2. Find the Mapbox Public Token field.
3. Paste your Mapbox public token (starts with "pk.").
4. Click Save.

Get a token from https://account.mapbox.com — a free account gives you generous monthly usage.`,
  },
  {
    category: "Admin: Integrations",
    sort_order: 3,
    question: "How do I set up my OpenWeather API key?",
    answer: `OpenWeather provides the live weather data shown in the AI planner.

1. Go to Admin > Integrations.
2. Find the OpenWeather API Key field.
3. Paste your API key from https://openweathermap.org/api.
4. Click Test to verify the key is working — a green tick confirms success.
5. Click Save.

A free OpenWeather account gives 1,000 calls/day which is sufficient for this site.`,
  },
  {
    category: "Admin: Integrations",
    sort_order: 4,
    question: "How do I add or rotate an AI provider API key (Anthropic or OpenAI)?",
    answer: `1. Go to Admin > Integrations.
2. Find the AI Provider section — there are separate fields for the Anthropic API Key and the AI Gateway Key.
3. Paste your new key.
4. Click Save. The planner and blog AI generation features will use the new key on the next request.

Keys are stored in the database and never exposed to the public frontend.`,
  },
  {
    category: "Admin: Integrations",
    sort_order: 5,
    question: "How do I validate that a saved API key is working?",
    answer: `1. Go to Admin > Integrations.
2. After saving a key, click the "Test" button next to it (available for OpenWeather and Google Reviews).
3. A green tick means the key is valid and returning data.
4. A red cross or error message means the key is incorrect or the service is unreachable — double-check you copied the full key without trailing spaces.`,
  },

  // ── Header & Footer ───────────────────────────────────────────────────
  {
    category: "Admin: Header & Footer",
    sort_order: 1,
    question: "How do I add a custom announcement banner or script to every page?",
    answer: `The Header/Footer editor lets you inject custom HTML, scripts, or banners site-wide.

1. Go to Admin > Header/Footer (/admin/header-footer).
2. Choose the slot: Head (injected in <head>), Body Start (just after <body>), or Body End (before </body>).
3. Paste your HTML or script tag into the text area.
4. Set Status to Active.
5. Click Save. The code is injected on every public page immediately.`,
  },
  {
    category: "Admin: Header & Footer",
    sort_order: 2,
    question: "How do I add a Google Analytics or Meta Pixel tracking tag?",
    answer: `1. Copy the full tracking script from your Google Analytics or Meta Business Manager account.
2. Go to Admin > Header/Footer.
3. Paste the script into the Head slot (Google Analytics) or Body End slot (Meta Pixel).
4. Set Status to Active and click Save.
5. Visit the public site and confirm the tag fires using the GA Debugger or Meta Pixel Helper browser extension.`,
  },
  {
    category: "Admin: Header & Footer",
    sort_order: 3,
    question: "How do I disable a header/footer block without deleting it?",
    answer: `1. Go to Admin > Header/Footer.
2. Find the block you want to pause.
3. Change its Status from Active to Inactive.
4. Click Save. The block stops being injected on public pages but remains saved in the database.

To re-enable it, set Status back to Active and save.`,
  },

  // ── AI Systems ────────────────────────────────────────────────────────
  {
    category: "Admin: AI Systems",
    sort_order: 1,
    question: "How do I customise the AI trip planner's behaviour and personality?",
    answer: `The AI planner's personality, rules, and constraints are controlled by an editable system prompt.

1. Go to Admin > AI Systems (/admin/ai-systems).
2. Click the "Planner" system to open its configuration.
3. Edit the System Prompt text field — this is the instruction set the AI follows during every planner conversation.
4. Optionally change the Model (Claude, GPT-4o, etc.) or Temperature (0 = conservative, 1 = creative).
5. Click Save. New planner conversations immediately use the updated prompt.`,
  },
  {
    category: "Admin: AI Systems",
    sort_order: 2,
    question: "How do I update the itinerary AI's scheduling rules?",
    answer: `1. Go to Admin > AI Systems > Itinerary.
2. The system prompt contains rules for how the AI builds day plans: meal break timing, travel time between stops, priority when trips conflict, etc.
3. Edit the rules directly in the prompt text. For example, to change the default lunch window, find the lunch rule and update the times.
4. Click Save. The next itinerary build uses the new rules.`,
  },
  {
    category: "Admin: AI Systems",
    sort_order: 3,
    question: "How do I change which AI model powers a feature?",
    answer: `1. Go to Admin > AI Systems and open the system you want to change (Planner, Itinerary, or Help Chat).
2. Find the Model dropdown.
3. Select a different model — options include claude-3-5-sonnet, claude-3-haiku, gpt-4o, and gpt-4o-mini.
4. Click Save.

Tip: lighter models (haiku, gpt-4o-mini) are faster and cheaper for simple tasks. Use stronger models (sonnet, gpt-4o) when output quality is the priority.`,
  },
  {
    category: "Admin: AI Systems",
    sort_order: 4,
    question: "How do I reset an AI system prompt to the built-in default?",
    answer: `1. Go to Admin > AI Systems and open the relevant system.
2. Click the "Reset to Default" button beneath the System Prompt field.
3. Confirm the action. The field is replaced with the hard-coded fallback prompt that ships with the application.
4. Click Save.`,
  },
  {
    category: "Admin: AI Systems",
    sort_order: 5,
    question: "How do I control what the help chat AI knows about the business?",
    answer: `1. Go to Admin > AI Systems > Help Chat.
2. The system prompt is where you tell the AI the business name, opening hours, contact details, policies, and any other facts it should know.
3. Update the facts section of the prompt with your current details.
4. Click Save. The help chat will reference these facts immediately in new conversations.`,
  },

  // ── Palisis / TourCMS ─────────────────────────────────────────────────
  {
    category: "Admin: Palisis",
    sort_order: 1,
    question: "How do I run a full catalog import from Palisis/TourCMS?",
    answer: `A full import fetches every tour from your TourCMS channel and upserts them into the local database.

1. Go to Admin > Palisis (/admin/palisis).
2. Click "Import Full Catalog".
3. A progress indicator shows how many trips are being fetched. This may take 10–30 seconds depending on catalog size.
4. When complete, a summary shows how many trips were created, updated, or skipped.
5. Visit Admin > Trips to confirm the new or updated trips appear in the list.`,
  },
  {
    category: "Admin: Palisis",
    sort_order: 2,
    question: "How do I enable or disable automatic Palisis sync?",
    answer: `Auto-sync re-imports a trip automatically whenever Palisis sends a webhook (e.g. when you update a tour in TourCMS).

1. Go to Admin > Palisis.
2. Find the Auto-Sync toggle.
3. Switch it ON to automatically update the local database whenever a Palisis webhook arrives.
4. Switch it OFF to pause automatic syncing — incoming webhooks will be logged but not applied.
5. The setting is saved instantly.`,
  },
  {
    category: "Admin: Palisis",
    sort_order: 3,
    question: "How do I check if a Palisis webhook arrived and was processed?",
    answer: `1. Go to Admin > Palisis.
2. Scroll to the Sync Log section.
3. Each row shows the webhook event type, the trip it affected, the outcome (synced or skipped), and a timestamp.
4. A "skipped" entry means auto-sync was OFF at the time — the webhook was received but not applied.
5. To apply it now, open the affected trip in Admin > Trips and click "Sync from Palisis".`,
  },
  {
    category: "Admin: Palisis",
    sort_order: 4,
    question: "Where do I enter my Palisis/TourCMS API credentials?",
    answer: `1. Go to Admin > Integrations.
2. Find the Palisis section with fields for API Key, Channel ID, and Marketplace ID.
3. Enter the values from your TourCMS account (Settings > API Keys in the TourCMS back office).
4. Click Test to confirm the credentials work correctly.
5. Click Save.

These credentials are used by both the manual import and the live availability check on trip detail pages.`,
  },
  {
    category: "Admin: Palisis",
    sort_order: 5,
    question: "Why did a Palisis import overwrite my manual edits to a trip?",
    answer: `Palisis is the upstream source of truth for any trip that originated there. When a sync runs (manual or automatic), the local database row is replaced with the latest data from TourCMS.

To keep manual edits safe:
- Edit fields like tags, featured status, and trip-tag categories in this admin panel — those fields are not overwritten by Palisis.
- For fields that come from Palisis (title, price, description, images), make the edit in TourCMS first, then sync. That way the data stays consistent between both systems.`,
  },
]

async function run() {
  let count = 0
  for (const a of articles) {
    await pool.query(
      `INSERT INTO help_articles (id, question, answer, category, status, sort_order, created_by, updated_by)
       SELECT gen_random_uuid(), $1, $2, $3, 'published', $4, $5, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM help_articles WHERE question = $1 AND category = $3
       )`,
      [a.question, a.answer, a.category, a.sort_order, ADMIN_ID],
    )
    count++
  }
  console.log(`Inserted ${count} admin tutorial articles.`)
  await pool.end()
}

run().catch((e) => {
  console.error(e)
  pool.end()
  process.exit(1)
})
