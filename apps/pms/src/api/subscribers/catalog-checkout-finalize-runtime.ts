/**
 * Operator (deployment) wiring for the checkout-finalize workflow.
 *
 * The reusable finalize saga driver (`dispatchCheckoutFinalize`) and the
 * acceptance-signature promotion live in `@voyant-travel/commerce/checkout`.
 * This file keeps the thin deployment wiring:
 *   - the HonoBundle that subscribes to `payment.completed` /
 *     `contract.document.generated` events and registers the
 *     `checkout-finalize` runner in the operator's workflow-runs registry,
 *   - the platform glue (db resolver, env bindings, contract-pdf generator).
 *
 * Swapping the runner registry, payment trigger, or contract-pdf generator is a
 * change here — never in the package's finalize step logic.
 */
import {
  type DispatchCheckoutFinalizeParams,
  type CatalogCheckoutContractPdfGenerator as PackageContractPdfGenerator,
  dispatchCheckoutFinalize as packageDispatchCheckoutFinalize,
  persistAcceptanceSignature,
} from "@voyant-travel/commerce/checkout"
import type { EventBus } from "@voyant-travel/core"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import type { WorkflowRunnerRegistry } from "@voyant-travel/workflow-runs"
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
 * `generate_contract_pdf` workflow step. The deployment supplies its
 * platform bindings (`env`), so this type carries `env` for the operator's
 * own callers; it adapts to the package's env-less generator inside the bundle.
 */
export type CatalogCheckoutContractPdfGenerator = (input: {
  env: CloudflareBindings
  db: PostgresJsDatabase
  eventBus: EventBus
  bookingId: string
}) => Promise<{ contractId: string; attachmentId: string } | null>

type DispatchParams = Omit<DispatchCheckoutFinalizeParams, "generateContractPdf"> & {
  env: CloudflareBindings
  generateContractPdf?: CatalogCheckoutContractPdfGenerator
}

/**
 * Dispatch the checkout-finalize workflow, adapting the operator's
 * env-carrying contract-pdf generator to the package's env-less form by
 * closing over the bundle's env bindings.
 */
function dispatchCheckoutFinalize(params: DispatchParams): Promise<{ runId: string }> {
  const { env, generateContractPdf, ...rest } = params
  const packageGenerator: PackageContractPdfGenerator | undefined = generateContractPdf
    ? ({ db, eventBus, bookingId }) => generateContractPdf({ env, db, eventBus, bookingId })
    : undefined
  return packageDispatchCheckoutFinalize({
    ...rest,
    generateContractPdf: packageGenerator,
  })
}

/**
 * Bundle factory that subscribes to checkout-finalize events and registers
 * workflow-runs rerun/resume handlers for the standalone dashboard.
 */
export function createCatalogCheckoutBundle(opts: {
  workflowRunnerRegistry?: WorkflowRunnerRegistry
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
        try {
          await withDbFromEnv(env, async (rawDb) => {
            await dispatchCheckoutFinalize({
              env,
              db: operatorPostgresDb(rawDb),
              eventBus,
              input: {
                bookingId,
                paymentSessionId: data.paymentSessionId,
                paymentIntent: data.paymentIntent,
              },
              trigger: "payment.completed",
              correlationId: data.paymentSessionId ?? null,
              tags: [
                `bookingId:${bookingId}`,
                ...(data.paymentSessionId ? [`paymentSessionId:${data.paymentSessionId}`] : []),
                ...(data.paymentIntent ? [`paymentIntent:${data.paymentIntent}`] : []),
              ],
              generateContractPdf: opts.generateContractPdf,
            })
          })
        } catch {
          // dispatchCheckoutFinalize already logged + recorded the
          // failure; swallow here so the event-bus callback doesn't
          // bubble to the dispatch caller.
        }
      })

      if (opts.workflowRunnerRegistry) {
        opts.workflowRunnerRegistry.register({
          name: "checkout-finalize",
          idempotency: "unsafe",
          description:
            "Confirms the booking and issues the final invoice. A fresh rerun issues another invoice number; use Resume to retry from a failed step.",
          rerun: async (rawInput, ctx) => {
            const input = rawInput as DispatchCheckoutFinalizeParams["input"] | null
            if (!input?.bookingId) {
              throw new Error("checkout-finalize rerun: recorded input has no bookingId")
            }
            return withDbFromEnv(env, async (rawDb) =>
              dispatchCheckoutFinalize({
                env,
                db: operatorPostgresDb(rawDb),
                eventBus,
                input,
                trigger: "manual.rerun",
                correlationId: ctx.correlationId,
                tags: [...ctx.tags, "rerun:true"],
                parentRunId: ctx.parentRunId,
                triggeredByUserId: ctx.triggeredByUserId,
                generateContractPdf: opts.generateContractPdf,
              }),
            )
          },
          resume: async (rawInput, ctx) => {
            const input = rawInput as DispatchCheckoutFinalizeParams["input"] | null
            if (!input?.bookingId) {
              throw new Error("checkout-finalize resume: recorded input has no bookingId")
            }
            return withDbFromEnv(env, async (rawDb) =>
              dispatchCheckoutFinalize({
                env,
                db: operatorPostgresDb(rawDb),
                eventBus,
                input,
                trigger: "manual.resume",
                correlationId: ctx.correlationId,
                tags: [...ctx.tags, "resume:true"],
                parentRunId: ctx.parentRunId,
                triggeredByUserId: ctx.triggeredByUserId,
                resumeFromStep: ctx.resumeFromStep,
                seedResults: ctx.seedResults,
                generateContractPdf: opts.generateContractPdf,
              }),
            )
          },
        })
      }
    },
  }
}

/** @deprecated Kept for callers that still import the static bundle. */
export const catalogCheckoutBundle = createCatalogCheckoutBundle({})
