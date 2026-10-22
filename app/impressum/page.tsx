import type { Metadata } from "next"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"
import { dbGetContactInfo, dbGetLegalLinks, LEGAL_LINKS_DEFAULTS } from "@/lib/db/queries"
import { ImpressumContent } from "./impressum-content"

export const metadata: Metadata = {
  title: "Legal Notice (Impressum)",
  description: "Legal notice and company information for sightseeing.lu, as required by Luxembourg law.",
}

export default async function ImpressumPage() {
  const [contact, legal] = await Promise.all([
    dbGetContactInfo(),
    dbGetLegalLinks().catch(() => LEGAL_LINKS_DEFAULTS),
  ])
  return (
    <>
      <Navbar />
      <ImpressumContent contact={contact} privacyUrl={legal.privacyUrl} />
      <SiteFooter />
    </>
  )
}
