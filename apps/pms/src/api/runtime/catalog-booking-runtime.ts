import {
  type CatalogBookingMountTarget,
  type CatalogBookingRouteModuleOptions,
  type CatalogBookingRoutesOptions,
  catalogQuotesTable,
  mountCatalogBookingRoutes as mountPackageCatalogBookingRoutes,
  OWNED_SOURCE_KIND,
  type QuoteEntityResult,
  type SlotRow,
} from "@voyant-travel/catalog/booking-engine"
import { createCatalogPromotionEvaluator } from "@voyant-travel/commerce"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { suppliers } from "@voyant-travel/distribution"
import { computeBookingItemTaxLine, resolveBookingSellTaxRate } from "@voyant-travel/finance"
import { products, productsService } from "@voyant-travel/inventory"
import { getProductContent } from "@voyant-travel/inventory/service-content"
import { availabilitySlots } from "@voyant-travel/operations"
import { resolveBookingTaxSettings } from "@voyant-travel/operator-settings"
import { and, asc, eq, gte } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import {
  getBookingEngineRegistryFromContext,
  getOwnedBookingHandlerRegistryFromContext,
} from "../lib/booking-engine-runtime"

const DEFAULT_HOLD_TTL_MS = 30 * 60 * 1000

function getCatalogBookingDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}

function createOperatorCatalogBookingRoutesOptions(): CatalogBookingRoutesOptions {
  return {
    resolveDb: getCatalogBookingDb,
    resolveSourceRegistry: getBookingEngineRegistryFromContext,
    resolveOwnedHandlers: getOwnedBookingHandlerRegistryFromContext,
    resolveHoldTtlMs: ({ db, entityModule, entityId }) =>
      resolveHoldTtlMs(db, entityModule, entityId),
    // Promotions hook wires the per-request db into the evaluator. When
    // the customer-supplied promotion code fails validation, quoteEntity
    // surfaces a code_* invalidReason and tax recompute below sees no
    // discount on base_amount.
    resolveEvaluatePromotions: ({ db }) => createCatalogPromotionEvaluator(db),
    transformQuoteResult: ({ db, result, request, provenance }) =>
      applyOperatorTaxToQuoteResult(
        db,
        result,
        request.entityModule,
        request.entityId,
        provenance.sourceKind,
      ),
    onDraftConsumedError: ({ error }) => {
      console.warn("[catalog-booking] markDraftConsumed failed:", error)
    },
  }
}

/**
 * Read the owned `availability_slots` rows for a product (owned slots path).
 * Lives in the deployment because `@voyant-travel/operations` depends on
 * `@voyant-travel/catalog` — injecting this keeps the catalog package free of
 * a static operations import. Maps rows into the package's `SlotRow` shape.
 */
async function listAvailabilitySlots(
  db: AnyDrizzleDb,
  productId: string,
  todayIso: string,
): Promise<SlotRow[]> {
  return (db as PostgresJsDatabase)
    .select({
      id: availabilitySlots.id,
      dateLocal: availabilitySlots.dateLocal,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
      timezone: availabilitySlots.timezone,
      status: availabilitySlots.status,
      unlimited: availabilitySlots.unlimited,
      remainingPax: availabilitySlots.remainingPax,
      initialPax: availabilitySlots.initialPax,
      nights: availabilitySlots.nights,
      days: availabilitySlots.days,
    })
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.productId, productId),
        eq(availabilitySlots.status, "open"),
        gte(availabilitySlots.dateLocal, todayIso),
      ),
    )
    .orderBy(asc(availabilitySlots.startsAt))
    .limit(60)
}

/**
 * Build the full catalog booking-engine route-module options for this
 * deployment, including the three cross-package readers the package can't
 * import statically (would cycle through inventory/operations → catalog).
 */
function createOperatorCatalogBookingRouteModuleOptions(): CatalogBookingRouteModuleOptions {
  return {
    booking: createOperatorCatalogBookingRoutesOptions(),
    resolveRegistry: getBookingEngineRegistryFromContext,
    getProductContent: (db, productId, scope, ctx) => getProductContent(db, productId, scope, ctx),
    listAvailabilitySlots,
    getOwnedProductById: async (db, productId) => {
      const product = await productsService.getProductById(db as PostgresJsDatabase, productId)
      if (!product) return null
      return { name: product.name, description: product.description }
    },
  }
}

/**
 * Mount the full catalog booking-engine surface (lifecycle + orders + slots +
 * catalog-snapshot) onto an absolute-path Hono app, wired with this
 * deployment's options + cross-package readers.
 */
export function mountCatalogBookingRoutes(hono: CatalogBookingMountTarget): void {
  mountPackageCatalogBookingRoutes(hono, createOperatorCatalogBookingRouteModuleOptions())
}

function positiveMinutes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

async function resolveHoldTtlMs(
  db: AnyDrizzleDb,
  entityModule: string,
  entityId: string,
): Promise<number> {
  if (entityModule !== "products") {
    return DEFAULT_HOLD_TTL_MS
  }

  const [product] = await db
    .select({
      supplierId: products.supplierId,
      reservationTimeoutMinutes: products.reservationTimeoutMinutes,
    })
    .from(products)
    .where(eq(products.id, entityId))
    .limit(1)

  const productMinutes = positiveMinutes(product?.reservationTimeoutMinutes)
  if (productMinutes !== null) {
    return productMinutes * 60 * 1000
  }

  if (!product?.supplierId) {
    return DEFAULT_HOLD_TTL_MS
  }

  const [supplier] = await db
    .select({ reservationTimeoutMinutes: suppliers.reservationTimeoutMinutes })
    .from(suppliers)
    .where(eq(suppliers.id, product.supplierId))
    .limit(1)

  return (positiveMinutes(supplier?.reservationTimeoutMinutes) ?? 30) * 60 * 1000
}

export async function applyOperatorTaxToQuoteResult(
  db: AnyDrizzleDb,
  result: QuoteEntityResult,
  entityModule: string,
  entityId: string,
  sourceKind: string,
): Promise<QuoteEntityResult> {
  if (!result.available || !result.pricing) return result
  // When promotional offers were applied at quote time, quoteEntity
  // clears taxes + breakdown because the upstream values were computed
  // against the un-discounted base. Recompute taxes here even for owned
  // quotes so discounted customer-facing totals remain correct.
  const hasAppliedOffers = (result.pricing.appliedOffers?.length ?? 0) > 0
  if (sourceKind === OWNED_SOURCE_KIND && !hasAppliedOffers) return result
  if (result.pricing.taxes > 0 && !hasAppliedOffers) return result

  const pricing = result.pricing
  const taxableCents = pricing.base_amount
  const taxRate = await resolveBookingSellTaxRate(
    db as PostgresJsDatabase,
    {
      productId: entityModule === "products" ? entityId : null,
      facts: { hasAccommodation: false, accommodationCountries: [] },
    },
    {
      resolveBookingTaxSettings,
    },
  )
  const taxLine = computeBookingItemTaxLine(taxRate, taxableCents, pricing.currency)
  if (!taxLine) return result

  const inclusive = taxLine.includedInPrice
  const subtotal = inclusive ? Math.max(0, taxableCents - taxLine.amountCents) : taxableCents
  const total = inclusive ? taxableCents : taxableCents + taxLine.amountCents
  const adjustedPricing = {
    ...pricing,
    base_amount: subtotal,
    taxes: taxLine.amountCents,
    breakdown: {
      currency: pricing.currency,
      lines: [
        {
          kind: "base",
          label: "Base",
          quantity: 1,
          unitAmount: taxableCents,
          totalAmount: taxableCents,
          taxIncluded: inclusive,
        },
      ],
      taxes: [
        {
          code: taxLine.code ?? "tax",
          label: taxLine.name,
          rate: (taxLine.rateBasisPoints ?? 0) / 10_000,
          amount: taxLine.amountCents,
          base: subtotal,
          includedInPrice: inclusive,
          scope: taxLine.scope,
        },
      ],
      subtotal,
      taxTotal: taxLine.amountCents,
      total,
    },
  }

  await (db as PostgresJsDatabase)
    .update(catalogQuotesTable)
    .set({
      pricing_base_amount: String(adjustedPricing.base_amount),
      pricing_taxes: String(adjustedPricing.taxes),
      pricing_fees: String(adjustedPricing.fees),
      pricing_surcharges: String(adjustedPricing.surcharges),
      pricing_currency: adjustedPricing.currency,
      pricing_breakdown: adjustedPricing.breakdown,
    })
    .where(eq(catalogQuotesTable.id, result.quoteId))

  return { ...result, pricing: adjustedPricing }
}
