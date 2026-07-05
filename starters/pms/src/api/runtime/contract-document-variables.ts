/**
 * Deployment glue for the contract template variable bindings.
 *
 * The variable-assembly logic (acceptance marker, payment schedule, rooms
 * summary, customer hydration, source mapping, documents base URL) is framework
 * (legal) domain logic and lives in `@voyant-travel/legal/contract-variables`.
 * This file only supplies the genuinely deployment-specific reads — the
 * operator profile + payment instructions (operator-owned settings tables) and
 * the payment-policy source (the operator's policy cascade) — plus the env
 * bindings passthrough.
 */
import type { AutoGenerateContractOptions } from "@voyant-travel/legal"
import { buildContractVariableBindings } from "@voyant-travel/legal/contract-variables"
import {
  getOperatorPaymentInstructions,
  getOperatorProfile,
} from "@voyant-travel/operator-settings"
import { readPolicySourceFromInternalNotes } from "./booking-payment-policy-runtime"

export const DEFAULT_CONTRACT_SERIES_NAME = "customer-contracts"

export const AUTO_GENERATE_CONTRACT_OPTIONS: AutoGenerateContractOptions = {
  enabled: true,
  templateSlug: "customer-sales-agreement",
  scope: "customer",
  language: "en",
  seriesName: DEFAULT_CONTRACT_SERIES_NAME,
  // Promote the storefront's acceptance marker, fold in the operator profile
  // (from Settings -> Operator profile), and hydrate the customer block from
  // the linked relationships record. All of that is legal domain logic; the
  // operator only injects the settings reads + policy-source resolver.
  resolveVariables: buildContractVariableBindings({
    resolveOperatorProfile: (db) => getOperatorProfile(db),
    resolveOperatorPaymentInstructions: (db) => getOperatorPaymentInstructions(db),
    resolvePaymentPolicySource: (internalNotes) => readPolicySourceFromInternalNotes(internalNotes),
  }),
}

export function contractVariableBindings(env: CloudflareBindings): Record<string, unknown> {
  return {
    APP_URL: env.APP_URL,
    DOCUMENTS_BASE_URL: env.DOCUMENTS_BASE_URL,
  }
}
