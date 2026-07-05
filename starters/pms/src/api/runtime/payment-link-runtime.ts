/**
 * Operator (deployment) wiring for the public payment-link routes.
 *
 * The route ORCHESTRATION (config / retry / resolve / start-card / trip &
 * booking summary / checkout-status handlers, validation, and the render
 * shapes) lives in `@voyant-travel/storefront` via `createPaymentLinkRoutes`.
 * This file supplies the deployment-specific access the package can't import
 * statically:
 *   - the bank-transfer beneficiary details + public checkout base URL
 *     (operator settings + `./payment-config`),
 *   - the card-payment provider start (finance + Netopia),
 *   - the trip envelope/component reconciliation + product-media enrichment
 *     (`@voyant-travel/trips` + `@voyant-travel/inventory`).
 *
 * Swapping the payment provider, or the catalog source, is a change here —
 * never in the route implementations.
 */
import { productMedia, products } from "@voyant-travel/inventory/schema"
import {
  getOperatorPaymentInstructions,
  getOperatorProfile,
} from "@voyant-travel/operator-settings"
import {
  createPaymentLinkRoutes,
  type PaymentLinkRoutesOptions,
  type PaymentLinkTripData,
} from "@voyant-travel/storefront/payment-link"
import { tripsService } from "@voyant-travel/trips"
import { tripComponents, tripEnvelopes } from "@voyant-travel/trips/schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context, Hono } from "hono"
import { cardPaymentStarter } from "./card-payment"
import {
  bankTransferDetailsFromOperatorSettings,
  resolvePublicCheckoutBaseUrlFromBindings,
} from "./payment-config"

function getDb(c: Context): PostgresJsDatabase {
  return c.get("db") as PostgresJsDatabase
}

/** Bank-transfer beneficiary details from operator settings merged with env. */
async function resolveBankTransferDetails(c: Context) {
  const db = getDb(c)
  const [operatorProfile, paymentInstructions] = await Promise.all([
    getOperatorProfile(db),
    getOperatorPaymentInstructions(db),
  ])
  const details = bankTransferDetailsFromOperatorSettings(
    operatorProfile,
    paymentInstructions,
    c.env as Record<string, unknown>,
  )
  if (!details) return null
  return {
    beneficiary: details.beneficiary,
    iban: details.iban,
    bankName: details.bankName,
  }
}

/** Start a fresh card payment via this deployment's processor, or report it isn't configured. */
const startCardPayment: PaymentLinkRoutesOptions["startCardPayment"] = async (c, session) => {
  const [first, ...rest] = (session.payerName ?? "").trim().split(/\s+/)
  const last = rest.length > 0 ? rest.join(" ") : "Customer"
  const result = await cardPaymentStarter(c, {
    db: getDb(c),
    sessionId: session.id,
    billing: {
      email: session.payerEmail ?? "tbd@example.com",
      phone: "0000000000",
      firstName: first || "Customer",
      lastName: last,
      city: "TBD",
      country: 642,
      state: "TBD",
      postalCode: "00000",
      details: "Pending - customer to confirm at payment.",
    },
    description: session.notes ?? `Payment ${session.id}`,
  })
  if (!result) {
    return { configured: false }
  }
  return {
    configured: true,
    redirectUrl: result.redirectUrl,
  }
}

/**
 * Resolve a trip envelope (+ reconcile a paid checkout) and its visible
 * components with product-media enrichment. Encapsulates the trips + inventory
 * schema reads the package stays free of.
 */
const resolveTripData: PaymentLinkRoutesOptions["resolveTripData"] = async (
  c,
  tripEnvelopeId,
  session,
): Promise<PaymentLinkTripData | null> => {
  const db = getDb(c)

  const [envelope] = await db
    .select()
    .from(tripEnvelopes)
    .where(eq(tripEnvelopes.id, tripEnvelopeId))
    .limit(1)
  if (!envelope) return null

  if (session.status === "paid" && envelope.status !== "booked") {
    try {
      await tripsService.completeTripCheckout(db, {
        envelopeId: envelope.id,
        paymentSessionId: session.id,
        payload: {
          source: "payment_link_trip_summary_reconcile",
          amountCents: session.amountCents,
          currency: session.currency,
          provider: session.provider,
        },
      })
    } catch (err) {
      console.error("[trips] payment summary reconciliation failed", err)
    }
  }

  const components = await db
    .select()
    .from(tripComponents)
    .where(eq(tripComponents.envelopeId, tripEnvelopeId))
    .orderBy(asc(tripComponents.sequence), asc(tripComponents.createdAt))

  const visibleComponents = components.filter(
    (component) => component.status !== "removed" && component.status !== "cancelled",
  )

  const productIds = Array.from(
    new Set(
      visibleComponents
        .map((component) => component.entityId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  )

  const mediaByProductId = new Map<string, { url: string; altText: string | null }>()
  const productNameById = new Map<string, string>()
  if (productIds.length > 0) {
    const productRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(inArray(products.id, productIds))
    for (const row of productRows) productNameById.set(row.id, row.name)
    const mediaRows = await db
      .select({
        productId: productMedia.productId,
        url: productMedia.url,
        altText: productMedia.altText,
        isCover: productMedia.isCover,
        sortOrder: productMedia.sortOrder,
        mediaType: productMedia.mediaType,
      })
      .from(productMedia)
      .where(and(inArray(productMedia.productId, productIds), eq(productMedia.mediaType, "image")))
      .orderBy(asc(productMedia.productId), desc(productMedia.isCover), asc(productMedia.sortOrder))
    for (const row of mediaRows) {
      if (!mediaByProductId.has(row.productId)) {
        mediaByProductId.set(row.productId, { url: row.url, altText: row.altText })
      }
    }
  }

  return {
    envelope: { id: envelope.id, status: envelope.status },
    components: visibleComponents.map((component) => ({
      id: component.id,
      kind: component.kind,
      entityModule: component.entityModule,
      entityId: component.entityId,
      description: component.description,
      status: component.status,
      sequence: component.sequence,
      componentTotalAmountCents: component.componentTotalAmountCents,
      componentCurrency: component.componentCurrency,
      metadata: (component.metadata ?? null) as Record<string, unknown> | null,
    })),
    productNameById,
    mediaByProductId,
  }
}

/** Build the payment-link route-module options for this deployment. */
export function createOperatorPaymentLinkRouteOptions(): PaymentLinkRoutesOptions {
  return {
    resolveBankTransferDetails,
    resolvePublicCheckoutBaseUrl: (c) =>
      resolvePublicCheckoutBaseUrlFromBindings(c.env as Record<string, unknown>),
    startCardPayment,
    resolveTripData,
  }
}

/** The public payment-link routes, wired with this deployment's options. */
// biome-ignore lint/suspicious/noExplicitAny: createPaymentLinkRoutes now returns an OpenAPIHono (non-blank Env), assignable to Hono<any> for the lazy loader (voyant#2114)
export function buildOperatorPaymentLinkRoutes(): Hono<any> {
  return createPaymentLinkRoutes(createOperatorPaymentLinkRouteOptions())
}
