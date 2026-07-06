import type { AdminDestinationResolvers } from "@voyant-travel/admin"
// Type-only: binds the `AdminDestinations` augmentations of the admin
// entries whose keys the CUSTOM resolvers below cover (bookings: the
// booking.* keys + product.detail + trip.create; catalog: the
// journey/browse/detail keys; legal: legal.home) into this program without
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
 * interpolation. Hand-written below are the genuinely custom resolvers —
 * search-param construction (`booking.detail`, `bookingJourney.start`) and
 * `legal.home` — plus the tour-operator keys still declared by kept packages
 * whose PMS admin UI was removed (see the grouped block below).
 *
 * Hrefs must match what the routes' typed `navigate` calls produced before
 * the contract existed — paths embed encoded params, search params keep the
 * journey schema's key order, and `undefined` values are omitted (key
 * presence is meaningful to the journey).
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
  "legal.home": () => "/legal",
  // Tour-operator destination keys still DECLARED by kept packages
  // (catalog-react/admin declares the journey + catalog.browse/detail keys;
  // bookings-react/admin declares product.detail + trip.create), so the
  // `satisfies` contract still requires resolvers here — but the PMS removed
  // their admin UI surfaces (the Catalog browse group, Products, and the trips
  // composer / /bookings/compose alias). Only `catalog.browse` is reachable in
  // a kept flow: the booking journey's cancel/return. It now lands on the PMS
  // booking entry point instead of a removed catalog page. The remaining three
  // are unreachable in PMS flows and kept solely to satisfy the type contract.
  "catalog.browse": () => "/bookings/new",
  "catalog.detail": () => "/bookings/new",
  "product.detail": () => "/bookings",
  "trip.create": () => "/bookings/new",
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
