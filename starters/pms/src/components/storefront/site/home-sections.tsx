"use client"

import { Link } from "@tanstack/react-router"

import type { StaySearch } from "@/components/storefront/stay-search"
import { picsum } from "./property-content"
import { Container, Eyebrow, Section, SectionHeading } from "./primitives"
import { PropertyCard } from "./property-card"
import type { PropertyPortfolioItem } from "./use-property-portfolio"

/** The three properties as an editorial showcase. */
export function PropertyShowcase({
  items,
  stay,
  isLoading,
}: {
  items: ReadonlyArray<PropertyPortfolioItem>
  stay?: StaySearch
  isLoading: boolean
}): React.ReactElement {
  return (
    <Section tone="paper">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <Eyebrow>The collection</Eyebrow>
            <SectionHeading className="mt-4">Three hotels, one standard</SectionHeading>
            <p className="mt-4 text-[var(--acme-ink-soft)] leading-relaxed">
              Each Acme address has its own character and setting, held to the same quiet standard
              of comfort, service and design.
            </p>
          </div>
          <Link
            to="/shop/hotels"
            className="acme-btn acme-btn-outline shrink-0"
          >
            View all hotels
          </Link>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {isLoading && items.length === 0
            ? Array.from({ length: 3 }, (_, i) => `s-${i}`).map((k) => <CardSkeleton key={k} />)
            : items.map((item, i) => (
                <PropertyCard key={item.propertyId} item={item} stay={stay} index={i} />
              ))}
        </div>
      </Container>
    </Section>
  )
}

function CardSkeleton(): React.ReactElement {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/5] rounded-sm bg-[var(--acme-paper-deep)]" />
      <div className="mt-5 h-6 w-2/3 rounded bg-[var(--acme-paper-deep)]" />
      <div className="mt-3 h-4 w-full rounded bg-[var(--acme-paper-deep)]" />
    </div>
  )
}

const BENEFITS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Best rate, guaranteed",
    body: "The lowest price for every room is right here. Booking direct means no channel mark-up — ever.",
  },
  {
    title: "Flexible cancellation",
    body: "Choose a flexible rate and change your plans free of charge up to 24 hours before arrival.",
  },
  {
    title: "No booking fees",
    body: "The price you see is the price you pay. No hidden service charges, no surprises at check-out.",
  },
]

/** "Why book direct" reassurance strip. */
export function WhyBookDirect(): React.ReactElement {
  return (
    <Section tone="ink">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_2fr] lg:items-start">
          <div>
            <Eyebrow className="text-[var(--acme-accent-soft)]">Why book direct</Eyebrow>
            <SectionHeading className="mt-4 text-[var(--acme-paper)]">
              The best of Acme, only here
            </SectionHeading>
          </div>
          <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-3">
            {BENEFITS.map((b, i) => (
              <div key={b.title}>
                <div className="acme-serif text-2xl text-[var(--acme-accent-soft)]">
                  0{i + 1}
                </div>
                <div className="mt-3 h-px w-8 bg-white/25" />
                <h3 className="mt-4 font-medium text-[var(--acme-paper)]">{b.title}</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  )
}

/** About-the-group teaser with a link to the full About page. */
export function AboutStrip(): React.ReactElement {
  return (
    <Section tone="surface">
      <Container>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-sm">
            <img
              src={picsum("acme-grand-lobby", 1100, 830)}
              alt="Inside an Acme hotel"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <Eyebrow>Our story</Eyebrow>
            <SectionHeading className="mt-4">
              A family of hotels, run the old-fashioned way
            </SectionHeading>
            <div className="mt-5 space-y-4 text-[var(--acme-ink-soft)] leading-relaxed">
              <p>
                Acme Hotels began in 1924 with a single address on Calea Victoriei. A century on,
                we remain independent and family-run — three hotels across Romania, each chosen for
                its setting and looked after by people who live nearby.
              </p>
              <p>
                We believe a good stay is made of small things done well: a warm welcome, a
                well-made bed, an honest price. That is the whole of our philosophy.
              </p>
            </div>
            <Link to="/shop/about" className="acme-btn acme-btn-outline mt-8">
              About the group
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  )
}
