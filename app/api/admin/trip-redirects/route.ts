import { NextResponse } from "next/server"
import { dbListTripRedirects, dbCreateTripRedirect, dbResolve404ByPath } from "@/lib/db/queries"
import { revalidatePath } from "next/cache"
import { requirePermission } from "@/lib/auth-server"
import { logActivity } from "@/lib/activity-log"
import { tripRedirectError } from "@/lib/trip-redirect-http"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}
function isForbidden(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 403
}

export async function GET() {
  try {
    await requirePermission("trips")
    return NextResponse.json(await dbListTripRedirects())
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trip-redirects] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("trips")
    const data = await req.json()
    if (!data.tripId?.trim()) {
      return NextResponse.json({ error: "Target trip is required" }, { status: 400 })
    }
    if (!data.slug?.trim()) {
      return NextResponse.json({ error: "Redirect slug is required" }, { status: 400 })
    }
    const redirect = await dbCreateTripRedirect({
      tripId: data.tripId,
      slug: data.slug,
      userId: session?.id,
    })
    const slug = (redirect as { slug?: string })?.slug
    if (slug) await dbResolve404ByPath(`/trip/${slug}`)
    revalidatePath("/admin/trip-redirects")
    void logActivity({
      actor: session,
      action: "trip_redirect.create",
      entityType: "trip_redirect",
      entityId: (redirect as { id?: string })?.id,
      summary: `Created trip redirect /trip/${slug} → ${(redirect as { tripSlug?: string })?.tripSlug ?? data.tripId}`,
    })
    return NextResponse.json(redirect, { status: 201 })
  } catch (err) {
    if (isForbidden(err)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mapped = tripRedirectError(err)
    if (mapped) return mapped
    console.error("[admin/trip-redirects] POST error:", err)
    return NextResponse.json({ error: "Failed to create redirect" }, { status: 500 })
  }
}
