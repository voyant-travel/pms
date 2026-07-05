/**
 * Operator glue for the quote-version proposal routes.
 *
 * The route logic lives in `@voyant-travel/quotes` (`./proposal-routes`); this
 * file wires the deployment-specific options via `./quote-proposal-runtime` and
 * exposes the thin factories the composition wires as the `proposal` extension.
 */
import {
  buildQuoteVersionProposalUrl,
  createQuoteProposalAdminRoutes,
  createQuoteProposalPublicRoutes,
} from "@voyant-travel/quotes"

import { createQuoteProposalRoutesOptions } from "../runtime/quote-proposal-runtime"

export { buildQuoteVersionProposalUrl }

/** Build the admin proposal routes wired with this deployment's options. */
export function createProposalAdminRoutes() {
  return createQuoteProposalAdminRoutes(createQuoteProposalRoutesOptions())
}

/** Build the public proposal routes wired with this deployment's options. */
export function createProposalPublicRoutes() {
  return createQuoteProposalPublicRoutes(createQuoteProposalRoutesOptions())
}
