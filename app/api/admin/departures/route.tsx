import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { dbListDepartures, dbCreateDeparture, dbUpdateDeparture, dbDeleteDeparture } from "@/lib/db/queries"
import { requireAdminSession } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && (err as { status?: number }).status === 401
}

export async function GET() {
  try {
    await requireAdminSession()
    return NextResponse.json(await dbListDepartures())
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/departures] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession()
    const data = await req.json()
    const dep = await dbCreateDeparture(data)
    revalidatePath("/admin/departures")
    revalidatePath("/departures")
    return NextResponse.json(dep, { status: 201 })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/departures] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession()
    const { id, ...data } = await req.json()
    const updated = await dbUpdateDeparture(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    revalidatePath("/admin/departures")
    revalidatePath("/departures")
    return NextResponse.json(updated)
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/departures] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminSession()
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
    await dbDeleteDeparture(id)
    revalidatePath("/admin/departures")
    revalidatePath("/departures")
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isUnauthorized(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    console.error("[admin/departures] DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
