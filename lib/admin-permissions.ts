/**
 * lib/admin-permissions.ts
 * Edge-safe (no Node deps) RBAC definitions shared by proxy.ts, the admin
 * layout nav, and the user-management UI.
 *
 * Roles:
 *  - "superadmin"  → full access to every admin section (the bootstrap admin).
 *  - "employee"    → access limited to the permission keys stored on the account.
 *
 * Dashboard (/admin) and the auth endpoints are always available to any signed-in
 * admin user. The Users management section is superadmin-only and can never be
 * granted to an employee.
 */

export const FULL_ACCESS_ROLE = "superadmin"

export type PermissionKey =
  | "trips"
  | "blog"
  | "jobs"
  | "help"
  | "tickets"
  | "pages"
  | "files"
  | "ai-systems"
  | "integrations"
  | "header-footer"
  | "palisis"
  | "implementation"
  | "docs"

/** Grantable sections shown as checkboxes in the employee editor. */
export const ADMIN_SECTIONS: { key: PermissionKey; label: string; description: string }[] = [
  { key: "trips", label: "Trips", description: "Trips, Trip Tags, Departures & Taxonomies" },
  { key: "blog", label: "Blog", description: "Blog posts" },
  { key: "jobs", label: "Jobs", description: "Job listings & applications" },
  { key: "help", label: "Help & FAQ", description: "Help articles" },
  { key: "tickets", label: "Support Tickets", description: "Customer support tickets" },
  { key: "pages", label: "Pages", description: "CMS pages" },
  { key: "files", label: "Files", description: "Media library — upload & share files" },
  { key: "ai-systems", label: "AI Systems", description: "AI prompts, models & planner behavior" },
  { key: "integrations", label: "Integrations", description: "API keys & third-party integrations" },
  { key: "header-footer", label: "Header / Footer", description: "Custom HTML injection blocks" },
  { key: "palisis", label: "Palisis Import", description: "Palisis catalog import & availability" },
  { key: "implementation", label: "DB Tracker", description: "Database health tracker" },
  { key: "docs", label: "Documentation", description: "Internal documentation" },
]

const VALID_KEYS = new Set<string>(ADMIN_SECTIONS.map((s) => s.key))

/** Filter arbitrary input down to known, valid permission keys. */
export function sanitizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<PermissionKey>()
  for (const v of input) {
    if (typeof v === "string" && VALID_KEYS.has(v)) seen.add(v as PermissionKey)
  }
  return Array.from(seen)
}

/**
 * Map a request pathname to the permission key(s) that grant access. An employee
 * is allowed if they hold AT LEAST ONE of the returned keys. An empty array means
 * "any signed-in admin user". `null` means the path is not a recognized gated
 * admin route (treated as deny for employees).
 */
const ROUTE_RULES: { prefix: string; keys: PermissionKey[] }[] = [
  // Trips family
  { prefix: "/admin/trips", keys: ["trips"] },
  { prefix: "/admin/trip-tags", keys: ["trips"] },
  { prefix: "/api/admin/trips", keys: ["trips"] },
  { prefix: "/api/admin/trip-tags", keys: ["trips"] },
  { prefix: "/api/admin/departures", keys: ["trips"] },
  { prefix: "/api/admin/taxonomies", keys: ["trips"] },
  // Blog
  { prefix: "/admin/blog", keys: ["blog"] },
  { prefix: "/api/admin/posts", keys: ["blog"] },
  // Jobs
  { prefix: "/admin/jobs", keys: ["jobs"] },
  { prefix: "/api/admin/jobs", keys: ["jobs"] },
  { prefix: "/api/admin/applications", keys: ["jobs"] },
  // Help
  { prefix: "/admin/help", keys: ["help"] },
  { prefix: "/api/admin/help", keys: ["help"] },
  // Tickets
  { prefix: "/admin/tickets", keys: ["tickets"] },
  { prefix: "/api/admin/tickets", keys: ["tickets"] },
  // Pages
  { prefix: "/admin/pages", keys: ["pages"] },
  { prefix: "/api/admin/pages", keys: ["pages"] },
  // Files / media library
  { prefix: "/admin/files", keys: ["files"] },
  { prefix: "/api/admin/media", keys: ["files"] },
  // AI systems
  { prefix: "/admin/ai-systems", keys: ["ai-systems"] },
  { prefix: "/api/admin/planner-behavior", keys: ["ai-systems"] },
  { prefix: "/api/admin/itinerary-config", keys: ["ai-systems"] },
  { prefix: "/api/admin/chat-planner-config", keys: ["ai-systems"] },
  { prefix: "/api/admin/prompt-revisions", keys: ["ai-systems"] },
  // Integrations
  { prefix: "/admin/integrations", keys: ["integrations"] },
  { prefix: "/api/admin/integrations", keys: ["integrations"] },
  { prefix: "/api/admin/refresh-availability", keys: ["integrations"] },
  { prefix: "/api/admin/refresh-discovery", keys: ["integrations"] },
  // Header / footer
  { prefix: "/admin/header-footer", keys: ["header-footer"] },
  // Palisis
  { prefix: "/admin/palisis", keys: ["palisis"] },
  { prefix: "/api/admin/palisis-import", keys: ["palisis"] },
  { prefix: "/api/admin/palisis-availability", keys: ["palisis"] },
  { prefix: "/api/admin/palisis-logs", keys: ["palisis"] },
  { prefix: "/api/admin/palisis-rate-limit", keys: ["palisis"] },
  { prefix: "/api/webhooks/palisis", keys: ["palisis"] },
  // Implementation / DB tracker (+ its dashboard widgets)
  { prefix: "/admin/implementation", keys: ["implementation"] },
  { prefix: "/api/admin/impl-check", keys: ["implementation"] },
  { prefix: "/api/admin/ai-advisor", keys: ["implementation"] },
  { prefix: "/api/admin/seo-analyze", keys: ["implementation"] },
  { prefix: "/api/admin/seo-fix", keys: ["implementation"] },
  // Per-trip AI SEO optimizer — lives on the trip edit page (Trips section).
  { prefix: "/api/admin/seo-generate", keys: ["trips"] },
  // Per-trip AI itinerary generator — lives on the trip edit page (Trips section).
  { prefix: "/api/admin/itinerary-generate", keys: ["trips"] },
  // Docs
  { prefix: "/admin/docs", keys: ["docs"] },
  { prefix: "/api/admin/admin-help-chat", keys: ["docs"] },
  // Blog AI authoring helper
  { prefix: "/api/admin/generate-blog", keys: ["blog"] },
  // Shared content endpoints — used by trip/blog editors and the frontend edit mode.
  { prefix: "/api/admin/trips/upload", keys: ["trips", "blog", "pages"] },
  { prefix: "/api/admin/page-content", keys: ["pages", "trips", "blog"] },
  // Shared settings endpoint — touched by AI/Integrations/Header-Footer screens
  // (and trip-field settings live on the Integrations screen).
  { prefix: "/api/admin/settings", keys: ["ai-systems", "integrations", "header-footer", "trips"] },
  // Shared API-key tester — used by Integrations & Palisis screens.
  { prefix: "/api/admin/test-key", keys: ["integrations", "palisis"] },
]

function matchPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/")
}

/**
 * Authoritative access check used by the proxy. Returns true if the given role +
 * permissions may access the pathname.
 */
export function canAccessPath(
  pathname: string,
  role: string,
  permissions: PermissionKey[] | string[] | undefined,
): boolean {
  if (role === FULL_ACCESS_ROLE) return true

  // Always available to any signed-in admin user.
  if (pathname === "/admin" || pathname === "/admin/") return true
  if (pathname.startsWith("/api/admin/auth")) return true
  if (matchPath(pathname, "/api/admin/dashboard")) return true

  // User management is superadmin-only and never grantable to employees.
  if (matchPath(pathname, "/admin/users") || matchPath(pathname, "/api/admin/users")) {
    return false
  }

  // File-upload rule management (global default + per-user overrides) is
  // superadmin-only and never grantable to employees.
  if (matchPath(pathname, "/admin/file-rules") || matchPath(pathname, "/api/admin/file-rules")) {
    return false
  }

  // Recent Activity (audit trail) is a superadmin-only review surface.
  if (matchPath(pathname, "/admin/activity") || matchPath(pathname, "/api/admin/activity")) {
    return false
  }

  // Data migrations write content to the live DB — superadmin-only, never
  // grantable to employees.
  if (
    matchPath(pathname, "/admin/db-migrations") ||
    matchPath(pathname, "/api/admin/db-migrations")
  ) {
    return false
  }

  const perms = sanitizePermissions(permissions)

  // Longest-prefix match wins.
  const rule = ROUTE_RULES
    .filter((r) => matchPath(pathname, r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]

  if (!rule) return false
  if (rule.keys.length === 0) return true
  return rule.keys.some((k) => perms.includes(k))
}
