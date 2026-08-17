import { NextResponse } from "next/server"
import {
  dbGetSettings,
  dbUpdateApiKeys,
  dbUpdateAiSystem,
  dbUpdateAiSystemExtra,
  dbUpdateWeglot,
  dbUpdateHeaderFooter,
  dbUpdateAnnouncement,
  dbUpdateContactInfo,
  dbSetImportExcludedFields,
  dbUpdateFooterMenu,
  dbUpdatePageVisibility,
} from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { clearTourCMSConfigCache } from "@/lib/tourcms"
import { isFullAdmin, type PermissionKey } from "@/lib/admin-permissions"
import { normalizeFooterMenu } from "@/lib/footer-menu-normalize"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

function hasPermission(
  role: string,
  permissions: string[] | undefined,
  required: PermissionKey,
): boolean {
  if (isFullAdmin(role, permissions)) return true
  return Array.isArray(permissions) && permissions.includes(required)
}

export async function GET() {
  try {
    const session = await requireAdminSession()
    const full = await dbGetSettings()

    if (isFullAdmin(session.role, session.permissions)) {
      return NextResponse.json(full)
    }

    const perms = session.permissions ?? []

    const filtered: Record<string, unknown> = {}

    if (perms.includes("integrations")) {
      // Mask raw secret values — employees may view connection status (set vs
      // not-set) but must not receive actual credential material.
      const maskedApiKeys: Record<string, string> = {}
      for (const [k, v] of Object.entries(full.apiKeys as Record<string, string>)) {
        maskedApiKeys[k] = v ? "••••••••" : ""
      }
      filtered.apiKeys = maskedApiKeys

      // Mask weglot: non-secret config fields pass through; apiKey is masked.
      if (full.weglot && typeof full.weglot === "object") {
        const { apiKey: _apiKey, ...weglotConfig } = full.weglot as Record<string, unknown>
        const rawKey = _apiKey as string | undefined
        filtered.weglot = { ...weglotConfig, apiKey: rawKey ? "••••••••" : "" }
      }

      filtered.aiProvider = full.aiProvider
      filtered.aiProviderSelected = full.aiProviderSelected
    }

    if (perms.includes("ai-systems")) {
      filtered.ai = full.ai
      filtered.plannerBehavior = full.plannerBehavior
      filtered.itineraryBehavior = full.itineraryBehavior
      filtered.seoBehavior = full.seoBehavior
    }

    if (perms.includes("header-footer")) {
      filtered.header = full.header
      filtered.footer = full.footer
      filtered.announcement = full.announcement
      filtered.contactInfo = full.contactInfo
      filtered.footerMenu = full.footerMenu
      filtered.pageVisibility = full.pageVisibility
    }

    if (perms.includes("palisis")) {
      filtered.importExcludedFields = full.importExcludedFields
    }

    return NextResponse.json(filtered)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

const SECTION_PERMISSION: Record<string, PermissionKey> = {
  ai: "ai-systems",
  importSettings: "palisis",
  contactInfo: "header-footer",
  footerMenu: "header-footer",
  pageVisibility: "header-footer",
}

/**
 * Sections that inject content or arbitrary script into every public page,
 * or that write production API credentials.
 * Only superadmins may write to them — the permission is never grantable to
 * employee accounts.
 */
const SUPERADMIN_ONLY_SECTIONS = new Set([
  "header",
  "footer",
  "announcement",
  "apiKeys",
  "weglot",
])

export async function PATCH(req: Request) {
  try {
    const session = await requireAdminSession()
    const body = await req.json()
    const { section, data } = body as {
      section: "apiKeys" | "ai" | "weglot" | "header" | "footer" | "announcement" | "contactInfo" | "importSettings" | "footerMenu" | "pageVisibility"
      data: Record<string, unknown>
    }

    if (!section) {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 })
    }

    // header / footer / announcement require full admin access (superadmin or a
    // full-access employee) regardless of section grants, because they can
    // inject arbitrary script site-wide.
    if (SUPERADMIN_ONLY_SECTIONS.has(section)) {
      if (!isFullAdmin(session.role, session.permissions)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else {
      const required = SECTION_PERMISSION[section]
      if (!required) {
        return NextResponse.json({ error: "Unknown section" }, { status: 400 })
      }
      if (!hasPermission(session.role, session.permissions, required)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    if (section === "apiKeys") {
      await dbUpdateApiKeys(data as Record<string, string>)
      // Clear cached credential configs so new keys take effect immediately.
      if ("palisis" in data || "palisisChannelId" in data || "palisisMarketplaceId" in data) {
        clearTourCMSConfigCache()
      }
    } else if (section === "ai") {
      const { system, displayCount, imageModel, imagePrompt, ...config } = data as {
        system: string
        displayCount?: number
        imageModel?: string
        imagePrompt?: string
      } & Record<string, unknown>
      await dbUpdateAiSystem(system, config)
      if (typeof displayCount === "number") {
        await dbUpdateAiSystemExtra(system, { display_count: displayCount })
      }
      // Blog cover-image generation settings live in extra_config (JSONB).
      if (typeof imageModel === "string" || typeof imagePrompt === "string") {
        const extra: Record<string, unknown> = {}
        if (typeof imageModel === "string") extra.imageModel = imageModel
        if (typeof imagePrompt === "string") extra.imagePrompt = imagePrompt
        await dbUpdateAiSystemExtra(system, extra)
      }
    } else if (section === "weglot") {
      await dbUpdateWeglot(data)
    } else if (section === "header") {
      await dbUpdateHeaderFooter("header", data.customHtml as string)
    } else if (section === "footer") {
      await dbUpdateHeaderFooter("footer", data.customHtml as string)
    } else if (section === "announcement") {
      await dbUpdateAnnouncement(data as { enabled?: boolean; content?: string; size?: string; align?: string; bgColor?: string; textColor?: string })
    } else if (section === "contactInfo") {
      await dbUpdateContactInfo(data as { address?: string; email?: string; phone?: string })
    } else if (section === "importSettings") {
      await dbSetImportExcludedFields(data.excludedFields)
    } else if (section === "footerMenu") {
      await dbUpdateFooterMenu(normalizeFooterMenu((data as { menu?: unknown }).menu))
    } else if (section === "pageVisibility") {
      const disabled = Array.isArray((data as { disabled?: unknown }).disabled)
        ? ((data as { disabled: unknown[] }).disabled as string[])
        : []
      await dbUpdatePageVisibility(disabled)
    }

    void logActivity({
      actor: session,
      action: "settings.update",
      entityType: "settings",
      entityId: section,
      summary: `Updated ${section} settings`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/settings] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
