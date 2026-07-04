import type { RealtimeProvider, RealtimeRouteResult, RealtimeRoutes } from "@voyant-travel/realtime"
import { createVoyantCloudRealtimeProvider } from "@voyant-travel/realtime/providers/voyant-cloud"

import { getCloudClient } from "./voyant-cloud"

/**
 * Resolve the realtime transport for this deployment — the Voyant Cloud
 * provider backed by the shared cloud client (mirrors
 * `resolveNotificationProviders`). The SDK's `client.realtime` namespace
 * satisfies the provider's structural contract directly, so no cast is needed.
 */
export function resolveRealtimeProviders(
  env: Record<string, unknown>,
): ReadonlyArray<RealtimeProvider> {
  return [createVoyantCloudRealtimeProvider({ client: getCloudClient(env) })]
}

/** Broadcast an `{ entity, id }` invalidation hint on the deployment-wide `admin` channel. */
function adminHint(entity: string, id: string | undefined): RealtimeRouteResult {
  return { channels: ["admin"], hint: id ? { entity, id } : { entity } }
}

/** Booking events also fan to the per-booking channel for booking-detail screens. */
function bookingHint(e: unknown, entity: "booking" | "payment"): RealtimeRouteResult {
  const { bookingId } = e as { bookingId: string }
  return { channels: ["admin", `booking:${bookingId}`], hint: { entity, id: bookingId } }
}

function firstId(e: unknown, ...keys: ReadonlyArray<string>): string | undefined {
  const record = e as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value
  }
  return undefined
}

/**
 * Maps domain events to realtime channels. The payload is an invalidation hint
 * (`{ event, entity, id }`) — connected admin screens refetch the matching React
 * Query keys over the existing authenticated HTTP path rather than receiving
 * entity data on the wire. The frontend translates `entity` → query-key roots
 * (see components/realtime-live.tsx). Deployments extend/override this freely.
 */
export const operatorRealtimeBridgeRoutes: RealtimeRoutes = {
  // Catalog / products (inventory module)
  "product.created": (e) => adminHint("product", firstId(e, "id")),
  "product.updated": (e) => adminHint("product", firstId(e, "id")),
  "product.deleted": (e) => adminHint("product", firstId(e, "id")),
  "product.content.changed": (e) => adminHint("product", firstId(e, "id")),

  // CRM contacts (relationships module)
  "person.changed": (e) => adminHint("person", firstId(e, "id")),
  "organization.changed": (e) => adminHint("organization", firstId(e, "id")),
  "customer.signal.created": (e) => adminHint("signal", firstId(e, "id")),

  // Suppliers (distribution module)
  "supplier.created": (e) => adminHint("supplier", firstId(e, "id")),
  "supplier.updated": (e) => adminHint("supplier", firstId(e, "id")),
  "supplier.deleted": (e) => adminHint("supplier", firstId(e, "id")),

  // Quotes
  "quote.created": (e) => adminHint("quote", firstId(e, "id")),
  "quote.updated": (e) => adminHint("quote", firstId(e, "id")),
  "quote.deleted": (e) => adminHint("quote", firstId(e, "id")),

  // Finance invoices
  "invoice.issued": (e) => adminHint("invoice", firstId(e, "invoiceId", "id")),
  "invoice.voided": (e) => adminHint("invoice", firstId(e, "invoiceId", "id")),
  "invoice.settled": (e) => adminHint("invoice", firstId(e, "invoiceId", "id")),
  "invoice.proforma.issued": (e) => adminHint("invoice", firstId(e, "invoiceId", "id")),
  "invoice.proforma.converted": (e) => adminHint("invoice", firstId(e, "invoiceId", "id")),

  // Legal contracts
  "contract.issued": (e) => adminHint("contract", firstId(e, "contractId", "id")),
  "contract.sent": (e) => adminHint("contract", firstId(e, "contractId", "id")),
  "contract.signed": (e) => adminHint("contract", firstId(e, "contractId", "id")),
  "contract.executed": (e) => adminHint("contract", firstId(e, "contractId", "id")),
  "contract.voided": (e) => adminHint("contract", firstId(e, "contractId", "id")),

  // Cruises
  "cruise.created": (e) => adminHint("cruise", firstId(e, "id")),
  "cruise.updated": (e) => adminHint("cruise", firstId(e, "id")),
  "cruise.deleted": (e) => adminHint("cruise", firstId(e, "id")),

  // Pricing & promotions
  "pricing.rule.changed": (e) => adminHint("pricing", firstId(e, "productId")),
  "promotion.changed": (e) => adminHint("promotion", firstId(e, "offerId")),

  // Bookings (also the per-booking channel for the booking detail screen)
  "booking.confirmed": (e) => bookingHint(e, "booking"),
  "booking.cancelled": (e) => bookingHint(e, "booking"),
  "booking.fully-paid": (e) => bookingHint(e, "payment"),
  "booking.refunded": (e) => bookingHint(e, "payment"),
  "payment.completed": (e) => adminHint("payment", firstId(e, "bookingId", "paymentSessionId")),

  // Availability (also the per-product channel)
  "availability.slot.changed": (e) => {
    const { productId } = e as { productId: string }
    return {
      channels: ["admin", `product:${productId}`],
      hint: { entity: "availability", id: productId },
    }
  },
}
