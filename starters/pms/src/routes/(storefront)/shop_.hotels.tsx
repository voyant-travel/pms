"use client"

import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"

import { AvailabilityBar } from "@/components/storefront/site/availability-bar"
import { Container, Eyebrow, SectionHeading } from "@/components/storefront/site/primitives"
import { PropertyCard } from "@/components/storefront/site/property-card"
import { usePropertyPortfolio } from "@/components/storefront/site/use-property-portfolio"
import { staySearchSchema } from "@/components/storefront/stay-search"

/**
 * "Our Hotels" — the full Acme collection. Doubles as the dates-aware
 * search-results surface: when the hero (or the availability bar here)
 * submits a stay, cards carry the window and show live "from / night"
 * pricing for it. Filterable by city.
 */
const hotelsSearchSchema = staySearchSchema.extend({
  city: z.string().optional(),
})

export const Route = createFileRoute("/(storefront)/shop_/hotels")({
  component: HotelsPage,
  validateSearch: hotelsSearchSchema,
})

function HotelsPage(): React.ReactElement {
  const search = Route.useSearch()
  const portfolio = usePropertyPortfolio()
  const [city, setCity] = useState<string | null>(search.city ?? null)

  const cities = [...new Set(portfolio.items.map((i) => i.city).filter(Boolean))] as string[]
  const visible = city ? portfolio.items.filter((i) => i.city === city) : portfolio.items

  return (
    <div className="bg-[var(--acme-paper)]">
      <Container className="py-16 sm:py-20">
        <div className="max-w-2xl">
          <Eyebrow>The collection</Eyebrow>
          <SectionHeading as="h1" className="mt-4">
            Our hotels
          </SectionHeading>
          <p className="mt-4 text-[var(--acme-ink-soft)] leading-relaxed">
            Three independent addresses across Romania. Pick your dates to check live availability
            and rates, or explore each hotel in its own right.
          </p>
        </div>

        <div className="mt-10">
          <AvailabilityBar items={portfolio.items} initial={search} variant="panel" />
        </div>

        {cities.length > 1 ? (
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <FilterChip
              label="All destinations"
              active={city === null}
              onClick={() => setCity(null)}
            />
            {cities.map((c) => (
              <FilterChip key={c} label={c} active={city === c} onClick={() => setCity(c)} />
            ))}
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {portfolio.isLoading && portfolio.items.length === 0
            ? Array.from({ length: 3 }, (_, i) => `sk-${i}`).map((k) => (
                <div key={k} className="animate-pulse">
                  <div className="aspect-[4/5] rounded-sm bg-[var(--acme-paper-deep)]" />
                  <div className="mt-5 h-6 w-2/3 rounded bg-[var(--acme-paper-deep)]" />
                </div>
              ))
            : visible.map((item, i) => (
                <PropertyCard key={item.propertyId} item={item} stay={search} index={i} />
              ))}
        </div>

        {!portfolio.isLoading && visible.length === 0 ? (
          <p className="mt-10 text-[var(--acme-ink-soft)]">No hotels match that destination.</p>
        ) : null}
      </Container>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active
          ? "border-[var(--acme-ink)] bg-[var(--acme-ink)] text-[var(--acme-paper)]"
          : "border-[var(--acme-line-strong)] text-[var(--acme-ink-soft)] hover:border-[var(--acme-ink)]"
      }`}
    >
      {label}
    </button>
  )
}
