/**
 * Operator (deployment) wiring for checkout finalization.
 *
 * The idempotent `finalizeCheckout` operation and acceptance-signature
 * promotion live in `@voyant-travel/commerce/checkout`.
 * This file keeps the thin deployment wiring:
 *   - the HonoBundle that subscribes to `payment.completed` /
 *     `contract.document.generated` events,
 *   - the platform glue (db resolver, env bindings, contract-pdf generator).
 *
 * Swapping the payment trigger or contract-pdf generator is a change here —
 * never in the package's finalization logic.
 */
import {
  type CatalogCheckoutContractPdfGenerator as PackageContractPdfGenerator,
  finalizeCheckout,
  persistAcceptanceSignature,
} from "@voyant-travel/commerce/checkout"
import type { EventBus } from "@voyant-travel/core"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { withDbFromEnv } from "../lib/db"
import { operatorBindings, operatorPostgresDb } from "../runtime/operator-runtime-adapter"

interface PaymentCompletedPayload {
  bookingId: string | null
  paymentSessionId?: string
  paymentIntent?: "card" | "bank_transfer" | "hold" | "ticket_on_credit"
  amountCents?: number
  currency?: string
  provider?: string | null
}

interface ContractDocumentGeneratedPayload {
  contractId: string
  contractStatus: string
  attachmentId: string
  attachmentKind: string
  attachmentName: string
}

/**
 * Optional callback that generates (or fetches existing) the contract PDF for
 * a booking. Wired by app.ts and forwarded into the explicit
 * contract-PDF stage. The deployment supplies its
 * platform bindings (`env`), so this type carries `env` for the operator's
 * own callers; it adapts to the package's env-less generator inside the bundle.
 */
export type CatalogCheckoutContractPdfGenerator = (input: {
  env: CloudflareBindings
  db: PostgresJsDatabase
  eventBus: EventBus
  bookingId: string
}) => Promise<{ contractId: string; attachmentId: string } | null>

/**
 * Bundle factory that subscribes to checkout-finalize events.
 */
export function createCatalogCheckoutBundle(opts: {
  generateContractPdf?: CatalogCheckoutContractPdfGenerator
}): HonoBundle {
  return {
    name: "catalog-checkout",
    bootstrap: ({ bindings, eventBus }) => {
      const env = operatorBindings(bindings)
      eventBus.subscribe<ContractDocumentGeneratedPayload>(
        "contract.document.generated",
        async ({ data }) => {
          try {
            await withDbFromEnv(env, async (rawDb) => {
              await persistAcceptanceSignature(operatorPostgresDb(rawDb), data.contractId, eventBus)
            })
          } catch (err) {
            console.error("[catalog-checkout] persistAcceptanceSignature failed", err)
          }
        },
      )
      eventBus.subscribe<PaymentCompletedPayload>("payment.completed", async ({ data }) => {
        if (!data.bookingId) return
        const bookingId = data.bookingId
        const generateContractPdf = opts.generateContractPdf
        const packageGenerator: PackageContractPdfGenerator | undefined = generateContractPdf
          ? ({ db, eventBus: bus, bookingId: id }) =>
              generateContractPdf({ env, db, eventBus: bus, bookingId: id })
          : undefined

        // Event delivery retries failures. The operation is idempotent and the
        // booking/finance state remains the source of truth, so do not swallow
        // errors or recreate a deployment-local run registry.
        await withDbFromEnv(env, async (rawDb) => {
          await finalizeCheckout({
            db: operatorPostgresDb(rawDb),
            eventBus,
            input: {
              bookingId,
              paymentSessionId: data.paymentSessionId,
              paymentIntent: data.paymentIntent,
            },
            generateContractPdf: packageGenerator,
          })
        })
      })
    },
  }
}

/** @deprecated Kept for callers that still import the static bundle. */
export const catalogCheckoutBundle = createCatalogCheckoutBundle({})
