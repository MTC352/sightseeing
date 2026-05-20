import { ImageResponse } from "next/og"

export const runtime = "edge"

// Dynamic Open Graph image — used by trip and blog pages so every share/AI
// preview gets a unique, branded card instead of the site default.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const title = (searchParams.get("title") || "sightseeing.lu").slice(0, 140)
  const subtitle = (searchParams.get("subtitle") || "Handpicked experiences in Luxembourg").slice(0, 160)
  const eyebrow = (searchParams.get("eyebrow") || "").slice(0, 60)
  const price = searchParams.get("price") || ""

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0f766e 0%, #134e4a 60%, #1f2937 100%)",
          color: "white",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            ◐
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5 }}>sightseeing.lu</div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {eyebrow ? (
            <div
              style={{
                fontSize: 20,
                textTransform: "uppercase",
                letterSpacing: 2,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontSize: title.length > 70 ? 56 : 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.2,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.85)", lineHeight: 1.35 }}>{subtitle}</div>
          {price ? (
            <div style={{ marginTop: 8, fontSize: 24, color: "#a7f3d0" }}>From {price}</div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
}
