/**
 * Operator (deployment) wiring for the catalog-checkout cluster.
 *
 * The reusable checkout business logic lives in
 * `@voyant-travel/commerce/checkout`. This file builds the deployment-specific
 * options it needs, injected as structural functions so the package never
 * imports the operator (and never imports `@voyant-travel/inventory`, which
 * depends on commerce — a static import would cycle):
 *
 *   - `resolveBookingTaxSettings` — operator settings table read.
 *   - `getOwnedProductName` — owned product title via inventory's
 *     `productsService.getProductById` (injected to avoid the cycle).
 *   - `resolveBankTransferInstructions` — operator profile / payment-instruction
 *     rows + env fallbacks for the bank-transfer checkout path.
 */
import type { CheckoutModuleOptions, CheckoutStartOptions } from "@voyant-travel/commerce/checkout"
import { productsService } from "@voyant-travel/inventory"
import {
  getOperatorPaymentInstructions,
  getOperatorProfile,
  resolveBookingTaxSettings,
} from "@voyant-travel/operator-settings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { cardPaymentStarter } from "./card-payment"

/** Resolve an owned product's display name (cycle-avoiding inventory read). */
async function getOwnedProductName(
  db: PostgresJsDatabase,
  entityModule: string,
  entityId: string,
): Promise<string | null> {
  if (entityModule !== "products") return null
  const product = await productsService.getProductById(db, entityId)
  return product?.name ?? null
}

/**
 * Compose the bank-transfer instructions from the operator profile / payment
 * instructions rows, falling back to env vars. Mirrors the operator's previous
 * `resolveBankTransferInstructions`.
 */
async function resolveBankTransferInstructions(
  db: PostgresJsDatabase,
  env: Record<string, string | undefined>,
) {
  const [operatorProfile, paymentInstructions] = await Promise.all([
    getOperatorProfile(db),
    getOperatorPaymentInstructions(db),
  ])
  return {
    beneficiary:
      paymentInstructions?.bankTransferBeneficiary ||
      operatorProfile?.legalName ||
      operatorProfile?.name ||
      env.BANK_TRANSFER_BENEFICIARY ||
      env.STOREFRONT_BANK_BENEFICIARY ||
      "—",
    iban: paymentInstructions?.iban || env.BANK_TRANSFER_IBAN || env.STOREFRONT_BANK_IBAN || "—",
    bankName:
      paymentInstructions?.bank || env.BANK_TRANSFER_BANK_NAME || env.STOREFRONT_BANK_NAME || "—",
  }
}

/** Shared checkout-module options (materialization + tax). */
export function createOperatorCheckoutModuleOptions(): CheckoutModuleOptions {
  return {
    resolveBookingTaxSettings,
    getOwnedProductName,
  }
}

/**
 * Start the card-payment session for a checkout-start via this deployment's
 * {@link cardPaymentStarter}. Returns `null` when the processor isn't
 * configured so commerce falls back to the `card_pending` confirmation-page
 * poll. The provider-specific placeholder billing (city, country code, postal
 * code, etc) lives here — the package only passes the real billing
 * (email/firstName/lastName).
 */
function createStartCardPayment(c: Context): CheckoutStartOptions["startCardPayment"] {
  return async ({ db, sessionId, billing, description, returnUrl }) =>
    cardPaymentStarter(c, {
      db: db as PostgresJsDatabase,
      sessionId,
      billing: {
        email: billing.email,
        phone: "0000000000",
        firstName: billing.firstName,
        lastName: billing.lastName,
        city: "TBD",
        country: 642,
        state: "TBD",
        postalCode: "00000",
        details: "Pending — customer to confirm at payment.",
      },
      description,
      returnUrl,
    })
}

/**
 * Checkout-start options — module options + bank-transfer reader + card-payment
 * starter. Pass the request `Context` to wire the Netopia card-payment start
 * (it resolves the runtime from the per-request container). Omit `c` for the
 * tax/bank-transfer-only paths that never reach the card branch.
 */
export function createOperatorCheckoutStartOptions(c?: Context): CheckoutStartOptions {
  return {
    ...createOperatorCheckoutModuleOptions(),
    resolveBankTransferInstructions,
    startCardPayment: c ? createStartCardPayment(c) : undefined,
  }
}
