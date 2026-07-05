import { buildBookingRouteRuntime, createBookingPiiService } from "@voyant-travel/bookings"
import type { EventBus } from "@voyant-travel/core"
import {
  type ContractDocumentGenerator,
  type ContractDocumentRoutesOptions,
  createContractDocumentRoutes,
} from "@voyant-travel/legal"
import { createContractDocumentService } from "@voyant-travel/legal/contract-document"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { tryGetCloudClient } from "../../lib/voyant-cloud"
import { createDocumentStorage, guessMimeType } from "../lib/storage"
import {
  AUTO_GENERATE_CONTRACT_OPTIONS,
  contractVariableBindings,
  DEFAULT_CONTRACT_SERIES_NAME,
} from "./contract-document-variables"

export { AUTO_GENERATE_CONTRACT_OPTIONS } from "./contract-document-variables"

/**
 * Build the `ContractDocumentGenerator` configured for this template.
 * Used by both the legal module's `resolveDocumentGenerator` and by the
 * explicit `generate_contract_pdf` checkout-finalize step.
 *
 * The returned generator lazy-imports the concrete PDF/browser helpers so the
 * operator Hono app can assemble routes without loading the document rendering
 * implementation until a contract is actually generated.
 */
export function resolveContractDocumentGenerator(
  env: CloudflareBindings,
): ContractDocumentGenerator | null {
  const storage = createDocumentStorage(env)
  if (!storage) return null

  return async (context) => {
    const cloud = tryGetCloudClient(env)
    const legal = await import("@voyant-travel/legal")
    if (cloud) {
      const generator = legal.createStorageBackedContractDocumentGenerator({
        storage,
        serializer: legal.createBrowserRenderedPdfContractDocumentSerializer({
          cloudClient: cloud,
        }),
      })
      return generator(context)
    }

    // Local dev / no cloud key — fall back to the basic pdf-lib
    // serializer. Contract PDFs will be plain text but the worker
    // boots and downstream flows complete. Prod deploys MUST set
    // VOYANT_API_KEY.
    console.warn(
      "[operator] VOYANT_API_KEY not set — using basic pdf-lib serializer. " +
        "Contract PDFs will be unstyled. Set the key to enable browser-rendered output.",
    )
    const generator = legal.createPdfContractDocumentGenerator({ storage })
    return generator(context)
  }
}

/**
 * Build the legal contract-document service wired with this deployment's
 * providers: the PDF generator (above), the runtime env bindings, and the
 * KMS-backed booking PII reader. The legal-domain orchestration (series
 * seeding, booking lookup, template render, contract-record persistence) lives
 * in `@voyant-travel/legal/contract-document`.
 */
function contractDocumentService(env: CloudflareBindings) {
  return createContractDocumentService({
    resolveGenerator: () => resolveContractDocumentGenerator(env),
    autoGenerateOptions: AUTO_GENERATE_CONTRACT_OPTIONS,
    defaultSeriesName: DEFAULT_CONTRACT_SERIES_NAME,
    resolveBindings: () => contractVariableBindings(env),
    resolveBookingPiiService: () => createContractBookingPiiService(env),
  })
}

export function generateContractPdfForBooking(
  env: CloudflareBindings,
  db: PostgresJsDatabase,
  eventBus: EventBus | undefined,
  bookingId: string,
  options: { force?: boolean } = {},
): Promise<{ contractId: string; attachmentId: string } | null> {
  return contractDocumentService(env).generate(db, eventBus, bookingId, options)
}

export function previewContractForBooking(
  env: CloudflareBindings,
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<{ html: string; templateName: string; templateLanguage: string } | null> {
  return contractDocumentService(env).preview(db, bookingId)
}

/**
 * Build the contract-document routes wired with this deployment's options.
 *
 * The route shapes live in `@voyant-travel/legal`; this supplies the
 * generator/preview (above), the private document storage resolver, and the
 * MIME guesser (from `./lib/storage`).
 */
export function buildContractDocumentRoutes() {
  const options: ContractDocumentRoutesOptions = {
    generateContract: (env, db, eventBus, bookingId, opts) =>
      generateContractPdfForBooking(
        env as CloudflareBindings,
        db as PostgresJsDatabase,
        eventBus as EventBus | undefined,
        bookingId,
        opts,
      ),
    previewContract: (env, db, bookingId) =>
      previewContractForBooking(env as CloudflareBindings, db as PostgresJsDatabase, bookingId),
    resolveStorage: (env) => createDocumentStorage(env as CloudflareBindings),
    guessMimeType,
  }
  return createContractDocumentRoutes(options)
}

async function createContractBookingPiiService(env: CloudflareBindings) {
  const runtime = buildBookingRouteRuntime(env)
  try {
    return createBookingPiiService({ kms: await runtime.getKmsProvider() })
  } catch {
    return null
  }
}
