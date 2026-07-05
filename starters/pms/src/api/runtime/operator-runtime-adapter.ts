import { buildBookingRouteRuntime, createBookingPiiService } from "@voyant-travel/bookings"
import { createVoyantDataFxExchangeRateResolver } from "@voyant-travel/finance"
import type { VoyantDb } from "@voyant-travel/hono"
import {
  type CloudWorkflowsClientEnv,
  createCloudWorkflowDriver,
} from "@voyant-travel/workflows/client"
import { createInMemoryDriver } from "@voyant-travel/workflows-orchestrator/in-memory"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { resolveVoyantApiKey } from "../../lib/voyant-cloud"
import { getDbFromEnv } from "../lib/db"
import {
  createDocumentStorage,
  readDocumentContentBase64,
  resolveDocumentDownloadUrl,
} from "../lib/storage"
import { createSmartbillSettlementPollers } from "../subscribers/smartbill"
import {
  generateContractPdfForBooking,
  resolveContractDocumentGenerator,
} from "./contract-document-runtime"

export function operatorBindings(bindings: unknown): CloudflareBindings {
  return bindings as CloudflareBindings
}

export function operatorPostgresDb(db: VoyantDb): PostgresJsDatabase {
  return db as PostgresJsDatabase
}

export function resolveOperatorDb(bindings: unknown) {
  return getDbFromEnv(operatorBindings(bindings))
}

export function readOperatorDocumentContentBase64(
  bindings: unknown,
  storageKey: string,
): Promise<string | null> {
  return readDocumentContentBase64(operatorBindings(bindings), storageKey)
}

export function resolveOperatorDocumentDownloadUrl(
  bindings: unknown,
  storageKey: string,
): Promise<string | null> {
  return resolveDocumentDownloadUrl(operatorBindings(bindings), storageKey)
}

export function createOperatorDocumentStorage(bindings: unknown) {
  return createDocumentStorage(operatorBindings(bindings))
}

export function resolveOperatorContractDocumentGenerator(bindings: unknown) {
  return resolveContractDocumentGenerator(operatorBindings(bindings)) ?? undefined
}

export async function createOperatorBookingPiiService(bindings: unknown) {
  const env = operatorBindings(bindings)
  const runtime = buildBookingRouteRuntime(env)
  try {
    return createBookingPiiService({ kms: await runtime.getKmsProvider() })
  } catch {
    return null
  }
}

export function createOperatorInvoiceExchangeRateResolver(bindings: unknown) {
  const env = operatorBindings(bindings)
  const apiKey = resolveVoyantApiKey(env)
  if (!apiKey) throw new Error("VOYANT_API_KEY is not set")
  return createVoyantDataFxExchangeRateResolver({
    apiKey,
    baseUrl: env.VOYANT_CLOUD_API_URL,
  })
}

export function createOperatorInvoiceSettlementPollers(bindings: unknown) {
  return createSmartbillSettlementPollers(operatorBindings(bindings))
}

export function operatorWorkflowCloudEnv(env: CloudflareBindings): CloudWorkflowsClientEnv {
  return {
    VOYANT_CLOUD_WORKFLOWS_URL: env.VOYANT_CLOUD_WORKFLOWS_URL,
    VOYANT_CLOUD_WORKFLOW_TRIGGER_TOKEN: env.VOYANT_CLOUD_WORKFLOW_TRIGGER_TOKEN,
    VOYANT_CLOUD_APP_SLUG: env.VOYANT_CLOUD_APP_SLUG ?? "operator",
    VOYANT_CLOUD_ENVIRONMENT: env.VOYANT_CLOUD_ENVIRONMENT,
  }
}

export function createOperatorWorkflowDriver(bindings: unknown) {
  const env = operatorBindings(bindings)
  // Use Voyant Cloud orchestration only when it's actually configured.
  // Local/self-hosted deployments (no Cloud workflow URL + trigger token) run
  // workflows fully in-process via the in-memory driver — no Cloud dependency.
  const cloudConfigured =
    Boolean(env.VOYANT_CLOUD_WORKFLOWS_URL?.trim()) &&
    Boolean(env.VOYANT_CLOUD_WORKFLOW_TRIGGER_TOKEN?.trim())
  if (cloudConfigured) {
    return () => createCloudWorkflowDriver({ env: operatorWorkflowCloudEnv(env) })
  }
  return createInMemoryDriver()
}

export { generateContractPdfForBooking }
