/**
 * Operator (deployment) wiring for catalog-backed trip components.
 *
 * The reusable catalog-component orchestration (quote / reserve-with-origin /
 * release / cancel) now lives in `@voyant-travel/trips/catalog-component`. This
 * file supplies the deployment-specific dependencies the package can't import
 * statically:
 *   - the process-local source-adapter + owned-handler registries,
 *   - the commerce promotion evaluator (commerce → quotes → trips would cycle),
 *   - the operator's customer-facing tax recompute (`applyOperatorTaxToQuoteResult`),
 *   - the catalog checkout hand-off (`startCatalogCheckout`, Netopia wiring).
 *
 * Each exported `*Component` function keeps the `(c, input)` signature the trips
 * route wiring (`trips-runtime.ts`) already imports.
 */

import type { QuoteResponseV1 } from "@voyant-travel/catalog/booking-engine"
import { createCatalogPromotionEvaluator } from "@voyant-travel/commerce"
import type { EventBus } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type {
  CancelComponentInput,
  CancelComponentResult,
  CatalogComponentQuoteInput,
  ComponentCancellationPreview,
  ComponentCancellationPreviewInput,
  ComponentCheckoutInput,
  ComponentCheckoutResult,
  ReleaseReservedComponentInput,
  ReleaseReservedComponentResult,
  ReserveComponentInput,
  ReserveComponentResult,
} from "@voyant-travel/trips"
import {
  createCatalogComponentAdapter,
  previewCancellation,
} from "@voyant-travel/trips/catalog-component"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  getBookingEngineRegistryFromContext,
  getOwnedBookingHandlerRegistryFromContext,
} from "../lib/booking-engine-runtime"
import {
  CatalogCheckoutStartError,
  type CatalogCheckoutStartResult,
  type CheckoutStartInput,
  startCatalogCheckout,
} from "../routes/catalog-checkout"
import { applyOperatorTaxToQuoteResult } from "./catalog-booking-runtime"

/**
 * Build the trips catalog-component adapter for a request, injecting the
 * deployment-specific registries / readers / checkout wiring.
 */
function catalogComponentAdapter(c: Context) {
  const db = getDb(c)
  return createCatalogComponentAdapter({
    db,
    registry: getBookingEngineRegistryFromContext(c),
    ownedHandlers: getOwnedBookingHandlerRegistryFromContext(c),
    evaluatePromotions: createCatalogPromotionEvaluator(db),
    transformQuoteResult: (result, entityModule, entityId, sourceKind) =>
      applyOperatorTaxToQuoteResult(db, result, entityModule, entityId, sourceKind),
    adapterContext: (connectionId) => adapterContext(c, connectionId),
    startCheckout: (input) => startComponentCheckout(c, input),
  })
}

export function quoteCatalogComponent(
  c: Context,
  input: CatalogComponentQuoteInput,
): Promise<QuoteResponseV1> {
  return catalogComponentAdapter(c).quote(input)
}

export function reserveCatalogComponent(
  c: Context,
  input: ReserveComponentInput,
): Promise<ReserveComponentResult> {
  return catalogComponentAdapter(c).reserve(input)
}

export function releaseReservedComponent(
  c: Context,
  input: ReleaseReservedComponentInput,
): Promise<ReleaseReservedComponentResult> {
  return catalogComponentAdapter(c).release(input)
}

export function previewComponentCancellation(
  input: ComponentCancellationPreviewInput,
): Promise<ComponentCancellationPreview> {
  // Pure preview — no db / registry reads (supplier cancellation previews
  // aren't available; the cancellation result is authoritative).
  return previewCancellation(input)
}

export function cancelComponent(
  c: Context,
  input: CancelComponentInput,
): Promise<CancelComponentResult> {
  return catalogComponentAdapter(c).cancel(input)
}

export async function startComponentCheckout(
  c: Context,
  input: ComponentCheckoutInput,
): Promise<ComponentCheckoutResult> {
  const bookingId = required(input.component.bookingId, "component.bookingId")
  const checkoutInput: CheckoutStartInput = {
    ...(input.request as Partial<CheckoutStartInput>),
    bookingId,
    paymentIntent: input.intent,
  }

  try {
    return checkoutResultToComponentResult(
      await startCatalogCheckout(
        {
          db: getDb(c) as PostgresJsDatabase,
          env: c.env as CloudflareBindings & Record<string, string | undefined>,
          eventBus: getEventBus(c),
          resolveRuntime: (key) => getContainer(c)?.resolve(key),
          requestMeta: checkoutRequestMeta(c),
          c,
        },
        checkoutInput,
      ),
    )
  } catch (error) {
    if (error instanceof CatalogCheckoutStartError) {
      throw new Error(error.code)
    }
    throw error
  }
}

function checkoutResultToComponentResult(
  result: CatalogCheckoutStartResult,
): ComponentCheckoutResult {
  switch (result.kind) {
    case "card_redirect":
      return {
        kind: "card_redirect",
        bookingId: result.bookingId,
        paymentSessionId: result.paymentSessionId,
        checkoutUrl: result.redirectUrl,
      }
    case "bank_transfer_instructions":
      return {
        kind: "bank_transfer_instructions",
        bookingId: result.bookingId,
        paymentSessionId: result.paymentSessionId ?? undefined,
        bankTransferInstructions: result.instructions,
      }
    case "inquiry_received":
      return {
        kind: "inquiry_received",
        bookingId: result.bookingId,
        providerRef: result.inquiryId,
      }
    case "hold_placed":
      return {
        kind: "hold_placed",
        bookingId: result.bookingId,
      }
  }
}

function adapterContext(c: Context, connectionId: string | null | undefined) {
  return {
    connection_id: connectionId ?? "engine",
    correlation_id: c.req.header("x-request-id") ?? cryptoRandom(),
  }
}

function getDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}

function getEventBus(c: Context): EventBus | undefined {
  return (c.var as { eventBus?: EventBus }).eventBus
}

function getContainer(c: Context): { resolve(key: string): unknown } | undefined {
  return (c.var as { container?: { resolve(key: string): unknown } }).container
}

function checkoutRequestMeta(c: Context) {
  return {
    clientIp:
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "",
    userAgent: c.req.header("user-agent") ?? "",
  }
}

function required(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}

function cryptoRandom(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
