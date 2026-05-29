import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/site-navbar"
import { SiteFooter } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Legal Notice (Impressum)",
  description: "Legal notice and company information for sightseeing.lu, as required by Luxembourg law.",
}

export default function ImpressumPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Legal Notice</h1>
        <p className="mt-1 text-sm text-muted-foreground">Impressum — Mentions légales — Impressum</p>

        <section className="mt-10 space-y-8 text-sm leading-relaxed text-foreground">

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Company details</h2>
            <div className="mt-3 space-y-1">
              <p><span className="font-medium">Company name:</span> sightseeing.lu S.à r.l.</p>
              <p><span className="font-medium">Legal form:</span> Société à responsabilité limitée (S.à r.l.)</p>
              <p><span className="font-medium">Registered address:</span> Place Guillaume II, L-1648 Luxembourg, Grand Duchy of Luxembourg</p>
              <p><span className="font-medium">Commercial Register:</span> Registre de Commerce et des Sociétés (RCS) Luxembourg — B [Registration number to be added]</p>
              <p><span className="font-medium">VAT number:</span> LU [VAT number to be added]</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Contact</h2>
            <div className="mt-3 space-y-1">
              <p><span className="font-medium">E-mail:</span>{" "}
                <a href="mailto:hello@sightseeing.lu" className="text-primary underline underline-offset-2">
                  hello@sightseeing.lu
                </a>
              </p>
              <p><span className="font-medium">Telephone:</span> +352 621 000 000</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Person responsible for content</h2>
            <div className="mt-3 space-y-1">
              <p>The editorial and content responsibility for this website lies with the management of sightseeing.lu S.à r.l. at the address stated above.</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Hosting & technical infrastructure</h2>
            <div className="mt-3 space-y-1">
              <p>This website is hosted by <span className="font-medium">Vercel Inc.</span>, 440 N Barranca Avenue #4133, Covina, CA 91723, USA. Vercel acts as a data processor under a Data Processing Agreement incorporating Standard Contractual Clauses approved by the European Commission.</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Supervisory authority</h2>
            <div className="mt-3 space-y-1">
              <p>The competent supervisory authority for data protection matters is:</p>
              <p className="mt-2">
                <span className="font-medium">Commission Nationale pour la Protection des Données (CNPD)</span><br />
                15, Boulevard du Jazz, L-4370 Belvaux, Luxembourg<br />
                Website:{" "}
                <a href="https://cnpd.public.lu" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  cnpd.public.lu
                </a>
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Disclaimer</h2>
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>The content of this website has been compiled with careful attention. However, we cannot guarantee the accuracy, completeness, or topicality of the information provided. We accept no liability for damages arising from the use of this website.</p>
              <p>This website contains links to external websites over which we have no control. We accept no responsibility for the content of linked external sites.</p>
              <p>The content and works on this website created by the site operators are subject to Luxembourg and European copyright law. Duplication, processing, distribution or any form of commercialisation of such material requires prior written consent.</p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Online dispute resolution</h2>
            <div className="mt-3 text-muted-foreground">
              <p>
                The European Commission provides a platform for online dispute resolution (ODR) at{" "}
                <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                  ec.europa.eu/consumers/odr
                </a>
                . We are not obliged to participate in alternative dispute resolution proceedings before a consumer arbitration board, but we are willing to do so where possible.
              </p>
            </div>
          </div>

        </section>

        <div className="mt-12 border-t border-border pt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-primary underline underline-offset-2">Privacy Policy</Link>
          <Link href="/help" className="hover:text-primary underline underline-offset-2">Help & FAQ</Link>
          <Link href="/" className="hover:text-primary underline underline-offset-2">Back to homepage</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
