/**
 * Operator (deployment) wiring for the flights module.
 *
 * The flight admin routes — and the flight→payment-session mapping — live in
 * `@voyant-travel/flights`; the generic order-payment-session orchestration
 * lives in `@voyant-travel/finance`. This file only supplies the
 * deployment-specific choices:
 *   - which connector adapter to use (the demo connector for now),
 *   - which card provider starts the hosted payment (this deployment: Netopia).
 *
 * Swapping to a real GDS connector, or a different payment provider, is a change
 * here — never in the route or session implementations.
 */
import { createOrderPaymentSessions } from "@voyant-travel/finance/order-payment-sessions"
import {
  createFlightAdminRoutes,
  createFlightOrderPaymentIntegration,
  type FlightCardBilling,
} from "@voyant-travel/flights"
import { createDemoFlightAdapter } from "@voyant-travel/plugin-flights-demo"
import type { Context } from "hono"

import { cardPaymentStarter } from "./card-payment"

/**
 * Resolve the flight connector adapter. The demo adapter is a thin HTTP client
 * to `apps/flights-demo-api` (set `FLIGHTS_DEMO_API_URL`). Swapping to a real
 * GDS connector is a one-line change here.
 */
function resolveAdapter(c: Context) {
  const baseUrl = (c.env as { FLIGHTS_DEMO_API_URL?: string }).FLIGHTS_DEMO_API_URL
  if (!baseUrl) {
    throw new Error(
      "FLIGHTS_DEMO_API_URL is not set. Start `apps/flights-demo-api` and point this env at it (e.g. http://localhost:3320).",
    )
  }
  return createDemoFlightAdapter({ baseUrl })
}

/**
 * Best-effort card start for a flight hold session, routed through this
 * deployment's {@link cardPaymentStarter}. A no-op when the processor isn't
 * configured (the bank-transfer tab still works).
 */
async function startCardPayment(c: Context, sessionId: string, billing: FlightCardBilling) {
  await cardPaymentStarter(c, {
    db: c.var.db,
    sessionId,
    billing,
    description: `Flight ${sessionId}`,
  })
}

/** Build the flights admin routes wired with this deployment's options. */
export function buildFlightAdminRoutes() {
  const payment = createFlightOrderPaymentIntegration({
    orderPaymentSessions: createOrderPaymentSessions({ targetType: "flight_order" }),
    startCardPayment,
  })
  return createFlightAdminRoutes({ resolveAdapter, payment })
}
