/**
 * Operator (deployment) wiring for the quote-version proposal + Trip-snapshot
 * routes.
 *
 * The route shapes live in `@voyant-travel/quotes`; this file supplies the
 * deployment-specific options the routes need:
 *   - the concrete transactional db (`operatorPostgresDb`),
 *   - the public proposal base URL (`resolvePublicCheckoutBaseUrlFromBindings`),
 *   - the trips reserve/checkout deps (`createReserveTripDeps`/`createStartCheckoutDeps`),
 *   - the public operator profile (operator settings).
 *
 * Swapping the db backend, base-URL resolution, trips deps, or operator-profile
 * source is a change here — never in the route implementations.
 */

import { getOperatorSettings, toPublicOperatorSettings } from "@voyant-travel/operator-settings"
import type { QuoteProposalRoutesOptions } from "@voyant-travel/quotes"
import type { Context } from "hono"
import { operatorPostgresDb } from "./operator-runtime-adapter"
import { resolvePublicCheckoutBaseUrlFromBindings } from "./payment-config"
import {
  createCancelTripComponentsDeps,
  createReserveTripDeps,
  createStartCheckoutDeps,
} from "./trips-runtime"

/** Build the quotes proposal/snapshot route options for this deployment. */
export function createQuoteProposalRoutesOptions(): QuoteProposalRoutesOptions {
  return {
    resolveDb: (c: Context) => operatorPostgresDb(c.get("db")),
    resolvePublicProposalBaseUrl: (c: Context) =>
      resolvePublicCheckoutBaseUrlFromBindings(c.env ?? {}),
    reserveTripDeps: (c: Context) => createReserveTripDeps(c),
    startCheckoutDeps: (c: Context) => createStartCheckoutDeps(c),
    cancelTripComponentsDeps: (c: Context) => createCancelTripComponentsDeps(c),
    resolveOperatorProfile: async (db) => {
      const operatorSettings = await getOperatorSettings(db)
      return operatorSettings ? toPublicOperatorSettings(operatorSettings) : null
    },
  }
}
