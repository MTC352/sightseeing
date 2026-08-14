import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { FillingUpFastClient } from "./filling-up-fast-client"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Filling Up Fast | sightseeing.lu",
  description:
    "Today's experiences across Luxembourg ranked by how few seats remain — grab your spot before they sell out.",
}

export default function FillingUpFastPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <FillingUpFastClient />
      <SiteFooter />
    </div>
  )
}
