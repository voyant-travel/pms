import type { AdminDestinationResolvers } from "@voyant-travel/admin"
// Type-only: binds the `AdminDestinations` augmentations of the admin
// entries whose keys the CUSTOM resolvers below cover (bookings: the
// booking.* keys + product.detail; catalog: the journey/browse/detail keys;
// flights: flightBooking.start; legal: legal.home) into this program without
// pulling the admin bundles into the workspace-chrome chunk. The generated
// module binds the rest.
import type {} from "@voyant-travel/bookings-react/admin"
import type {} from "@voyant-travel/catalog-react/admin"
import type {} from "@voyant-travel/legal-react/admin"

import { generatedAdminDestinations } from "@/admin.destinations.generated"

/**
 * Operator resolver map for the semantic-destination contract (packaged-admin
 * RFC §4.7). Packaged pages navigate by `AdminDestinations` key through
 * `useAdminHref`/`useAdminNavigate`; this map is where the operator pins each
 * key to its route. `satisfies AdminDestinationResolvers` keeps it exhaustive:
 * mounting a package that declares a new destination fails the typecheck here
 * until the key is resolvable.
 *
 * Route-backed keys come from the spread of `generatedAdminDestinations`
 * (`voyant admin generate --destinations`, RFC §4.7 endgame): every route
 * contribution annotated with `destination:` resolves by pure path
 * interpolation, and `voyant admin doctor` gates on drift between the
 * annotations and the generated module. Hand-written below are ONLY the
 * genuinely custom resolvers: search-param construction (`booking.detail`,
 * `bookingJourney.start`, `catalog.detail`), multi-route targets
 * (`catalog.browse` spans the five surface routes), and host-owned pages the
 * packages don't contribute (`trip.create` — the trips composer is still an
 * app-custom route — plus `product.detail` and `legal.home`).
 * `bookingJourney.start`, `catalog.detail`, `flightBooking.start`),
 * multi-route targets (`catalog.browse` spans the five surface routes), and
 * host-owned pages the packages don't contribute (`booking.create`,
 * `product.detail`, `legal.home`).
 * packages don't contribute (`booking.create`, `legal.home`).
 *
 * Hrefs must match what the routes' typed `navigate` calls produced before
 * the contract existed — paths embed encoded params, search params keep the
 * journey schema's key order, and `undefined` values are omitted (key
 * presence is meaningful to the journey).
 *
 * `product.detail` moved to the generated map when the products domain
 * became package-delivered (`@voyant-travel/inventory-react/admin` annotates the
 * `/products/$id` contribution with it).
 */
export const operatorAdminDestinations = {
  ...generatedAdminDestinations,
  "booking.detail": ({ bookingId, tab }) =>
    `/bookings/${encodeURIComponent(bookingId)}${searchString({ tab })}`,
  "bookingJourney.start": ({ entityModule, entityId, ...search }) =>
    `/catalog/journey/${encodeURIComponent(entityModule)}/${encodeURIComponent(entityId)}${searchString(
      {
        sourceKind: search.sourceKind,
        sourceConnectionId: search.sourceConnectionId,
        sourceRef: search.sourceRef,
        departureId: search.departureId,
        departureDate: search.departureDate,
        optionId: search.optionId,
        roomTypeId: search.roomTypeId,
        ratePlanId: search.ratePlanId,
        board: search.board,
        entityName: search.entityName,
        entityImageUrl: search.entityImageUrl,
      },
    )}`,
  "catalog.browse": ({ surface }) => `/catalog/${surface}`,
  "catalog.detail": ({ surface, id, adults, nights }) =>
    `/catalog/${surface}/${encodeURIComponent(id)}${searchString({ adults, nights })}`,
  "legal.home": () => "/legal",
  "product.detail": ({ productId }) => `/products/${encodeURIComponent(productId)}`,
  // The packaged /bookings/compose alias forwards here; the trips composer
  // is an app-custom route ("new" is its create pseudo-id).
  "trip.create": () => "/trips/new",
} satisfies AdminDestinationResolvers

/**
 * Query string with `undefined` entries omitted, in insertion order.
 * `encodeURIComponent` round-trips through the router's search parser, so a
 * destination href navigated via `router.navigate({ href })` commits the same
 * location the old typed `navigate({ to, params, search })` calls produced.
 */
function searchString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length > 0 ? `?${parts.join("&")}` : ""
}
