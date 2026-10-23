"use client"

import { Link } from "@/components/i18n/link"
import { EditableText } from "@/components/editable-text"
import { EditableLink } from "@/components/editable-link"
import { LegalLink } from "@/components/legal-link"
import { EditableBox } from "@/components/editable-layout"

/*
 * /impressum — Legal Notice. Every heading, label and paragraph is editable in
 * the inline page editor (Admin → Pages → Legal Notice → Edit Content); keys
 * are "impressum:…". Address, email and phone come from Admin → Header &
 * Footer → Contact Info (shared with the footer), and the Privacy Policy link
 * from Legal Links. The wrapper opts out of the generic auto-edit layer so only
 * these explicit fields are editable.
 */

const H2 = "text-base font-semibold uppercase tracking-wide text-muted-foreground"
const EXT_LINK = "text-primary underline underline-offset-2"

function Detail({ id, label, value }: { id: string; label: string; value: React.ReactNode }) {
  return (
    <p>
      <span className="font-medium"><EditableText id={`impressum:company:${id}:label`} defaultValue={label} />:</span>{" "}
      {value}
    </p>
  )
}

export function ImpressumContent({
  contact,
  privacyUrl,
}: {
  contact: { address: string; email: string; phone: string }
  privacyUrl: string
}) {
  return (
    <main data-no-edit className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        <EditableText id="impressum:title" defaultValue="Legal Notice" />
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <EditableText id="impressum:subtitle" defaultValue="Impressum — Mentions légales — Impressum" />
      </p>

      <section className="mt-10 space-y-8 text-sm leading-relaxed text-foreground">

        <EditableBox boxId="impressum/company" label="Company details">
          <h2 className={H2}><EditableText id="impressum:company:heading" defaultValue="Company details" /></h2>
          <div className="mt-3 space-y-1">
            <Detail id="name" label="Company name" value={<EditableText id="impressum:company:name" defaultValue="sightseeing.lu S.à r.l." />} />
            <Detail id="form" label="Legal form" value={<EditableText id="impressum:company:form" defaultValue="Société à responsabilité limitée (S.à r.l.)" />} />
            <Detail
              id="address"
              label="Registered address"
              value={<>{contact.address}<EditableText id="impressum:company:address-suffix" defaultValue=", Grand Duchy of Luxembourg" /></>}
            />
            <Detail id="rcs" label="Commercial Register" value={<EditableText id="impressum:company:rcs" defaultValue="Registre de Commerce et des Sociétés (RCS) Luxembourg — B [Registration number to be added]" />} />
            <Detail id="vat" label="VAT number" value={<EditableText id="impressum:company:vat" defaultValue="LU [VAT number to be added]" />} />
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/contact" label="Contact">
          <h2 className={H2}><EditableText id="impressum:contact:heading" defaultValue="Contact" /></h2>
          <div className="mt-3 space-y-1">
            <p>
              <span className="font-medium"><EditableText id="impressum:contact:email-label" defaultValue="E-mail" />:</span>{" "}
              <a href={`mailto:${contact.email}`} className={EXT_LINK}>{contact.email}</a>
            </p>
            <p>
              <span className="font-medium"><EditableText id="impressum:contact:phone-label" defaultValue="Telephone" />:</span> {contact.phone}
            </p>
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/responsible" label="Person responsible for content">
          <h2 className={H2}><EditableText id="impressum:responsible:heading" defaultValue="Person responsible for content" /></h2>
          <div className="mt-3 space-y-1">
            <p>
              <EditableText
                id="impressum:responsible:body"
                multiline
                defaultValue="The editorial and content responsibility for this website lies with the management of sightseeing.lu S.à r.l. at the address stated above."
              />
            </p>
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/hosting" label="Hosting">
          <h2 className={H2}><EditableText id="impressum:hosting:heading" defaultValue="Hosting & technical infrastructure" /></h2>
          <div className="mt-3 space-y-1">
            <p>
              <EditableText
                id="impressum:hosting:body"
                multiline
                defaultValue="This website is hosted by Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, USA. Vercel acts as a data processor under a Data Processing Agreement incorporating Standard Contractual Clauses approved by the European Commission."
              />
            </p>
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/authority" label="Supervisory authority">
          <h2 className={H2}><EditableText id="impressum:authority:heading" defaultValue="Supervisory authority" /></h2>
          <div className="mt-3 space-y-1">
            <p><EditableText id="impressum:authority:intro" multiline defaultValue="The competent supervisory authority for data protection matters is:" /></p>
            <p className="mt-2">
              <span className="font-medium">
                <EditableText id="impressum:authority:name" defaultValue="Commission Nationale pour la Protection des Données (CNPD)" />
              </span><br />
              <EditableText id="impressum:authority:address" defaultValue="15, Boulevard du Jazz, L-4370 Belvaux, Luxembourg" /><br />
              <EditableText id="impressum:authority:website-label" defaultValue="Website" />:{" "}
              <EditableLink id="impressum:authority:website:href" defaultHref="https://cnpd.public.lu" newTab className={EXT_LINK}>
                <EditableText id="impressum:authority:website:text" defaultValue="cnpd.public.lu" />
              </EditableLink>
            </p>
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/disclaimer" label="Disclaimer">
          <h2 className={H2}><EditableText id="impressum:disclaimer:heading" defaultValue="Disclaimer" /></h2>
          <div className="mt-3 space-y-3 text-muted-foreground">
            <p>
              <EditableText
                id="impressum:disclaimer:p1"
                multiline
                defaultValue="The content of this website has been compiled with careful attention. However, we cannot guarantee the accuracy, completeness, or topicality of the information provided. We accept no liability for damages arising from the use of this website."
              />
            </p>
            <p>
              <EditableText
                id="impressum:disclaimer:p2"
                multiline
                defaultValue="This website contains links to external websites over which we have no control. We accept no responsibility for the content of linked external sites."
              />
            </p>
            <p>
              <EditableText
                id="impressum:disclaimer:p3"
                multiline
                defaultValue="The content and works on this website created by the site operators are subject to Luxembourg and European copyright law. Duplication, processing, distribution or any form of commercialisation of such material requires prior written consent."
              />
            </p>
          </div>
        </EditableBox>

        <EditableBox boxId="impressum/odr" label="Online dispute resolution">
          <h2 className={H2}><EditableText id="impressum:odr:heading" defaultValue="Online dispute resolution" /></h2>
          <div className="mt-3 text-muted-foreground">
            <p>
              <EditableText
                id="impressum:odr:before"
                multiline
                defaultValue="The European Commission provides a platform for online dispute resolution (ODR) at"
              />{" "}
              <EditableLink id="impressum:odr:link:href" defaultHref="https://ec.europa.eu/consumers/odr" newTab className={EXT_LINK}>
                <EditableText id="impressum:odr:link:text" defaultValue="ec.europa.eu/consumers/odr" />
              </EditableLink>
              <EditableText
                id="impressum:odr:after"
                multiline
                defaultValue=". We are not obliged to participate in alternative dispute resolution proceedings before a consumer arbitration board, but we are willing to do so where possible."
              />
            </p>
          </div>
        </EditableBox>

      </section>

      <EditableBox boxId="impressum/links" label="Bottom links" className="mt-12 border-t border-border pt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <LegalLink href={privacyUrl} className="hover:text-primary underline underline-offset-2">Privacy Policy</LegalLink>
        <Link href="/help" className="hover:text-primary underline underline-offset-2">Help & FAQ</Link>
        <Link href="/" className="hover:text-primary underline underline-offset-2">Back to homepage</Link>
      </EditableBox>
    </main>
  )
}
