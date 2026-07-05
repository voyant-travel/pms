import { createAccommodationBookingHandler } from "@voyant-travel/accommodations/booking-engine"
import { getAccommodationContent } from "@voyant-travel/accommodations/service-content"
import type {
  CommitOwnedResult,
  OwnedBookingHandler,
  OwnedBookingHandlerRegistry,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/booking-engine"
import { asPostgresDb } from "./booking-engine-db"
import type { BookingEngineEnv } from "./booking-engine-runtime"
import { withDbFromEnv } from "./db"
import { persistStayBooking } from "./persist-stay-booking"

/**
 * Adopt the real booking id created by the accommodation commit bridge.
 *
 * ROOT-CAUSE WORKAROUND for an upstream regression in
 * `@voyant-travel/accommodations`' `createAccommodationBookingHandler.commit`:
 * unlike the products and cruises owned handlers (which return
 * `bookingId: bridge.bookingId` on the `CommitOwnedResult`), the accommodation
 * handler only echoes the bridge's booking id inside
 * `upstreamPayload.bridgeBookingId` and leaves the top-level `bookingId`
 * undefined. The catalog booking engine (`bookEntity`) then falls back to its
 * own pre-generated shell id (`ownedBookingId = commitResult.bookingId ?? bookingId`),
 * so the catalog snapshot, the consumed-quote marker, and the id returned to the
 * storefront all point at a phantom id — NOT the real `STAY-…` booking the
 * bridge (`persistStayBooking`) just wrote. Checkout then can't find a booking
 * for that id and materializes a bare `service` `BK-…` order booking (which it
 * confirms + charges), while the real stay reservation is stranded as a draft
 * and never reaches the front desk.
 *
 * Surfacing `bridgeBookingId` as the canonical `bookingId` makes the engine
 * adopt the real stay booking, so the confirmed + paid booking IS the stay
 * booking — a single coherent row with `stay_booking_items`, exactly like the
 * seeded and OTA-ingested reservations.
 *
 * Pure + side-effect free so it can be unit-tested and dropped once the upstream
 * handler returns the id itself (see docs/PLAN.md §7).
 */
export function adoptBridgeBookingId(result: CommitOwnedResult): CommitOwnedResult {
  if (result.status === "failed" || result.bookingId) return result
  const bridgeBookingId = result.upstreamPayload?.bridgeBookingId
  if (typeof bridgeBookingId !== "string" || bridgeBookingId.length === 0) return result
  return { ...result, bookingId: bridgeBookingId }
}

/**
 * Wrap an owned booking handler so its `commit` result carries the canonical
 * booking id (see {@link adoptBridgeBookingId}). Every other method is passed
 * through untouched.
 */
function withAdoptedBridgeBookingId(handler: OwnedBookingHandler): OwnedBookingHandler {
  return {
    ...handler,
    commit: async (ctx, request) => adoptBridgeBookingId(await handler.commit(ctx, request)),
  }
}

export function registerRetainedVerticalBookingHandlers(
  registry: OwnedBookingHandlerRegistry,
  env: BookingEngineEnv,
  getSourceRegistry: () => SourceAdapterRegistry,
): void {
  registry.register(
    withAdoptedBridgeBookingId(
      createAccommodationBookingHandler({
        async loadContent(ctx, entityId) {
          const db = asPostgresDb(ctx.db)
          const sourceRegistry = getSourceRegistry()
          const resolved = await getAccommodationContent(
            db,
            entityId,
            { preferredLocales: ["en-GB"] },
            { registry: sourceRegistry },
          )
          return resolved?.content ?? null
        },
        async commitBridge(input, opts) {
          return withDbFromEnv(env as Parameters<typeof withDbFromEnv>[0], async (rawDb) =>
            persistStayBooking(asPostgresDb(rawDb), input, opts),
          )
        },
      }),
    ),
  )
}
