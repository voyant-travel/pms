/**
 * Operator glue for the quote-version Trip-snapshot route.
 *
 * The route logic + the pure `tripSnapshotToQuoteVersionApply` mapper live in
 * `@voyant-travel/quotes` (`./proposal-routes`); this file wires the
 * deployment-specific options via `./quote-proposal-runtime` and exposes the
 * `quote-version-snapshot` extension on the `trips` module:
 * `POST /v1/admin/trips/:envelopeId/quote-versions/:quoteVersionId/snapshot`.
 *
 * See docs/architecture/api-route-ownership-and-composition.md.
 */

import type { HonoExtension } from "@voyant-travel/hono/module"
import {
  createQuoteVersionSnapshotRoutes,
  tripSnapshotToQuoteVersionApply,
} from "@voyant-travel/quotes"

import { createQuoteProposalRoutesOptions } from "../runtime/quote-proposal-runtime"

export { tripSnapshotToQuoteVersionApply }

/** Build the quote-version-snapshot extension wired with this deployment's options. */
export function createOperatorQuoteVersionSnapshotExtension(): HonoExtension {
  return {
    extension: { name: "quote-version-snapshot", module: "trips" },
    adminRoutes: createQuoteVersionSnapshotRoutes(createQuoteProposalRoutesOptions()),
  }
}
