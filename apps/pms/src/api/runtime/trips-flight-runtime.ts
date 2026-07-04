/**
 * Operator (deployment) wiring for non-catalog trip components.
 *
 * This is a stays-only PMS: the flights vertical (and its demo adapter) is not
 * part of the composition, so there is no non-catalog (flight) component
 * provider. Trips remains available for catalog-backed components; a
 * non-catalog component simply has no reservation handler here and resolves to
 * `null`, which `trips-runtime.ts` treats as "not reservable".
 *
 * If a flight (or other non-catalog) connector is added later, build its
 * component adapter here (see `@voyant-travel/trips/flight-component`) and
 * return real preflight/reserve results.
 */
import type {
  ReserveComponentInput,
  ReserveComponentPreflightResult,
  ReserveComponentResult,
} from "@voyant-travel/trips"
import type { Context } from "hono"

export function validateNonCatalogComponentBeforeReserve(
  _c: Context,
  _input: ReserveComponentInput,
): Promise<ReserveComponentPreflightResult | null> {
  return Promise.resolve(null)
}

export function reserveNonCatalogComponent(
  _c: Context,
  _input: ReserveComponentInput,
): Promise<ReserveComponentResult | null> {
  return Promise.resolve(null)
}
