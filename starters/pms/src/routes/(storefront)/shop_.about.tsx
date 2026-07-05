"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Container,
  Eyebrow,
  Section,
  SectionHeading,
} from "@/components/storefront/site/primitives"
import {
  ACME_DIRECTORY,
  ACME_PROPERTY_CONTENT,
  picsum,
} from "@/components/storefront/site/property-content"

/**
 * About the group — a branded static page telling the Acme Hotels
 * story, its values, and a short profile of each property.
 */
export const Route = createFileRoute("/(storefront)/shop_/about")({
  component: AboutPage,
})

const VALUES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Independent",
    body: "Family-owned since 1924. No shareholders to please, no chain playbook — just our own standards, held closely.",
  },
  {
    title: "Rooted in place",
    body: "Each hotel is run by people who live nearby and know their city, from the best table in town to the quiet corners.",
  },
  {
    title: "Honest by default",
    body: "The best rate is always here on our own site. Clear pricing, flexible options, and no fees bolted on at the end.",
  },
]

function AboutPage(): React.ReactElement {
  return (
    <div className="bg-[var(--acme-paper)]">
      <section className="relative isolate flex min-h-[46vh] items-end overflow-hidden">
        <img
          src={picsum("acme-grand-lobby", 2200, 1200)}
          alt="An Acme hotel interior"
          className="-z-10 absolute inset-0 h-full w-full object-cover"
        />
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-black/65 to-black/25" />
        <Container className="pb-12 text-white">
          <Eyebrow className="text-[var(--acme-accent-soft)]">Our story</Eyebrow>
          <h1 className="acme-serif mt-4 max-w-2xl text-balance text-4xl leading-[1.1] sm:text-5xl">
            A century of Romanian hospitality
          </h1>
        </Container>
      </section>

      <Section tone="paper">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5 text-[var(--acme-ink-soft)] text-lg leading-relaxed">
              <p>
                Acme Hotels began in 1924 with a single address on Calea Victoriei, when a Bucharest
                family opened their doors to travellers arriving by rail from across Europe. A
                century later we are still family-owned and still independent — three hotels across
                Romania, each chosen for its setting and looked after by people who live nearby.
              </p>
              <p>
                We have never wanted to be the biggest. We would rather be the place you come back
                to: a warm welcome at the desk, a bed made properly, a breakfast worth waking for,
                and a price that doesn't need a footnote. That is the whole of our philosophy, and
                it has served us well for a hundred years.
              </p>
            </div>
            <div className="space-y-6">
              {VALUES.map((v) => (
                <div key={v.title} className="border-[var(--acme-line)] border-t pt-5">
                  <h3 className="acme-serif text-xl">{v.title}</h3>
                  <p className="mt-2 text-[var(--acme-ink-soft)] text-sm leading-relaxed">
                    {v.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="surface">
        <Container>
          <Eyebrow>The collection</Eyebrow>
          <SectionHeading className="mt-4">Three hotels, three characters</SectionHeading>
          <div className="mt-12 space-y-16">
            {ACME_DIRECTORY.map((entry, i) => {
              const editorial = ACME_PROPERTY_CONTENT[entry.key]
              const flip = i % 2 === 1
              return (
                <div key={entry.key} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
                  <div
                    className={`relative aspect-[4/3] overflow-hidden rounded-sm ${
                      flip ? "lg:order-2" : ""
                    }`}
                  >
                    <img
                      src={picsum(editorial.gallerySeeds[0], 1100, 830)}
                      alt={entry.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className={flip ? "lg:order-1" : ""}>
                    <p className="text-[0.7rem] text-[var(--acme-ink-faint)] uppercase tracking-[0.18em]">
                      {entry.city} · {entry.stars}-star
                    </p>
                    <h3 className="acme-serif mt-2 text-3xl">{entry.name}</h3>
                    <p className="mt-4 text-[var(--acme-ink-soft)] leading-relaxed">
                      {editorial.intro}
                    </p>
                    <Link
                      to="/shop/hotels"
                      search={{ city: entry.city }}
                      className="acme-btn acme-btn-outline mt-6"
                    >
                      View hotel
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </Container>
      </Section>
    </div>
  )
}
