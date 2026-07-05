/**
 * Catalog bridge — wires module CRUD + lifecycle events into the catalog
 * plane so Typesense stays in sync without manual reindex runs and so
 * booking commits freeze a snapshot of every line item's resolved view.
 *
 * Subscriptions:
 *   - `product.created`           → reindex the product across configured slices
 *   - `product.updated`           → reindex the product
 *   - `product.deleted`           → delete from every configured slice
 *   - `product.content.changed`   → reindex the product (covers child-entity
 *                                   mutations like destination/category/tag
 *                                   link add/remove that don't bump
 *                                   `product.updated`)
 *   - `availability.slot.changed` → reindex the slot's product so the
 *                                   departure-date facets stay fresh.
 *                                   Cross-package event: avoids polluting
 *                                   `ProductContentChangedEvent.axis`
 *                                   with availability concerns and keeps
 *                                   the products package free of an
 *                                   availability dep.
 *   - `pricing.rule.changed`      → reindex the affected product so the
 *                                   `priceFromAmountCents` aggregation
 *                                   reflects the rule edit. Same
 *                                   cross-package pattern as
 *                                   `availability.slot.changed`.
 *   - `promotion.changed`         → reindex the affected product set so
 *                                   the `bestOffer*` annotations stay
 *                                   in sync with offer mutations and
 *                                   boundary-scheduler firings (per
 *                                   promotions-architecture §9.1 + §9.2).
 *                                   Payload's `affected.kind` decides:
 *                                   `products` → reindex listed IDs in
 *                                   the subscriber. `all` (global /
 *                                   market / audience scope) → log +
 *                                   skip; ops triggers
 *                                   `pnpm exec tsx scripts/reindex.ts products`
 *                                   manually. Inline enumeration of every
 *                                   owned product is unsafe on Cloudflare
 *                                   Workers (CPU / wall-time limits);
 *                                   the proper fix is to enqueue a
 *                                   `@voyant-travel/workflows` job — tracked
 *                                   in voyant-travel/voyant#515 (blocked on
 *                                   #514, `trigger.on()` runtime).
 *   - `booking.confirmed`         → capture a snapshot graph of the
 *                                   booking's product line items via
 *                                   `captureSnapshotGraph`
 *
 * If Typesense isn't configured (no `TYPESENSE_HOST`), the indexer
 * handlers no-op silently. Snapshot capture only requires DB access, so
 * it runs even when search infra isn't set up.
 */

import { bookingItems } from "@voyant-travel/bookings/schema"
import {
  type CaptureSnapshotInput,
  captureSnapshotGraph,
  createIndexerService,
} from "@voyant-travel/catalog"
import { recordPromotionRedemptionsForBooking } from "@voyant-travel/commerce"
import type { HonoBundle } from "@voyant-travel/hono/plugin"
import { buildProductSnapshotInput } from "@voyant-travel/inventory/service-catalog-plane"
import { and, eq, isNotNull } from "drizzle-orm"
import type { NeonDatabase } from "drizzle-orm/neon-serverless"

import {
  buildEmbeddingProvider,
  buildTypesenseIndexer,
  createProductsDocumentBuilder,
  getFieldPolicyRegistries,
  loadCatalogSlices,
  withEmbedding,
} from "../lib/catalog-runtime"
import { withDbFromEnv } from "../lib/db"

interface ProductEventPayload {
  id: string
}

interface ProductContentChangedEventPayload {
  id: string
  axis?: string
}

interface BookingConfirmedEventPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

/**
 * Mirrors `AvailabilitySlotChangedEvent` from `@voyant-travel/operations`.
 * Inlined here so the bridge doesn't need to import the availability
 * events module just for the type — the contract is stable enough that
 * a structural shape suffices and changes show up in review.
 */
interface AvailabilitySlotChangedPayload {
  slotId: string
  productId: string
  optionId: string | null
}

/**
 * Mirrors `PricingRuleChangedEvent` from `@voyant-travel/commerce`. Inlined
 * for the same reason as `AvailabilitySlotChangedPayload` above.
 */
interface PricingRuleChangedPayload {
  productId: string
  ruleId: string
  kind: "option-rule" | "option-unit-rule"
  source: "created" | "updated" | "deleted"
}

/**
 * Mirrors `PromotionChangedEvent` from `@voyant-travel/commerce`.
 * Inlined for the same reason as the availability and pricing payloads
 * above — the bridge needs only the discriminated `affected` shape.
 */
interface PromotionChangedPayload {
  offerId: string
  source: "created" | "updated" | "deleted" | "expired"
  affected: { kind: "products"; productIds: string[] } | { kind: "all" }
}

export const catalogBridgeBundle: HonoBundle = {
  name: "catalog-bridge",
  bootstrap: ({ bindings, eventBus }) => {
    const env = bindings as CloudflareBindings & {
      TENANT_ID?: string
      TYPESENSE_HOST?: string
      TYPESENSE_ADMIN_API_KEY?: string
      TYPESENSE_API_KEY?: string
      VOYANT_CLOUD_API_KEY?: string
    }
    const sellerOperatorId = env.TENANT_ID ?? "default"

    // Compose the indexer service + builder for a given db client. Db
    // ownership lives at the call site so we can wrap with `withDbFromEnv`
    // and tear the Pool down before the subscriber returns.
    async function buildIndexerContext(db: NeonDatabase) {
      const embeddings = buildEmbeddingProvider(env)
      const indexer = buildTypesenseIndexer(env, embeddings)
      if (!indexer) return null
      const slices = await loadCatalogSlices(db)
      const service = createIndexerService({
        adapter: indexer,
        slices,
        registries: getFieldPolicyRegistries(),
      })
      const builder = withEmbedding(
        createProductsDocumentBuilder(db, { sellerOperatorId }),
        embeddings,
      )
      return { service, builder }
    }

    eventBus.subscribe<ProductEventPayload>("product.created", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = await buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.ensureCollections()
        await ctx.service.reindexEntity("products", data.id, ctx.builder)
      })
    })

    eventBus.subscribe<ProductEventPayload>("product.updated", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = await buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.ensureCollections()
        await ctx.service.reindexEntity("products", data.id, ctx.builder)
      })
    })

    eventBus.subscribe<ProductEventPayload>("product.deleted", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = await buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.deleteEntity("products", data.id)
      })
    })

    // `product.content.changed` covers child-entity mutations that don't
    // emit `product.updated` — destination link add/remove, days, options,
    // features, faq, location, media, translations. Every axis affects
    // some part of the resolved doc, so reindex on all of them.
    eventBus.subscribe<ProductContentChangedEventPayload>(
      "product.content.changed",
      async ({ data }) => {
        await withDbFromEnv(env, async (db) => {
          const ctx = await buildIndexerContext(db)
          if (!ctx) return
          await ctx.service.ensureCollections()
          await ctx.service.reindexEntity("products", data.id, ctx.builder)
        })
      },
    )

    // Slot create/update/delete in the availability module reindexes the
    // owning product so departure-date facets (`nextDepartureAt`,
    // `departureDates[]`, `departureMonths[]`, `availableUnitsTotal`)
    // stay fresh. The product itself doesn't change — but the projection
    // extension reads slots, so the document does. Filter early on
    // missing `productId` so a malformed payload can't blow up the
    // subscriber.
    eventBus.subscribe<AvailabilitySlotChangedPayload>(
      "availability.slot.changed",
      async ({ data }) => {
        if (!data.productId) return
        const productId = data.productId
        await withDbFromEnv(env, async (db) => {
          const ctx = await buildIndexerContext(db)
          if (!ctx) return
          await ctx.service.ensureCollections()
          await ctx.service.reindexEntity("products", productId, ctx.builder)
        })
      },
    )

    // Pricing-rule create/update/delete reindexes the affected product so
    // `priceFromAmountCents` (the MIN-across-options aggregate from PR4)
    // reflects rule edits without waiting for an unrelated
    // `product.updated`. Both `option-rule` and `option-unit-rule` kinds
    // are wired — they're the two tables the projection reads.
    eventBus.subscribe<PricingRuleChangedPayload>("pricing.rule.changed", async ({ data }) => {
      if (!data.productId) return
      const productId = data.productId
      await withDbFromEnv(env, async (db) => {
        const ctx = await buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.ensureCollections()
        await ctx.service.reindexEntity("products", productId, ctx.builder)
      })
    })

    // Promotion mutations + boundary-scheduler firings reindex the
    // affected product set so `bestOffer*` annotations stay in sync.
    //
    // `affected.kind === "products"` → reindex each listed ID inline.
    // Bounded by the offer's materialized link table; safe on Workers.
    //
    // `affected.kind === "all"` → routed into the
    // `promotions.reindex-all-products` workflow declared by the
    // promotions module; the workflow runtime fans the work out across
    // per-product steps so each one stays inside Worker CPU limits.
    // The trigger.on filter (also declared by the promotions module)
    // forwards the event automatically — nothing to do here.
    eventBus.subscribe<PromotionChangedPayload>("promotion.changed", async ({ data }) => {
      if (data.affected.kind === "all") return
      const productIds = data.affected.productIds
      if (productIds.length === 0) return
      await withDbFromEnv(env, async (db) => {
        const ctx = await buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.ensureCollections()
        for (const productId of productIds) {
          await ctx.service.reindexEntity("products", productId, ctx.builder)
        }
      })
    })

    // Promotions redemption recorder — runs on the same `booking.confirmed`
    // event as snapshot capture. Reads `pricing_applied_offers` from
    // catalog_quotes (NOT the snapshot, to avoid an ordering race with
    // captureSnapshotGraph) and aggregates one redemption row per
    // (offer, booking). Idempotent on retry via the unique constraint.
    // Per docs/architecture/promotions-architecture.md §7.3.
    eventBus.subscribe<BookingConfirmedEventPayload>("booking.confirmed", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        try {
          await recordPromotionRedemptionsForBooking(db, data.bookingId)
        } catch (err) {
          // Permanent failure leaves the booking committed with no
          // redemption row. Operations can backfill from the snapshot's
          // `pricing_applied_offers` column. Don't rethrow — sibling
          // subscribers (snapshot capture above) shouldn't be blocked.
          console.warn("[catalog-bridge] promotion redemption recorder failed", {
            bookingId: data.bookingId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })
    })

    eventBus.subscribe<BookingConfirmedEventPayload>("booking.confirmed", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        // Catalog snapshots use the staff resolver scope — they're an audit
        // record, not a customer-facing rendering. Booking-time prices /
        // descriptions stay readable to ops even after audience-scoped
        // overlays change.
        const scope = {
          locale: "en-GB",
          audience: "staff" as const,
          market: "default",
          actor: "staff" as const,
        }

        const items = await db
          .select({ productId: bookingItems.productId })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, data.bookingId), isNotNull(bookingItems.productId)))

        const productIds = Array.from(
          new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id))),
        )
        if (productIds.length === 0) return

        const inputs: Array<Omit<CaptureSnapshotInput, "bookingId">> = []
        for (const productId of productIds) {
          const input = await buildProductSnapshotInput(db, productId, {
            sellerOperatorId,
            scope,
          })
          if (input) inputs.push(input)
        }

        if (inputs.length > 0) {
          await captureSnapshotGraph(db, data.bookingId, inputs)
        }
      })
    })
  },
}
