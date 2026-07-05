"use client"

import { useQueries } from "@tanstack/react-query"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import { useCatalogSearch } from "@voyant-travel/catalog-react"

import { ratePlansForRoom } from "@/components/storefront/rooms-matrix"
import { getApiUrl } from "@/lib/env"
import { fetchContent } from "@/routes/(storefront)/shop-product-detail-content"
import {
  type AcmePropertyContent,
  resolveAcmeContent,
} from "./property-content"
import { groupHitsByProperty } from "./property-portfolio"

/**
 * A single Acme property, assembled for the storefront: the hard facts
 * from the catalog content aggregate, the editorial content from the
 * Acme map, and the cheapest (room, rate) pair used to probe a live
 * "from / night" price.
 */
export interface PropertyPortfolioItem {
  /** Storefront entity id (a room-type id) used for links + content. */
  entityId: string
  propertyId: string
  name: string
  city: string | null
  country: string | null
  starRating: number | null
  description: string | null
  address: string | null
  editorial: AcmePropertyContent
  /** Cheapest room-type id + its first rate plan — drives the from-price probe. */
  fromRoomId: string | null
  fromRatePlanId: string | null
  /** Full content aggregate, kept for pages that want rooms/amenities. */
  content: AccommodationContent
}

export interface PropertyPortfolio {
  items: PropertyPortfolioItem[]
  isLoading: boolean
  isError: boolean
}

/**
 * Load the Acme property portfolio: one catalog search (room-type hits),
 * grouped into properties, each hydrated with its content aggregate and
 * editorial copy. Restricted to the accommodations vertical, public
 * surface — the same engine the operator uses.
 */
export function usePropertyPortfolio(destination?: string): PropertyPortfolio {
  const search = useCatalogSearch({
    surface: "public",
    vertical: "accommodations",
    query: destination ?? "",
    mode: "keyword",
    projection: "storefront-card",
    pagination: { limit: 48 },
    enabled: true,
  })

  const groups = groupHitsByProperty(search.data)

  const contentQueries = useQueries({
    queries: groups.map((group) => ({
      queryKey: ["acme-property-content", group.propertyId],
      queryFn: () =>
        fetchContent<AccommodationContent>(
          `${getApiUrl()}/v1/public/accommodations/${encodeURIComponent(
            group.representativeRoomId,
          )}/content`,
        ),
      staleTime: 60_000,
    })),
  })

  const items: PropertyPortfolioItem[] = groups.flatMap((group, i) => {
    const resolved = contentQueries[i]?.data
    if (!resolved) return []
    const content = resolved.content
    const hotel = content.hotel
    const firstRoom = content.room_types[0]
    const firstRate = firstRoom
      ? ratePlansForRoom(content, firstRoom.id)[0]
      : undefined
    return [
      {
        entityId: group.representativeRoomId,
        propertyId: group.propertyId,
        name: hotel.name,
        city: hotel.city ?? null,
        country: hotel.country ?? null,
        starRating: hotel.star_rating ?? null,
        description: hotel.description ?? null,
        address: hotel.address ?? null,
        editorial: resolveAcmeContent({
          thumbnailUrl: group.thumbnailUrl,
          name: hotel.name,
        }),
        fromRoomId: firstRoom?.id ?? null,
        fromRatePlanId: firstRate?.id ?? null,
        content,
      },
    ]
  })

  // Lead with the flagship: highest star rating first (nulls last),
  // preserving catalog order within a tier.
  const ordered = [...items].sort((a, b) => (b.starRating ?? 0) - (a.starRating ?? 0))

  return {
    items: ordered,
    isLoading: search.isLoading || contentQueries.some((q) => q.isLoading),
    isError: search.isError,
  }
}
