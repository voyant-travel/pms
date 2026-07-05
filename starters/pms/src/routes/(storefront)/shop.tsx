"use client"

import { createFileRoute, redirect } from "@tanstack/react-router"
import { useCatalogSearch } from "@voyant-travel/catalog-react"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"

import {
  buildPropertyCards,
  type PropertyCardVM,
} from "@/components/storefront/property-card-model"
import { PropertyResults } from "@/components/storefront/property-results"
import { type StaySearch, staySearchSchema } from "@/components/storefront/stay-search"
import { StaySearchBar } from "@/components/storefront/stay-search-bar"
import { getStorefrontConfig } from "@/lib/storefront-config"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Property-first storefront landing. Search = destination + dates +
 * occupancy; results are accommodation properties served by the catalog
 * search API restricted to the `accommodations` vertical (storefront-card
 * projection, public surface).
 *
 * Single-property mode: when `STOREFRONT_SINGLE_PROPERTY_ID` is set the
 * loader redirects straight to that property's detail page and the search
 * UI never renders — a property manager pointing their domain at one hotel.
 */
export const Route = createFileRoute("/(storefront)/shop")({
  component: StorefrontIndex,
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

function StorefrontIndex(): React.ReactElement {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const t = useStorefrontMessagesOrDefault().staySearch

  const result = useCatalogSearch({
    surface: "public",
    vertical: "accommodations",
    query: search.destination ?? "",
    mode: "keyword",
    projection: "storefront-card",
    pagination: { limit: 24 },
    enabled: true,
  })

  const cards: PropertyCardVM[] = buildPropertyCards(result.data)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">{t.heading}</h1>
        <p className="text-muted-foreground">{t.intro}</p>
      </div>

      <StaySearchBar
        initial={search}
        onSearch={(next) => {
          navigate({ search: (s: StaySearch) => ({ ...s, ...next }) })
        }}
      />

      {result.isError ? (
        <SearchUnavailable />
      ) : result.isLoading ? (
        <SearchSkeleton />
      ) : cards.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-medium text-lg">
            {t.resultsCount.replace("{count}", String(cards.length))}
          </h2>
          <PropertyResults cards={cards} stay={search} />
        </div>
      ) : (
        <SearchEmpty />
      )}
    </div>
  )
}

function SearchUnavailable(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().staySearch
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.unavailableTitle}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        <p>{t.unavailableBody}</p>
      </CardContent>
    </Card>
  )
}

function SearchSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => `skel-${i}`).map((key) => (
        <Card key={key}>
          <Skeleton className="aspect-[4/3] w-full" />
          <CardContent className="space-y-2 pt-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SearchEmpty(): React.ReactElement {
  const t = useStorefrontMessagesOrDefault().staySearch
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm">{t.noResults}</p>
      </CardContent>
    </Card>
  )
}
