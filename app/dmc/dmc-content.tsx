"use client"

import { useState } from "react"
import { EditableText } from "@/components/editable-text"
import { EditableImage } from "@/components/editable-image"
import { EditableLink } from "@/components/editable-link"
import { cn } from "@/lib/utils"
import {
  DMC_PURPOSES, DMC_DESTINATIONS, DMC_MESSAGE_MAX, validateDmcInquiry, type DmcField,
} from "@/lib/dmc-inquiry"

/*
 * /dmc — DMC & Tour Operator landing page (design: sightseeing-dmc.html).
 * Every heading, paragraph, list item, image and button link is editable in
 * the inline page editor (Admin → Pages → DMC → Edit Content); keys are
 * "dmc:…". The layout itself is fixed. The wrapper opts out of the generic
 * auto-edit layer so only these explicit fields are editable.
 */

const UPLOADS = "https://sightseeing.lu/uploads"
const IMG = {
  hero: `${UPLOADS}/1784562046964-7fyanf.jpeg`,
  intro: `${UPLOADS}/1784562046545-snuxah.jpeg`,
  private: `${UPLOADS}/1784562045998-5evjmd.jpeg`,
  group: `${UPLOADS}/1784562045397-1did66.jpeg`,
  tailor: `${UPLOADS}/1784562044962-kbxvwj.jpeg`,
  multi: `${UPLOADS}/1784562044493-gayb9e.jpeg`,
}

/* Design tokens from the source design (site mint palette). */
const MINT_DARK = "text-[#3f9c83]"
const MINT_TINT = "bg-[#e6f4f0]"

function Pill({ id, text, className }: { id: string; text: string; className?: string }) {
  return (
    <span className={cn("inline-flex w-fit items-center rounded-full px-3 py-1 text-[13px] font-semibold", MINT_TINT, MINT_DARK, className)}>
      <EditableText id={id} defaultValue={text} />
    </span>
  )
}

/**
 * Image box with the design's gradient fallback when no image is set.
 * `className` sizes the box itself (EditableImage renders no wrapper outside
 * edit mode) and is mirrored onto the edit-mode wrapper.
 */
function Photo({
  id, src, alt = "", className, placeholder, eager = false,
}: { id: string; src: string; alt?: string; className?: string; placeholder?: string; eager?: boolean }) {
  return (
    <EditableImage id={id} defaultValue={src} className={className}>
      {(url) => (
        <div className={cn("relative w-full overflow-hidden bg-[linear-gradient(150deg,#a8d8ca,#4f7f86)]", className)}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} className="absolute inset-0 h-full w-full object-cover" />
          ) : placeholder ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[rgba(29,38,43,.7)] px-2.5 py-1 text-[11px] font-semibold text-white">
              {placeholder}
            </span>
          ) : null}
        </div>
      )}
    </EditableImage>
  )
}

function Check() {
  return (
    <span className={cn("mt-[3px] grid h-4 w-4 flex-none place-items-center rounded-full", MINT_TINT)} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-4 w-4"><path d="M4.5 8.2l2.2 2.2 4.8-4.8" fill="none" stroke="#3f9c83" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  )
}

const BTN = "inline-flex items-center justify-center gap-2 rounded-xl px-[22px] py-[13px] text-[15px] font-semibold transition-colors"
const BTN_PRIMARY = `${BTN} bg-primary text-white hover:bg-[#3f9c83]`
const CARD = "rounded-[10px] border border-border bg-card"

/* ── Content (defaults = the approved copy; all editable) ─────────────────── */

const OFFERS = [
  { key: "private", img: IMG.private, kicker: "Individuals & families", title: "Private tours", text: "Your own guide and your own pace, on foot, by e-bike or with a private driver.", items: ["Luxembourg City & UNESCO Old Town", "Castles, nature & WWII history", "Hotel pick-up on request"] },
  { key: "group", img: IMG.group, kicker: "Groups of any size", title: "Group tours", text: "Guided programmes for associations, schools, cruise and coach groups.", items: ["Multilingual guides", "Coach & restaurant booking", "Group rates"] },
  { key: "tailor", img: IMG.tailor, kicker: "Agencies & companies", title: "Tailor-made products", text: "Incentives, company outings and VIP programmes built around your brief and budget.", items: ["Incentive & MICE programmes", "Food, wine & crémant tastings", "Special venues"] },
  { key: "multi", img: IMG.multi, kicker: "2 to 5 days", title: "Multi-day trips", text: "Round trips through Luxembourg from the Ardennes in the north to the Minett in the south, with hotels, guides and transfers in one package.", items: ["All regions of Luxembourg", "Hotels & transport included", "One contact throughout"] },
]

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  support: <path d="M4 13v-1a8 8 0 0116 0v1M4 13h3v6H5a1 1 0 01-1-1v-5zm16 0h-3v6h2a1 1 0 001-1v-5z" />,
  largest: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L8 21l4-2 4 2-1-7.5" /></>,
  everyday: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  date: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  languages: <><path d="M4 6h16v10H9l-4 3v-3H4z" /><path d="M8 10h8M8 13h5" /></>,
  tickets: <><path d="M4 8a2 2 0 002-2h12a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H6a2 2 0 00-2-2v-2a2 2 0 000-4z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  transfers: <><path d="M3 15l18-6-2-2-6 2-5-4-2 1 3 4-4 1-2-1-1 1 3 3z" /><path d="M4 20h16" /></>,
  custom: <><path d="M5 6h14M5 12h14M5 18h14" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></>,
}
const SERVICES = [
  { key: "support", title: "24/7 customer support", text: "Multilingual and always reachable" },
  { key: "largest", title: "Luxembourg's largest", text: "private tour operator" },
  { key: "everyday", title: "365 days a year", text: "Private tours every day" },
  { key: "date", title: "Your departure date", text: "Start on the day of your choice" },
  { key: "languages", title: "Multilingual guides", text: "Tours in your guests' language" },
  { key: "tickets", title: "Skip-the-line tickets", text: "Less waiting, more seeing" },
  { key: "transfers", title: "Private airport transfers", text: "From arrival to departure" },
  { key: "custom", title: "Fully customisable", text: "Every trip built around you" },
]

const DESTINATIONS = [
  { key: "north", photo: "Photo: Vianden Castle", flag: "North", area: "Éislek / Ardennes", title: "Nature & castles", text: "Vianden and Clervaux castles, the Upper Sûre lake and hiking trails through the green hills of the Ardennes." },
  { key: "wwii", photo: "Photo: WWII memorial", flag: "North & East", area: "Remembrance", title: "WWII history", text: "Battle of the Bulge sites, the National Museum of Military History in Diekirch and the American Military Cemetery in Hamm." },
  { key: "capital", photo: "Photo: Luxembourg City", flag: "Centre & East", area: "City, Mullerthal, Moselle", title: "Capital & culture", text: "The UNESCO Old Town and casemates, the Mullerthal rock trails and the wine and crémant villages of the Moselle." },
  { key: "south", photo: "Photo: Belval blast furnaces", flag: "South", area: "Minett", title: "Iron & industry", text: "The Land of the Red Rocks, a UNESCO biosphere, with its mining heritage and the blast furnaces of Belval." },
]

const PARTNERS = [
  { key: "operators", title: "Tour operators & travel agencies", text: "Ground handling and ready-to-sell excursions" },
  { key: "mice", title: "Incentive & MICE planners", text: "Activities and side programmes for events" },
  { key: "hotels", title: "Hotels & concierges", text: "Tours for your guests, bookable at short notice" },
  { key: "coach", title: "Coach & cruise operators", text: "Local guides, city tours and stop-over excursions" },
  { key: "companies", title: "Companies", text: "Team days, client visits and VIP hosting" },
  { key: "schools", title: "Associations & schools", text: "Cultural and educational group trips" },
]

const STEPS = [
  { key: "1", title: "Send your request", text: "Tell us your dates, group size, interests and budget." },
  { key: "2", title: "Receive a proposal", text: "We send a detailed programme with a clear price." },
  { key: "3", title: "Fine-tune it", text: "We adjust the details together until everything fits." },
  { key: "4", title: "Enjoy the trip", text: "Our guides and team take care of everything on the day." },
]

function SectionHead({ id, label, title, lead }: { id: string; label: string; title: string; lead?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <Pill id={`dmc:${id}:label`} text={label} />
      <h2 className="text-balance text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.15] tracking-[-0.015em] text-foreground">
        <EditableText id={`dmc:${id}:title`} defaultValue={title} />
      </h2>
      {lead && (
        <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-muted-foreground">
          <EditableText id={`dmc:${id}:lead`} defaultValue={lead} multiline />
        </p>
      )}
    </div>
  )
}

export function DmcContent() {
  return (
    <main data-no-edit className="bg-background text-foreground">
      {/* Hero */}
      <header className="relative flex min-h-[480px] items-end bg-[#2c3e43] text-white sm:min-h-[520px]">
        <div className="absolute inset-0">
          <Photo id="dmc:hero:image" src={IMG.hero} className="absolute inset-0" eager />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,25,30,.25)_0%,rgba(15,25,30,.35)_45%,rgba(15,25,30,.78)_100%)]" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-[clamp(48px,8vw,88px)]">
          <div className="flex max-w-[760px] flex-col gap-5">
            <Pill id="dmc:hero:label" text="DMC & Tour Operator" className="bg-[rgba(123,198,177,.95)] text-white" />
            <h1 className="text-balance text-[clamp(34px,5.6vw,60px)] font-bold leading-[1.08] tracking-[-0.025em]">
              <EditableText id="dmc:hero:title" defaultValue="Your local partner for all of Luxembourg" />
            </h1>
            <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-white/90">
              <EditableText id="dmc:hero:lead" multiline defaultValue="Private tours, group tours and tailor-made programmes across the whole country, from north to south. From nature and castles to WWII history, with or without your own private guide." />
            </p>
            <div className="flex flex-wrap gap-2">
              {["Private tours", "Group tours", "Tailor-made", "Multi-day trips"].map((c, i) => (
                <span key={c} className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[13px] font-semibold backdrop-blur-sm">
                  <EditableText id={`dmc:hero:chip${i + 1}`} defaultValue={c} />
                </span>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3">
              <EditableLink id="dmc:hero:cta1:href" defaultHref="#contact" className={BTN_PRIMARY}>
                <EditableText id="dmc:hero:cta1" defaultValue="Request a proposal" />
              </EditableLink>
              <EditableLink id="dmc:hero:cta2:href" defaultHref="#brochure" className={`${BTN} bg-[rgba(246,248,247,.92)] text-foreground hover:bg-white`}>
                <DownloadIcon />
                <EditableText id="dmc:hero:cta2" defaultValue="Download brochure" />
              </EditableLink>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4">
        {/* About */}
        <section className="grid items-center gap-[clamp(24px,4vw,56px)] py-[clamp(44px,7vw,80px)] lg:grid-cols-[1.1fr_.9fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Pill id="dmc:about:label" text="About our DMC service" />
            <h2 className="text-balance text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.15] tracking-[-0.015em]">
              <EditableText id="dmc:about:title" defaultValue="One team, from the first idea to the last transfer" />
            </h2>
            <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-muted-foreground">
              <EditableText id="dmc:about:lead" multiline defaultValue="Sightseeing.lu is best known for its tours and experiences in Luxembourg. As a destination management company and tour operator we also plan complete programmes for travel agencies, companies and groups. We bring together our own guides, transport and trusted local partners, and we take care of every detail on the ground." />
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {[["40+", "tours & experiences"], ["North–South", "the whole country"], ["EN · FR · DE", "and more on request"]].map(([v, l], i) => (
                <div key={i} className={cn(CARD, "px-4 py-3.5")}>
                  <strong className="block text-lg tracking-[-0.01em] sm:text-[22px]"><EditableText id={`dmc:about:fact${i + 1}:value`} defaultValue={v} /></strong>
                  <span className="text-[13px] text-muted-foreground"><EditableText id={`dmc:about:fact${i + 1}:label`} defaultValue={l} /></span>
                </div>
              ))}
            </div>
          </div>
          <Photo id="dmc:about:image" src={IMG.intro} alt="Guided tour with Sightseeing.lu" className="aspect-[4/3] overflow-hidden rounded-[10px]" />
        </section>

        {/* What we offer */}
        <section className="pb-[clamp(44px,7vw,80px)]">
          <SectionHead id="offer" label="What we offer" title="Tours and programmes for every kind of trip" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OFFERS.map((o) => (
              <article key={o.key} className={cn(CARD, "flex min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(29,38,43,.08)]")}>
                <Photo id={`dmc:offer:${o.key}:image`} src={o.img} className="aspect-[3/2]" />
                <div className="flex flex-1 flex-col gap-2.5 p-[18px] pb-5">
                  <span className={cn("text-xs font-semibold", MINT_DARK)}><EditableText id={`dmc:offer:${o.key}:kicker`} defaultValue={o.kicker} /></span>
                  <h3 className="text-lg font-bold leading-snug"><EditableText id={`dmc:offer:${o.key}:title`} defaultValue={o.title} /></h3>
                  <p className="text-[14.5px] text-muted-foreground"><EditableText id={`dmc:offer:${o.key}:text`} multiline defaultValue={o.text} /></p>
                  <ul className="mt-0.5 grid gap-1.5 text-sm">
                    {o.items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2"><Check /><EditableText id={`dmc:offer:${o.key}:item${i + 1}`} defaultValue={it} /></li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Services */}
        <section id="services" className="pb-[clamp(44px,7vw,80px)]">
          <SectionHead id="services" label="Take a tour" title="Our services" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <li key={s.key} className={cn(CARD, "flex min-w-0 items-start gap-3 p-4")}>
                <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-[10px]", MINT_TINT)}>
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="#3f9c83" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SERVICE_ICONS[s.key]}</svg>
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-[15px] leading-tight"><EditableText id={`dmc:services:${s.key}:title`} defaultValue={s.title} /></strong>
                  <span className="text-[13.5px] text-muted-foreground"><EditableText id={`dmc:services:${s.key}:text`} defaultValue={s.text} /></span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Mission */}
        <section id="mission" className="pb-[clamp(44px,7vw,80px)]">
          <div className={cn("flex flex-col gap-4 rounded-2xl p-[clamp(24px,5vw,48px)]", MINT_TINT)}>
            <Pill id="dmc:mission:label" text="Our mission" className="bg-white" />
            <p className="max-w-[52ch] text-[clamp(19px,2.2vw,26px)] font-semibold leading-[1.4] tracking-[-0.01em]">
              <EditableText id="dmc:mission:text" multiline defaultValue="Our mission is to provide a great and sustainable experience for travellers visiting Luxembourg. We work with all stakeholders to reduce any negative impact on the natural environment and on the local communities where we operate." />
            </p>
          </div>
        </section>
      </div>

      {/* Destinations (full-width white band) */}
      <section className="border-y border-border bg-card py-[clamp(44px,7vw,80px)]">
        <div className="mx-auto max-w-[1180px] px-4">
          <SectionHead id="dest" label="Destinations" title="Luxembourg from north to south" lead="A small country with a lot to discover. Every region is easy to reach in a day, so themes and places combine into one smooth programme." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map((d) => (
              <article key={d.key} className={cn(CARD, "flex min-w-0 flex-col overflow-hidden")}>
                <Photo id={`dmc:dest:${d.key}:image`} src="" placeholder={d.photo} className="aspect-[4/3]" />
                <div className="flex flex-1 flex-col gap-2.5 p-[18px] pb-5">
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", MINT_TINT, MINT_DARK)}><EditableText id={`dmc:dest:${d.key}:flag`} defaultValue={d.flag} /></span>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold"><EditableText id={`dmc:dest:${d.key}:area`} defaultValue={d.area} /></span>
                  </div>
                  <h3 className="text-lg font-bold leading-snug"><EditableText id={`dmc:dest:${d.key}:title`} defaultValue={d.title} /></h3>
                  <p className="text-[14.5px] text-muted-foreground"><EditableText id={`dmc:dest:${d.key}:text`} multiline defaultValue={d.text} /></p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-7 max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-muted-foreground">
            <EditableText id="dmc:dest:footnote" multiline defaultValue="Every theme is also available as a private tour with your own guide, tailored to your guests' interests and pace." />
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-4">
        {/* Partners */}
        <section className="grid items-start gap-[clamp(24px,4vw,56px)] py-[clamp(44px,7vw,80px)] lg:grid-cols-[.85fr_1.15fr]">
          <div className="flex min-w-0 flex-col gap-3">
            <Pill id="dmc:partners:label" text="Who we work with" />
            <h2 className="text-balance text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.15] tracking-[-0.015em]">
              <EditableText id="dmc:partners:title" defaultValue="Built for travel professionals" />
            </h2>
            <p className="border-l-4 border-primary pl-4 text-[clamp(18px,1.9vw,22px)] font-semibold leading-[1.45]">
              <EditableText id="dmc:partners:statement" multiline defaultValue="Whether you are a tour operator, a coach company or a hotel concierge, we always have the right offer ready for you, and we will show your guests Luxembourg in the most beautiful way." />
            </p>
            <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-muted-foreground">
              <EditableText id="dmc:partners:lead" multiline defaultValue="We supply single services or complete programmes, ready to sell under your name or ours." />
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className={cn("flex flex-col gap-1 rounded-[10px] px-[22px] py-5 sm:col-span-2", MINT_TINT)}>
              <span className={cn("text-xs font-bold tracking-[.06em]", MINT_DARK)}><EditableText id="dmc:partners:fit:kicker" defaultValue="FIT" /></span>
              <strong className="text-[15.5px]"><EditableText id="dmc:partners:fit:title" defaultValue="Your reliable partner for individual travellers" /></strong>
              <span className="text-[15px]"><EditableText id="dmc:partners:fit:text" multiline defaultValue="Many renowned FIT operators rely on us as their partner in Luxembourg. From accommodation to excursions, transfers and special requests, Sightseeing.lu is a true specialist in individual travel." /></span>
            </div>
            {PARTNERS.map((p) => (
              <div key={p.key} className={cn(CARD, "flex flex-col gap-1 px-[18px] py-4")}>
                <strong className="text-[15.5px]"><EditableText id={`dmc:partners:${p.key}:title`} defaultValue={p.title} /></strong>
                <span className="text-sm text-muted-foreground"><EditableText id={`dmc:partners:${p.key}:text`} defaultValue={p.text} /></span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="pb-[clamp(44px,7vw,80px)]">
          <SectionHead id="steps" label="How it works" title="From your request to the tour day" />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.key} className={cn(CARD, "flex flex-col gap-2 p-5")}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[15px] font-bold text-white">{s.key}</span>
                <h3 className="text-lg font-bold leading-snug"><EditableText id={`dmc:steps:${s.key}:title`} defaultValue={s.title} /></h3>
                <p className="text-[14.5px] text-muted-foreground"><EditableText id={`dmc:steps:${s.key}:text`} multiline defaultValue={s.text} /></p>
              </li>
            ))}
          </ol>
        </section>

        {/* Brochure */}
        <section id="brochure" className="scroll-mt-20 pb-[clamp(44px,7vw,80px)]">
          <div className="grid items-center gap-[clamp(24px,5vw,56px)] rounded-2xl bg-[#1d262b] p-[clamp(24px,5vw,52px)] text-white sm:grid-cols-[auto_1fr]">
            <div className="grid aspect-[210/297] w-[150px] max-w-full -rotate-3 grid-rows-[1fr_auto] overflow-hidden rounded-md bg-white shadow-[0_20px_40px_rgba(0,0,0,.35)] sm:w-[190px]" aria-hidden="true">
              <Photo id="dmc:brochure:cover" src={IMG.hero} className="h-full" />
              <div className="px-3.5 py-3 text-[15px] font-bold leading-tight text-[#1d262b]">
                <EditableText id="dmc:brochure:cover:title" defaultValue="DMC & Tour Operator" />
                <small className="mt-1 block text-[11px] font-medium text-[#6b7980]"><EditableText id="dmc:brochure:cover:sub" defaultValue="sightseeing.lu · Brochure" /></small>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <Pill id="dmc:brochure:label" text="Brochure" className="bg-[rgba(123,198,177,.18)] text-primary" />
              <h2 className="text-balance text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.15] tracking-[-0.015em]">
                <EditableText id="dmc:brochure:title" defaultValue="All our programmes in one PDF" />
              </h2>
              <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-white/80">
                <EditableText id="dmc:brochure:lead" multiline defaultValue="Private tours, group packages, tailor-made ideas and multi-day trips at a glance. Share it with your team or your clients." />
              </p>
              <div>
                {/* The admin sets the PDF link via the "Link" chip in the page editor. */}
                <EditableLink id="dmc:brochure:cta:href" defaultHref="#contact" newTab className={BTN_PRIMARY}>
                  <DownloadIcon />
                  <EditableText id="dmc:brochure:cta" defaultValue="Download brochure (PDF)" />
                </EditableLink>
              </div>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-20 pb-[clamp(44px,7vw,80px)]">
          <div className={cn("grid items-start gap-[clamp(24px,4vw,48px)] rounded-2xl p-[clamp(20px,5vw,48px)] lg:grid-cols-[.8fr_1.2fr]", MINT_TINT)}>
            <div className="flex min-w-0 flex-col gap-3.5">
              <Pill id="dmc:contact:label" text="Contact" className="bg-white" />
              <h2 className="text-balance text-[clamp(26px,3.4vw,38px)] font-bold leading-[1.15] tracking-[-0.015em]">
                <EditableText id="dmc:contact:title" defaultValue="Planning a trip to Luxembourg?" />
              </h2>
              <p className="max-w-[65ch] text-[clamp(16px,1.5vw,19px)] text-muted-foreground">
                <EditableText id="dmc:contact:lead" multiline defaultValue="Tell us about your guests and your plans. We will reply with a programme proposal." />
              </p>
              <div className="mt-2 grid gap-2.5 rounded-[10px] bg-card px-5 py-[18px] text-[15px]">
                {[["email", "E-mail", "[add e-mail]"], ["phone", "Phone", "[add phone]"], ["address", "Address", "[add address]"]].map(([k, label, value]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-3 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
                    <span className="text-muted-foreground"><EditableText id={`dmc:contact:${k}:label`} defaultValue={label} /></span>
                    <b className={cn("font-semibold", MINT_DARK)}><EditableText id={`dmc:contact:${k}:value`} defaultValue={value} /></b>
                  </div>
                ))}
              </div>
            </div>
            <DmcForm />
          </div>
        </section>
      </div>
    </main>
  )
}

/* ── Contact form ───────────────────────────────────────────────────────── */

const FIELD_ERRORS: Partial<Record<DmcField, string>> = {
  purpose: "Please choose the purpose of your request.",
  name: "Please enter your name.",
  email: "Please enter a valid e-mail address.",
  phone: "Please enter a valid phone number.",
  website: "Please enter a full web address, starting with https://",
  message: "Please write a short message.",
}

const INPUT = "w-full rounded-[10px] border-[1.5px] border-border bg-background px-3.5 py-3 text-[15px] text-foreground placeholder:text-[#9aa6ac] transition hover:border-[#c9d1d4] focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#e6f4f0]"

function DmcForm() {
  const empty = { purpose: "", name: "", email: "", phone: "", destination: "", company: "", website: "", message: "", fax: "" }
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState<Set<DmcField>>(new Set())
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [serverError, setServerError] = useState("")

  const set = (k: keyof typeof empty, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors.has(k as DmcField)) {
      const next = new Set(errors); next.delete(k as DmcField); setErrors(next)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const check = validateDmcInquiry(form)
    if (!check.ok) {
      setErrors(new Set(check.errors))
      document.getElementById(`dmc-f-${check.errors[0]}`)?.focus()
      return
    }
    setErrors(new Set())
    setStatus("sending")
    setServerError("")
    try {
      const res = await fetch("/api/dmc-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: DmcField[] }
      if (!res.ok) {
        if (body.fields?.length) setErrors(new Set(body.fields))
        setServerError(body.error ?? "Sorry, something went wrong. Please try again.")
        setStatus("error")
        return
      }
      setStatus("sent")
      setForm(empty)
    } catch {
      setServerError("Network error — please check your connection and try again.")
      setStatus("error")
    }
  }

  const err = (k: DmcField) => errors.has(k) && FIELD_ERRORS[k] ? (
    <small className="mt-1.5 text-[12.5px] text-[#c2414b]">{FIELD_ERRORS[k]}</small>
  ) : null
  const bad = (k: DmcField) => errors.has(k) && "border-[#d9646d]"

  if (status === "sent") {
    return (
      <div className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-card p-[clamp(18px,3vw,32px)] shadow-[0_10px_30px_rgba(29,38,43,.06)]">
        <strong className="text-lg">Thank you — your request has been sent.</strong>
        <span className="text-muted-foreground">We will reply with a programme proposal as soon as possible.</span>
        <button type="button" onClick={() => setStatus("idle")} className={cn("mt-3 w-fit text-sm font-semibold", MINT_DARK)}>Send another request</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="relative flex min-w-0 flex-col gap-[18px] rounded-[14px] bg-card p-[clamp(18px,3vw,32px)] shadow-[0_10px_30px_rgba(29,38,43,.06)]">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold">Purpose of your request <i className={cn("not-italic", MINT_DARK)}>*</i></legend>
        <div className="flex flex-wrap gap-2">
          {DMC_PURPOSES.map((p, i) => (
            <label key={p.value} className="relative cursor-pointer">
              <input
                id={i === 0 ? "dmc-f-purpose" : undefined}
                type="radio" name="purpose" value={p.value}
                checked={form.purpose === p.value}
                onChange={() => set("purpose", p.value)}
                className="peer absolute h-px w-px opacity-0"
              />
              <span className={cn(
                "inline-block rounded-full border-[1.5px] border-border bg-background px-3.5 py-2 text-sm font-semibold transition hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-[#e6f4f0]",
                errors.has("purpose") && "border-[#e5a3a8]",
              )}>{p.label}</span>
            </label>
          ))}
        </div>
        {err("purpose")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-name" className="mb-2 text-sm font-semibold">Name <i className={cn("not-italic", MINT_DARK)}>*</i></label>
          <input id="dmc-f-name" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" placeholder="First and last name" className={cn(INPUT, bad("name"))} />
          {err("name")}
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-email" className="mb-2 text-sm font-semibold">E-mail <i className={cn("not-italic", MINT_DARK)}>*</i></label>
          <input id="dmc-f-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" placeholder="name@company.com" className={cn(INPUT, bad("email"))} />
          {err("email")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-phone" className="mb-2 text-sm font-semibold">Phone</label>
          <input id="dmc-f-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="+352 …" className={cn(INPUT, bad("phone"))} />
          {err("phone")}
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-destination" className="mb-2 text-sm font-semibold">Destination</label>
          <select id="dmc-f-destination" value={form.destination} onChange={(e) => set("destination", e.target.value)} className={cn(INPUT, "cursor-pointer")}>
            <option value="">Choose a destination</option>
            {DMC_DESTINATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-company" className="mb-2 text-sm font-semibold">Company name</label>
          <input id="dmc-f-company" value={form.company} onChange={(e) => set("company", e.target.value)} autoComplete="organization" placeholder="Your company" className={INPUT} />
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="dmc-f-website" className="mb-2 text-sm font-semibold">Company website</label>
          <input id="dmc-f-website" type="url" value={form.website} onChange={(e) => set("website", e.target.value)} autoComplete="url" placeholder="https://www.example.com" className={cn(INPUT, bad("website"))} />
          {err("website")}
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <label htmlFor="dmc-f-message" className="mb-2 text-sm font-semibold">Your message <i className={cn("not-italic", MINT_DARK)}>*</i></label>
        <textarea id="dmc-f-message" rows={5} maxLength={DMC_MESSAGE_MAX} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Please write a message: dates, number of guests, interests, special requests…" className={cn(INPUT, "min-h-[130px] resize-y leading-normal", bad("message"))} />
        <div className="flex justify-between gap-3">
          {err("message") ?? <span />}
          <small className="mt-1.5 text-xs tabular-nums text-muted-foreground">{form.message.length} / {DMC_MESSAGE_MAX}</small>
        </div>
      </div>

      {/* Honeypot — hidden from people, tempting for bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="dmc-f-fax">Fax</label>
        <input id="dmc-f-fax" tabIndex={-1} autoComplete="off" value={form.fax} onChange={(e) => set("fax", e.target.value)} />
      </div>

      {status === "error" && serverError && (
        <p role="alert" className="rounded-[10px] bg-[#fdecee] px-4 py-3 text-sm text-[#a2323b]">{serverError}</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={status === "sending"} className={cn(BTN_PRIMARY, "cursor-pointer border-0 disabled:opacity-60")}>
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2-7z" /></svg>
          {status === "sending" ? "Sending…" : "Send request"}
        </button>
        <small className="text-[12.5px] text-muted-foreground"><i className={cn("not-italic", MINT_DARK)}>*</i> Required fields</small>
      </div>
    </form>
  )
}
