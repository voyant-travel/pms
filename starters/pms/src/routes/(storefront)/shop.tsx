"use client"

import { createFileRoute, redirect } from "@tanstack/react-router"

import { Hero } from "@/components/storefront/site/hero"
import {
  AboutStrip,
  PropertyShowcase,
  WhyBookDirect,
} from "@/components/storefront/site/home-sections"
import { usePropertyPortfolio } from "@/components/storefront/site/use-property-portfolio"
import { staySearchSchema } from "@/components/storefront/stay-search"
import { getStorefrontConfig } from "@/lib/storefront-config"

/**
 * Acme Hotels home page — a full-bleed hero with the availability bar,
 * the three properties as an editorial showcase, a "why book direct"
 * strip, and an about-the-group teaser. Portfolio data comes from the
 * catalog search (accommodations vertical, public surface) grouped into
 * properties and hydrated with content.
 *
 * Single-property mode: when `STOREFRONT_SINGLE_PROPERTY_ID` is set the
 * loader redirects straight to that property's page — a property manager
 * pointing their own domain at one hotel.
 */
export const Route = createFileRoute("/(storefront)/shop")({
  component: StorefrontHome,
  validateSearch: staySearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const { singlePropertyId } = await getStorefrontConfig()
    if (singlePropertyId) {
      throw redirect({
        to: "/shop/products/$entityModule/$entityId",
        params: { entityModule: "accommodations", entityId: singlePropertyId },
        search: {
          ...(deps.checkIn ? { checkIn: deps.checkIn } : {}),
          ...(deps.checkOut ? { checkOut: deps.checkOut } : {}),
          ...(deps.adults ? { adults: deps.adults } : {}),
          ...(deps.children ? { children: deps.children } : {}),
          ...(deps.rooms ? { rooms: deps.rooms } : {}),
        },
      })
    }
    return null
  },
})

function StorefrontHome(): React.ReactElement {
  const search = Route.useSearch()
  const portfolio = usePropertyPortfolio()

  return (
    <>
      <Hero items={portfolio.items} />
      <PropertyShowcase
        items={portfolio.items}
        stay={search}
        isLoading={portfolio.isLoading}
      />
      <WhyBookDirect />
      <AboutStrip />
    </>
  )
}
