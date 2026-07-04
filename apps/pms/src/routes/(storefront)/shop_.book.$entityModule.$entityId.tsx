import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useParams, useSearch } from "@tanstack/react-router"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import type { BookingEntitySummary } from "@voyant-travel/bookings-react/journey"
import type { CruiseContent } from "@voyant-travel/cruises/content-shape"
import type { ProductContent } from "@voyant-travel/inventory/content-shape"
import { useMemo } from "react"
import { z } from "zod"

import { StorefrontBookingJourney } from "@/components/voyant/booking-journey/storefront-booking-journey"
import { getApiUrl } from "@/lib/env"
import { useStorefrontMessagesOrDefault } from "@/lib/storefront-i18n"

/**
 * Storefront booking-journey route. The customer arrives here from
 * the product / cruise / accommodations detail page with **the
 * relevant configure inputs already locked in** via search params.
 * The journey itself only handles travelers + add-ons + payment;
 * the Configure step is hidden because Configure already happened
 * upstream.
 *
 * Per booking-journey-architecture §10 Phase B.
 *
 * **No `sourceKind` in the URL.** The public engine route resolves
 * provenance from `(entityModule, entityId)` server-side.
 */
const shopBookSearchSchema = z.object({
  /** Schedule pointer — exactly the right subset per vertical:
   *   - products → `departureSlotId`
   *   - cruises  → `departureSlotId` (sailing id) +
   *               `cabinCategoryId`, optionally `cabinNumberId` +
   *               `airArrangement`
   *   - accommodations → `checkIn` + `checkOut` + `roomTypeId` +
   *               `ratePlanId`, optionally `board`
   * The detail page fills the right subset before navigating.
   */
  departureSlotId: z.string().optional(),
  cabinCategoryId: z.string().optional(),
  cabinNumberId: z.string().optional(),
  airArrangement: z.enum(["cruise_line", "independent", "none"]).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  roomTypeId: z.string().optional(),
  ratePlanId: z.string().optional(),
  board: z.string().optional(),
  /** Pax counts per band. Adults default to 1 if absent so the
   *  validation passes; children + infants default to 0. */
  adult: z.coerce.number().int().min(0).optional(),
  child: z.coerce.number().int().min(0).optional(),
  infant: z.coerce.number().int().min(0).optional(),
  draftId: z.string().optional(),
})

export const Route = createFileRoute("/(storefront)/shop_/book/$entityModule/$entityId")({
  component: ShopBookRouteComponent,
  validateSearch: shopBookSearchSchema,
})

function ShopBookRouteComponent(): React.ReactElement {
  const { entityModule, entityId } = useParams({
    from: "/(storefront)/shop_/book/$entityModule/$entityId",
  })
  const search = useSearch({ from: "/(storefront)/shop_/book/$entityModule/$entityId" })
  const t = useStorefrontMessagesOrDefault().bookingJourney
  const draftId = useMemo(() => search.draftId ?? generateDraftId(), [search.draftId])

  const initialConfigure: Record<string, unknown> = {
    pax: {
      adult: search.adult ?? 1,
      child: search.child ?? 0,
      infant: search.infant ?? 0,
    },
  }
  if (search.departureSlotId) initialConfigure.departureSlotId = search.departureSlotId
  if (search.cabinCategoryId) initialConfigure.cabinCategoryId = search.cabinCategoryId
  if (search.cabinNumberId) initialConfigure.cabinNumberId = search.cabinNumberId
  if (search.airArrangement) initialConfigure.airArrangement = search.airArrangement
  if (search.checkIn && search.checkOut) {
    initialConfigure.dateRange = { checkIn: search.checkIn, checkOut: search.checkOut }
  }
  if (search.roomTypeId) initialConfigure.roomTypeId = search.roomTypeId
  if (search.ratePlanId) initialConfigure.ratePlanId = search.ratePlanId
  if (search.board) initialConfigure.board = search.board

  const initialAccommodation = search.roomTypeId
    ? {
        rooms: [
          {
            optionUnitId: search.roomTypeId,
            quantity: 1,
            ...(search.ratePlanId ? { ratePlanId: search.ratePlanId } : {}),
          },
        ],
        travelerAssignments: {},
      }
    : undefined

  const entitySummary = useEntitySummary(entityModule, entityId, search)

  return (
    <StorefrontBookingJourney
      entityModule={entityModule}
      entityId={entityId}
      draftId={draftId}
      initialConfigure={initialConfigure}
      initialAccommodation={initialAccommodation}
      entitySummary={entitySummary}
      // No `contractTemplateSlug` — the wrapper resolves whichever
      // customer-scope template the operator has marked active via
      // /v1/public/legal/contracts/templates/default. Per-product
      // overrides plug in here once products grow a
      // `contractTemplateSlug` field.
      contractMarketingLabel={t.marketingLabel}
    />
  )
}

/**
 * Pull the entity content for the side-panel summary. Three
 * vertical-specific endpoints share the same `{ data: { content,
 * served_locale, ... } }` envelope; we map each into a
 * vertical-agnostic `BookingEntitySummary`.
 */
function useEntitySummary(
  entityModule: string,
  entityId: string,
  search: ShopBookSearch,
): BookingEntitySummary | undefined {
  const url =
    entityModule === "cruises"
      ? `${getApiUrl()}/v1/public/cruises/${encodeURIComponent(entityId)}/content`
      : entityModule === "accommodations"
        ? `${getApiUrl()}/v1/public/accommodations/${encodeURIComponent(entityId)}/content`
        : entityModule === "products"
          ? `${getApiUrl()}/v1/public/products/${encodeURIComponent(entityId)}/content`
          : null

  const { data } = useQuery({
    queryKey: ["public-entity-summary", entityModule, entityId],
    queryFn: async (): Promise<unknown> => {
      if (!url) return null
      const res = await fetch(url, { credentials: "include" })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: { content?: unknown } }
      return json.data?.content ?? null
    },
    enabled: Boolean(url),
    staleTime: 60_000,
  })

  return useMemo<BookingEntitySummary | undefined>(() => {
    if (!data) return undefined
    if (entityModule === "products") {
      const c = data as ProductContent
      const subtitleParts = [
        c.product.duration_days
          ? `${c.product.duration_days} day${c.product.duration_days === 1 ? "" : "s"}`
          : null,
        c.product.country ?? null,
      ].filter(Boolean) as string[]
      const dep = c.departures?.find((d) => d.id === search.departureSlotId)
      return {
        name: c.product.name,
        subtitle: subtitleParts.join(" · ") || undefined,
        heroImageUrl: c.product.hero_image_url ?? c.media?.[0]?.url ?? undefined,
        vertical: "products",
        whenLabel: dep ? formatDate(dep.starts_at) : undefined,
        locationLabel: c.product.departure_city ?? c.product.country ?? undefined,
        startDate: dep?.starts_at ?? undefined,
        endDate: dep?.ends_at ?? undefined,
        destination: c.product.country ?? c.product.departure_city ?? undefined,
      }
    }
    if (entityModule === "cruises") {
      const c = data as CruiseContent
      const sailing = c.sailings.find((s) => s.id === search.departureSlotId)
      const subtitleParts = [
        c.cruise.duration_nights
          ? `${c.cruise.duration_nights} night${c.cruise.duration_nights === 1 ? "" : "s"}`
          : null,
        c.ship?.name ?? null,
      ].filter(Boolean) as string[]
      const route = sailing
        ? sailing.embarkation_port && sailing.disembarkation_port
          ? `${sailing.embarkation_port} → ${sailing.disembarkation_port}`
          : (sailing.embarkation_port ?? null)
        : null
      return {
        name: c.cruise.name,
        subtitle: subtitleParts.join(" · ") || undefined,
        heroImageUrl: c.cruise.hero_image_url ?? undefined,
        vertical: "cruises",
        whenLabel: sailing ? formatDate(sailing.start_date) : undefined,
        locationLabel: route ?? undefined,
        startDate: sailing?.start_date ?? undefined,
        endDate: sailing?.end_date ?? undefined,
        destination: route ?? undefined,
      }
    }
    if (entityModule === "accommodations") {
      const c = data as AccommodationContent
      const stars = c.hotel.star_rating ? "★".repeat(Math.floor(c.hotel.star_rating)) : null
      return {
        name: c.hotel.name,
        subtitle: stars ?? undefined,
        heroImageUrl: c.hotel.hero_image_url ?? undefined,
        vertical: "accommodations",
        whenLabel:
          search.checkIn && search.checkOut
            ? `${formatDate(search.checkIn)} → ${formatDate(search.checkOut)}`
            : undefined,
        startDate: search.checkIn ?? undefined,
        endDate: search.checkOut ?? undefined,
        destination: c.hotel.city ?? c.hotel.country ?? undefined,
      }
    }
    return undefined
  }, [data, entityModule, search.departureSlotId, search.checkIn, search.checkOut])
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

type ShopBookSearch = z.infer<typeof shopBookSearchSchema>

function generateDraftId(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return `bdrf_${globalThis.crypto.randomUUID().replace(/-/g, ``)}`
  }
  return `bdrf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
