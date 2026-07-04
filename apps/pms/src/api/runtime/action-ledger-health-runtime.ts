/**
 * Operator (deployment) wiring for the action-ledger health surface.
 *
 * The health routes (`GET /health`, `POST /health/check`) live in
 * `@voyant-travel/action-ledger` and mount at `/v1/admin/action-ledger`. The
 * package owns the route shape + the canary; it can't import the per-module
 * drift checks because `@voyant-travel/{bookings,finance,inventory}` all DEPEND
 * ON action-ledger (importing them back would cycle).
 *
 * This glue supplies those drift checks as INJECTED options — composing the
 * three packages' drift checks (and letting the package default to its own
 * `runActionLedgerCanary`). Swapping a drift check, or adding a vertical, is a
 * change here — never in the route implementation.
 */
import { createActionLedgerHealthRoutes } from "@voyant-travel/action-ledger/health"
import { checkBookingActionLedgerDrift } from "@voyant-travel/bookings/action-ledger-drift"
import { checkFinanceActionLedgerDrift } from "@voyant-travel/finance/action-ledger-drift"
import { checkProductActionLedgerDrift } from "@voyant-travel/inventory/action-ledger-drift"

/** Build the action-ledger health admin routes wired with this deployment's drift checks. */
export function createActionLedgerHealthAdminRoutes() {
  return createActionLedgerHealthRoutes({
    checkBookingDrift: checkBookingActionLedgerDrift,
    checkFinanceDrift: checkFinanceActionLedgerDrift,
    checkProductDrift: checkProductActionLedgerDrift,
  })
}
