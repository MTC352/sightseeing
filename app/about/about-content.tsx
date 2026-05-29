"use client"

import Image from "next/image"
import { EditableText } from "@/components/editable-text"
import { EditableImage } from "@/components/editable-image"

export function AboutHeroText() {
  return (
    <>
      <p className="text-sm font-medium text-primary">
        <EditableText id="about:hero:label" defaultValue="About sightseeing.lu" />
      </p>
      <h1 className="mt-2 text-balance text-3xl font-bold text-foreground lg:text-4xl">
        <EditableText id="about:hero:heading" defaultValue="Luxembourg's Handpicked Experiences Platform" />
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground leading-relaxed">
        <EditableText
          id="about:hero:description"
          defaultValue="sightseeing.lu is Luxembourg's leading tourism platform, connecting travellers with the best tours, activities, and experiences across the Grand Duchy. Founded in 2020, we work with over 25 local guides and partners to offer 50+ handpicked experiences — from food tours and wine tastings to castle day trips and dinner hopping adventures."
          multiline
        />
      </p>
    </>
  )
}

export function AboutStoryText() {
  return (
    <>
      <h2 className="text-2xl font-bold text-foreground">
        <EditableText id="about:story:heading" defaultValue="Our Story" />
      </h2>
      <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground leading-relaxed">
        <p>
          <EditableText
            id="about:story:p1"
            defaultValue="sightseeing.lu was born from a simple observation: Luxembourg is one of Europe's most underrated destinations. With its fairy-tale castles, world-class wine region, UNESCO World Heritage sites, and thriving culinary scene, the Grand Duchy deserves to be explored beyond a quick day trip."
            multiline
          />
        </p>
        <p>
          <EditableText
            id="about:story:p2"
            defaultValue="We started in 2020 with a single product — the now-iconic Dinner Hopping Bus, a multi-restaurant culinary experience aboard a converted American School Bus. The concept was an instant hit, and we quickly expanded to offer walking tours, e-bike adventures, museum passes, wine tastings along the Moselle Valley, and much more."
            multiline
          />
        </p>
        <p>
          <EditableText
            id="about:story:p3"
            defaultValue="Today, sightseeing.lu is the country's largest experience platform, trusted by over 12,000 travellers and offering 50+ curated activities across multiple locations. Every experience on our platform is personally vetted, and our team of local guides ensures an authentic, high-quality experience every time."
            multiline
          />
        </p>
      </div>
    </>
  )
}

export function AboutValuesHeading() {
  return (
    <h2 className="text-2xl font-bold text-foreground">
      <EditableText id="about:values:heading" defaultValue="What We Stand For" />
    </h2>
  )
}

export function AboutOfferHeading() {
  return (
    <>
      <h2 className="text-2xl font-bold text-foreground">
        <EditableText id="about:offer:heading" defaultValue="What We Offer" />
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        <EditableText id="about:offer:subheading" defaultValue="Browse our curated categories of experiences across Luxembourg." />
      </p>
    </>
  )
}

export function AboutReviewsHeading() {
  return (
    <h2 className="text-2xl font-bold text-foreground">
      <EditableText id="about:reviews:heading" defaultValue="What Our Travellers Say" />
    </h2>
  )
}

export function AboutHeroImage() {
  return (
    <EditableImage
      id="about:hero:image"
      defaultValue="/images/about-hero.jpg"
      className="absolute inset-0"
      label="Change hero image"
    >
      {(src) => (
        <Image
          src={src}
          alt="Panoramic view of Luxembourg City"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
      )}
    </EditableImage>
  )
}

export function AboutTeamImage() {
  return (
    <EditableImage
      id="about:team:image"
      defaultValue="/images/about-team.jpg"
      className="absolute inset-0"
      label="Change team image"
    >
      {(src) => (
        <Image
          src={src}
          alt="The sightseeing.lu team"
          fill
          className="object-cover"
          sizes="(max-width:1024px) 100vw, 384px"
        />
      )}
    </EditableImage>
  )
}
