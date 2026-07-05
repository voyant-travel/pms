/**
 * Promotions boundary scheduler — Cloudflare Workers cron entrypoint.
 *
 * Wakes every 5 minutes and asks `runPromotionBoundaryScheduler` to scan
 * for offers whose `valid_from` / `valid_until` crossed the watermark
 * since the last tick. Two dispatch paths:
 *
 *   - `affected.kind === "products"` → reindex each listed id inline
 *     against the catalog plane. Bounded set, fast.
 *   - `affected.kind === "all"`      → forward a `promotion.changed`
 *     envelope into the workflow driver (`driver.ingestEvent`). The
 *     `trigger.on()` filter declared by the promotions module routes
 *     it into the bulk-reindex workflow.
 *
 * Why dispatch directly instead of emitting through the in-process
 * EventBus: scheduled handlers run in their own isolate-call and don't
 * share an in-process `EventBus` with the running app. The managed Cloud
 * workflow driver forwards events to the hosted runtime, so a fresh
 * per-tick instance still routes correctly.
 *
 * Per docs/architecture/promotions-architecture.md §9.2.
 */

import { createIndexerService } from "@voyant-travel/catalog"
import {
  type BoundarySchedulerResult,
  PROMOTION_CHANGED_EVENT,
  runPromotionBoundaryScheduler,
} from "@voyant-travel/commerce"
import { createCloudWorkflowDriver } from "@voyant-travel/workflows/client"

import {
  buildEmbeddingProvider,
  buildTypesenseIndexer,
  createProductsDocumentBuilder,
  getFieldPolicyRegistries,
  loadCatalogSlices,
  withEmbedding,
} from "../lib/catalog-runtime"
import { withDbFromEnv } from "../lib/db"
import { operatorWorkflowCloudEnv } from "../runtime/operator-runtime-adapter"

/** Cron expression — declared in `wrangler.jsonc` and matched against `event.cron` in `entry.ts`. */
export { PROMOTION_BOUNDARY_SCHEDULER_CRON } from "../../scheduled-crons"

export async function runScheduledPromotionBoundary(
  _event: ScheduledController,
  env: CloudflareBindings & { TENANT_ID?: string },
): Promise<BoundarySchedulerResult & { reindexedProductIds: number }> {
  // `withDbFromEnv` owns the per-tick Pool — the WebSocket closes when
  // this scheduled run finishes, instead of leaking until isolate
  // teardown. Mirrors the lifecycle pattern from #510 / #512.
  return withDbFromEnv(env, async (db) => {
    const result = await runPromotionBoundaryScheduler({ db })

    // Build the indexer once per tick (Pool already open via withDbFromEnv).
    const sellerOperatorId = env.TENANT_ID ?? "default"
    const embeddings = buildEmbeddingProvider(env)
    const indexer = buildTypesenseIndexer(env, embeddings)
    let reindexedProductIds = 0

    if (indexer && result.crossings.length > 0) {
      const service = createIndexerService({
        adapter: indexer,
        slices: await loadCatalogSlices(db),
        registries: getFieldPolicyRegistries(),
      })
      const builder = withEmbedding(
        createProductsDocumentBuilder(db, { sellerOperatorId }),
        embeddings,
      )
      await service.ensureCollections()

      // Aggregate distinct product IDs across `affected.kind === "products"`
      // crossings so multiple offers landing on the same product reindex
      // once. `affected.kind === "all"` crossings dispatch through the
      // workflow runtime below — see the per-tick driver block.
      const productIds = new Set<string>()
      const allCrossings: typeof result.crossings = []
      for (const crossing of result.crossings) {
        if (crossing.affected.kind === "products") {
          for (const id of crossing.affected.productIds) productIds.add(id)
        } else {
          allCrossings.push(crossing)
        }
      }

      for (const productId of productIds) {
        await service.reindexEntity("products", productId, builder)
        reindexedProductIds++
      }

      // Forward `affected.kind === "all"` crossings into the managed
      // workflow runtime so the bulk-reindex workflow fires the same way
      // it does when CRUD routes emit `promotion.changed`.
      if (allCrossings.length > 0) {
        const driver = createCloudWorkflowDriver({ env: operatorWorkflowCloudEnv(env) })
        for (const crossing of allCrossings) {
          await driver.ingestEvent({
            environment: "development",
            envelope: {
              name: PROMOTION_CHANGED_EVENT,
              data: {
                offerId: crossing.offerId,
                source: crossing.source,
                affected: crossing.affected,
              },
              emittedAt: new Date().toISOString(),
            },
          })
        }
      }
    }

    return { ...result, reindexedProductIds }
  })
}
