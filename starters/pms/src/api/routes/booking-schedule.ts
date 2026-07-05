/**
 * Booking payment-schedule wiring for this deployment.
 *
 * The route handlers + schedule-generation orchestration now live in
 * `@voyant-travel/finance` (`createBookingScheduleAdminRoutes`,
 * `createPaymentPolicyPublicRoutes`, `generatePaymentScheduleForBooking`). This
 * file supplies the deployment-specific cascade resolvers + operator default
 * and exposes:
 *
 *   - `bookingScheduleBundle` — the `booking.confirmed` event subscriber
 *     (a plugin, NOT a route) that regenerates the schedule on confirm. It
 *     bootstraps BEFORE the legal module's auto-generate-contract subscriber so
 *     the contract template sees populated deposit/balance fields.
 *   - `createBookingScheduleExtension()` — the composed HonoExtension on the
 *     `bookings` module (admin route at `/v1/admin/bookings/...`, public route
 *     at `/v1/public/payment-policy/resolve` via the publicPath override).
 *
 * Idempotency, cascade precedence, and the activity-log entry are preserved in
 * the package; this file is now pure glue. See
 * docs/architecture/api-route-ownership-and-composition.md.
 */

import {
  type BookingScheduleRoutesOptions,
  createBookingScheduleAdminRoutes,
  createPaymentPolicyPublicRoutes,
  generatePaymentScheduleForBooking,
} from "@voyant-travel/finance"
import type { HonoExtension } from "@voyant-travel/hono/module"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import { resolveOperatorDefaultPaymentPolicy } from "@voyant-travel/operator-settings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { withDbFromEnv } from "../lib/db"
import {
  readPolicySourceFromInternalNotes,
  resolveCategoryPolicy,
  resolveCategoryPolicyForEntity,
  resolveListingPolicy,
  resolveListingPolicyForEntity,
  resolveSupplierPolicy,
  resolveSupplierPolicyForEntity,
  stampPolicySourceOnBooking,
} from "../runtime/booking-payment-policy-runtime"

interface BookingConfirmedPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

/**
 * Build the deployment's booking-schedule route options — the cascade
 * resolvers (which read across vertical modules finance must not import) +
 * operator default + per-request db resolver. The bookings-schema reads and
 * action-ledger appender are handled inside the package directly.
 */
function createBookingScheduleRoutesOptions(): BookingScheduleRoutesOptions {
  return {
    resolveDb: (c: Context) => c.get("db") as PostgresJsDatabase,
    resolveOperatorDefaultPaymentPolicy,
    resolveSupplierPolicy,
    resolveCategoryPolicy,
    resolveListingPolicy,
    resolveListingPolicyForEntity,
    resolveCategoryPolicyForEntity,
    resolveSupplierPolicyForEntity,
    stampPolicySourceOnBooking,
    readPolicySourceFromInternalNotes,
  }
}

export const bookingScheduleBundle: HonoBundle = {
  name: "booking-schedule",
  bootstrap: ({ bindings, eventBus }) => {
    const env = bindings as CloudflareBindings
    const options = createBookingScheduleRoutesOptions()
    eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", async ({ data }) => {
      try {
        await withDbFromEnv(env, async (db) => {
          await generatePaymentScheduleForBooking(
            db as unknown as PostgresJsDatabase,
            data.bookingId,
            options,
          )
        })
      } catch (err) {
        console.error("[booking-schedule] failed to generate schedule", {
          bookingId: data.bookingId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  },
}

/**
 * Booking payment-schedule routes as a composed extension on the
 * `bookings` module.
 *
 * - admin: `POST /v1/admin/bookings/:bookingId/payment-schedule/regenerate`
 * - public: `POST /v1/public/payment-policy/resolve` (anonymous storefront
 *   preview; the public mount path is overridden to `payment-policy`).
 *
 * The handler bodies + operator-local policy cascade live in
 * `@voyant-travel/finance`; this file injects the deployment-specific
 * resolvers. See docs/architecture/api-route-ownership-and-composition.md.
 *
 * The event-subscriber bundle (`bookingScheduleBundle`) stays a separate
 * plugin — it carries no routes.
 */
export function createBookingScheduleExtension(): HonoExtension {
  const options = createBookingScheduleRoutesOptions()
  return {
    extension: { name: "booking-schedule", module: "bookings" },
    adminRoutes: createBookingScheduleAdminRoutes(options),
    publicRoutes: createPaymentPolicyPublicRoutes(options),
    publicPath: "payment-policy",
  }
}
