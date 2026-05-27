import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbGetTrip, dbUpdateTrip, dbDeleteTrip, dbGetIntegration } from "@/lib/db/queries"
import { resolvePolicy, isFieldEditable, TRIP_FIELDS, type TripFieldPolicy } from "@/lib/trip-field-policy"
import { requireAdminSession } from "@/lib/auth-server"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

/**
 * Defense-in-depth: strip any field the current policy marks "readonly"
 * from an incoming PATCH body. The UI already gates inputs, but a stale
 * client or hand-crafted request must NEVER overwrite a read-only field
 * (these are typically owned by Palisis one-way sync).
 */
async function filterByPolicy<T extends Record<string, unknown>>(data: T): Promise<{ filtered: Partial<T>; stripped: string[] }> {
  let policy: TripFieldPolicy
  try {
    const row = (await dbGetIntegration("trip_field_policy")) as { value?: string } | null
    const stored = row?.value ? JSON.parse(row.value) : null
    policy = resolvePolicy(stored)
  } catch {
    policy = resolvePolicy(null)
  }
  const known = new Set(TRIP_FIELDS.map(f => f.key))
  const filtered: Record<string, unknown> = {}
  const stripped: string[] = []
  for (const [k, v] of Object.entries(data)) {
    if (known.has(k) && !isFieldEditable(policy, k)) {
      stripped.push(k)
      continue
    }
    filtered[k] = v
  }
  return { filtered: filtered as Partial<T>, stripped }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const trip = await dbGetTrip(id)
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(trip)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    const data = await req.json()
    const { filtered, stripped } = await filterByPolicy(data as Record<string, unknown>)
    if (stripped.length) {
      console.warn(`[admin/trips/${id}] PATCH: stripped read-only fields:`, stripped)
    }
    const updated = await dbUpdateTrip(id, filtered)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/trips")
    revalidatePath("/")
    return NextResponse.json({ ...updated, _strippedReadOnly: stripped.length ? stripped : undefined })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await params
    await dbDeleteTrip(id)
    revalidatePath("/admin/trips")
    revalidatePath("/")
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/trips/:id] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
