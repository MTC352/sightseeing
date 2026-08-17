/**
 * lib/admin-permissions.ts
 * Edge-safe (no Node deps) RBAC definitions shared by proxy.ts, the admin
 * layout nav, and the user-management UI.
 *
 * Roles:
 *  - "superadmin"  → full access to every admin section, including Dev-mode areas
 *                    (the bootstrap admin).
 *  - "employee"    → access limited to the permission keys stored on the account,
 *                    UNLESS granted the FULL_ACCESS_PERMISSION wildcard ("*"), which
 *                    makes the employee superadmin-equivalent EXCEPT for Dev-mode-only
 *                    areas (see DEV_ONLY_PREFIXES).
 *
 * Dashboard (/admin) and the auth endpoints are always available to any signed-in
 * admin user.
 */

export const FULL_ACCESS_ROLE = "superadmin"

/**
 * Wildcard permission granting an EMPLOYEE superadmin-equivalent access to every
 * admin section EXCEPT the Dev-mode-only areas (DEV_ONLY_PREFIXES). Stored as the
 * sole entry in an employee's `permissions` array. Only a superadmin may grant it
 * (via the Dev-mode "Full access" toggle in User Management).
 */
export const FULL_ACCESS_PERMISSION = "*"

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
  { key: "palisis", label: "Palisis Import", description: "Palisis catalog import & availability" },
  { key: "implementation", label: "DB Tracker", description: "Database health tracker" },
  { key: "docs", label: "Documentation", description: "Internal documentation" },
]

const VALID_KEYS = new Set<string>(ADMIN_SECTIONS.map((s) => s.key))

export type GrantedPermission = PermissionKey | typeof FULL_ACCESS_PERMISSION

/**
 * Filter arbitrary input down to known, valid permission keys — preserving the
 * full-access wildcard "*", which supersedes any individual section keys.
 */
export function sanitizePermissions(input: unknown): GrantedPermission[] {
  if (!Array.isArray(input)) return []
  if (input.includes(FULL_ACCESS_PERMISSION)) return [FULL_ACCESS_PERMISSION]
  const seen = new Set<PermissionKey>()
  for (const v of input) {
    if (typeof v === "string" && VALID_KEYS.has(v)) seen.add(v as PermissionKey)
  }
  return Array.from(seen)
}

/** True if the given permissions array grants full (wildcard) access. */
export function hasFullAccess(permissions: unknown): boolean {
  return Array.isArray(permissions) && permissions.includes(FULL_ACCESS_PERMISSION)
}

/** True for a superadmin OR a full-access employee (superadmin-equivalent). */
export function isFullAdmin(role: string, permissions: unknown): boolean {
  return role === FULL_ACCESS_ROLE || hasFullAccess(permissions)
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
  { prefix: "/api/admin/seo-config", keys: ["ai-systems"] },
  { prefix: "/api/admin/prompt-revisions", keys: ["ai-systems"] },
  // Integrations
  { prefix: "/admin/integrations", keys: ["integrations"] },
  { prefix: "/api/admin/integrations", keys: ["integrations"] },
  { prefix: "/api/admin/refresh-availability", keys: ["integrations"] },
  { prefix: "/api/admin/refresh-discovery", keys: ["integrations"] },
  // Header / footer — superadmin-only (see explicit check in canAccessPath below)
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
  // Standalone blog cover-image (re)generator — used by the blog editor.
  { prefix: "/api/admin/generate-blog-image", keys: ["blog"] },
  // Shared upload endpoint — trips/blog/pages editors may upload images.
  { prefix: "/api/admin/trips/upload", keys: ["trips", "blog", "pages"] },
  // Inline public-page editor — pages permission (or superadmin) only; trip/blog editors
  // must not be able to publish content outside their own section.
  { prefix: "/api/admin/page-content", keys: ["pages"] },
  // Shared settings endpoint — touched by AI/Integrations screens
  // (header/footer/announcement writes are superadmin-only at the route level).
  { prefix: "/api/admin/settings", keys: ["ai-systems", "integrations", "trips", "palisis"] },
  // Shared API-key tester — used by Integrations & Palisis screens.
  { prefix: "/api/admin/test-key", keys: ["integrations", "palisis"] },
  // Cookie consent banner config — lives on the Integrations screen.
  { prefix: "/api/admin/cookie-settings", keys: ["integrations"] },
]

function matchPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/")
}

/**
 * Dev-mode-only areas. Reachable by superadmins only — a full-access employee
 * ("*") gets everything EXCEPT these. Keep in sync with the `devOnly` items in
 * the admin sidebar (app/admin/layout.tsx).
 */
const DEV_ONLY_PREFIXES = [
  "/admin/db-migrations", "/api/admin/db-migrations",
  "/admin/logs", "/api/admin/logs",
  "/admin/ai-systems",
  "/api/admin/planner-behavior", "/api/admin/itinerary-config",
  "/api/admin/chat-planner-config", "/api/admin/seo-config",
  "/api/admin/prompt-revisions",
  "/api/admin/search-availability-source",
]

/** True when the path is a Dev-mode-only area (superadmin-only). */
export function isDevOnlyPath(pathname: string): boolean {
  return DEV_ONLY_PREFIXES.some((p) => matchPath(pathname, p))
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

  // Full-access employees ("*") are superadmin-equivalent for every section
  // EXCEPT the Dev-mode-only areas, which remain superadmin-only.
  if (hasFullAccess(permissions)) {
    return !isDevOnlyPath(pathname)
  }

  // User management is superadmin-only and never grantable to employees.
  if (matchPath(pathname, "/admin/users") || matchPath(pathname, "/api/admin/users")) {
    return false
  }

  // Header/footer injection writes arbitrary script to every public page —
  // superadmin-only and never grantable to employees.
  if (
    matchPath(pathname, "/admin/header-footer") ||
    matchPath(pathname, "/api/admin/header-footer")
  ) {
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

  // Frontend protection (site password gate) is a superadmin-only control and
  // is never grantable to employees.
  if (matchPath(pathname, "/api/admin/security")) {
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
