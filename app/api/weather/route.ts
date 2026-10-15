import { NextResponse } from "next/server"
import { rateLimit, RATE_LIMITS, schedulePrune } from "@/lib/rate-limit"
import { getLuxembourgWeather } from "@/lib/weather"

export async function GET(request: Request) {
  schedulePrune()
  const rl = rateLimit(request, { key: "weather", ...RATE_LIMITS.cachedRead })
  if (!rl.allowed) return rl.response

  return NextResponse.json(await getLuxembourgWeather())
}
