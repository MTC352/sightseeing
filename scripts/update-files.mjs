import { readFileSync, writeFileSync } from "fs"

// Update site-footer.tsx — rename travel link
const footerPath = "/vercel/share/v0-project/components/site-footer.tsx"
let footer = readFileSync(footerPath, "utf8")
footer = footer.replace(
  '{ label: "Flights, Hotels & Cars", href: "/travel" },',
  '{ label: "All in One Vacation Agregation", href: "/travel" },'
)
writeFileSync(footerPath, footer, "utf8")
console.log("[v0] Footer updated:", footer.includes("All in One Vacation Agregation") ? "OK" : "FAILED")

// Update travel/page.tsx — insert flights + trains sections before Popular destinations
const travelPath = "/vercel/share/v0-project/app/travel/page.tsx"
let travel = readFileSync(travelPath, "utf8")

const FLIGHTS_TRAINS_SECTIONS = `        {/* ── Flights info ── */}
        <section className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Take to the skies</p>
              <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Flights to Luxembourg</h2>
              <p className="mt-1 text-sm text-muted-foreground">Compare 600+ airlines and find the best fares to Luxembourg Findel Airport (LUX).</p>
            </div>
            <Link href="/travel/flights" className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              Search flights <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { city: "London", code: "LHR", duration: "1h 30m", from: 49 },
              { city: "Paris", code: "CDG", duration: "1h 10m", from: 39 },
              { city: "Amsterdam", code: "AMS", duration: "1h 20m", from: 44 },
              { city: "Frankfurt", code: "FRA", duration: "0h 55m", from: 55 },
            ].map((route) => (
              <Link key={route.city} href="/travel/flights" className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Plane className="h-4 w-4 text-primary" />
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{route.code} — LUX</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{route.city}</p>
                  <p className="text-[11px] text-muted-foreground">{route.duration} direct</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">From</span>
                  <span className="text-base font-bold text-foreground">{route.from}&euro;</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Check, title: "No booking fees", desc: "We pass savings directly to you" },
              { icon: Clock, title: "Price alerts", desc: "Get notified when fares drop" },
              { icon: Shield, title: "Flexible tickets", desc: "Change or cancel with ease" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{title}</p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trains info ── */}
        <section className="border-t border-border bg-secondary/30 py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Rail travel</p>
                <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Trains to Luxembourg</h2>
                <p className="mt-1 text-sm text-muted-foreground">High-speed and intercity rail from across Europe. Book direct to Luxembourg-Ville station.</p>
              </div>
              <Link href="/trains" className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                See all routes <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { city: "Paris", operator: "TGV", duration: "2h 05m", from: 29 },
                { city: "Brussels", operator: "Thalys", duration: "2h 45m", from: 19 },
                { city: "Frankfurt", operator: "ICE", duration: "3h 20m", from: 35 },
                { city: "Amsterdam", operator: "IC", duration: "3h 55m", from: 39 },
              ].map((route) => (
                <Link key={route.city} href="/trains" className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <TrainFront className="h-4 w-4 text-primary" />
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{route.operator}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{route.city}</p>
                    <p className="text-[11px] text-muted-foreground">{route.duration}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">From</span>
                    <span className="text-base font-bold text-foreground">{route.from}&euro;</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">Free public transport once you arrive</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Since 2020, all buses, trams and trains within Luxembourg are completely free — including from the airport to the city centre.</p>
                </div>
                <Link href="/trains" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  Book train tickets <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        `

const MARKER = `{/* ── Popular destinations ── */}`
if (travel.includes(MARKER)) {
  travel = travel.replace(MARKER, FLIGHTS_TRAINS_SECTIONS + MARKER)
  writeFileSync(travelPath, travel, "utf8")
  console.log("[v0] Travel page updated: flights + trains sections inserted OK")
} else {
  console.log("[v0] Travel page MARKER not found — current marker variants:")
  const match = travel.match(/\{\/\*.*destinations.*\*\/\}/)
  console.log(match)
}
