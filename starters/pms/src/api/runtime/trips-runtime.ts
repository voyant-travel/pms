import { submitBookingReservationPlan } from "@voyant-travel/bookings/reservation-plans"
import type { PaymentCompletedEvent } from "@voyant-travel/finance"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import {
  type CancelTripComponentsDeps,
  type PriceTripDeps,
  type ReserveTripDeps,
  type StartCheckoutDeps,
  type TripsRoutesOptions,
  tripsService,
} from "@voyant-travel/trips"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { withDbFromEnv } from "../lib/db"
import {
  cancelComponent,
  previewComponentCancellation,
  quoteCatalogComponent,
  releaseReservedComponent,
  reserveCatalogComponent,
  startComponentCheckout,
} from "./trips-catalog-runtime"
import { startTripCheckout } from "./trips-checkout-runtime"
import {
  reserveNonCatalogComponent,
  validateNonCatalogComponentBeforeReserve,
} from "./trips-flight-runtime"

export function createOperatorTripsRoutesOptions(): TripsRoutesOptions {
  return {
    priceTripDeps: (c) => createPriceTripDeps(c),
    reserveTripDeps: (c) => createReserveTripDeps(c),
    startCheckoutDeps: (c) => createStartCheckoutDeps(c),
    cancelTripComponentsDeps: (c) => createCancelTripComponentsDeps(c),
  }
}

export const tripsPaymentBundle: HonoBundle = {
  name: "trips-payment-completion",
  bootstrap: ({ bindings, eventBus }) => {
    const env = bindings as CloudflareBindings
    eventBus.subscribe<PaymentCompletedEvent>("payment.completed", async ({ data }) => {
      if (data.targetType !== "other" || !data.targetId?.startsWith("trip_")) return

      try {
        await withDbFromEnv(env, async (rawDb) => {
          const db = rawDb as unknown as PostgresJsDatabase
          await tripsService.completeTripCheckout(db, {
            envelopeId: data.targetId ?? undefined,
            paymentSessionId: data.paymentSessionId,
            payload: {
              amountCents: data.amountCents,
              currency: data.currency,
              provider: data.provider,
              targetType: data.targetType,
              targetId: data.targetId,
            },
          })
        })
      } catch (err) {
        console.error("[trips] payment completion failed", err)
      }
    })
  },
}

function createPriceTripDeps(c: Context): PriceTripDeps {
  return {
    quoteCatalogComponent: (input) => quoteCatalogComponent(c, input),
  }
}

export function createReserveTripDeps(c: Context): ReserveTripDeps {
  return {
    quoteCatalogComponentBeforeReserve: (input) => quoteCatalogComponent(c, input),
    validateNonCatalogComponentBeforeReserve: (input) =>
      validateNonCatalogComponentBeforeReserve(c, input),
    submitReservationPlan: async (input) => {
      const submitted = await submitBookingReservationPlan(
        {
          reservationPlanId: input.reservationPlan.id,
          idempotencyKey: input.idempotencyKey,
          origin: {
            source: "trips",
            tripEnvelopeId: input.envelope.id,
          },
          envelope: input.envelope,
          lines: input.components.map((component) => ({
            planLineId: component.componentId,
            componentId: component.componentId,
            kind: component.reservationKind,
            line: component.component,
          })),
        },
        {
          reserveCatalogBackedLine: ({ plan, line }) =>
            reserveCatalogComponent(c, {
              envelope: plan.envelope,
              component: line.line,
              reservationPlanId: plan.reservationPlanId,
            }),
          reserveNonCatalogLine: ({ plan, line }) =>
            reserveNonCatalogComponent(c, {
              envelope: plan.envelope,
              component: line.line,
              reservationPlanId: plan.reservationPlanId,
            }),
          releaseReservedLine: ({ line, result }) => {
            if (line.kind !== "catalog_backed") {
              return Promise.resolve({ released: false, reason: "release_not_configured" })
            }
            return releaseReservedComponent(c, {
              component: line.line,
              reserveResult: result,
            })
          },
        },
      )

      return {
        reservationPlanId: submitted.reservationPlanId,
        status: submitted.status,
        reserved: submitted.reserved.map((item) => ({
          componentId: item.componentId,
          status: item.status,
          result: item.result,
        })),
        failures: submitted.failures,
        compensations: submitted.compensations,
        warnings: submitted.warnings,
      }
    },
  }
}

export function createStartCheckoutDeps(c: Context): StartCheckoutDeps {
  return {
    startTripCheckout: (input) => startTripCheckout(c, input),
    startComponentCheckout: (input) => startComponentCheckout(c, input),
  }
}

export function createCancelTripComponentsDeps(c: Context): CancelTripComponentsDeps {
  return {
    previewComponentCancellation: (input) => previewComponentCancellation(input),
    cancelComponent: (input) => cancelComponent(c, input),
  }
}
