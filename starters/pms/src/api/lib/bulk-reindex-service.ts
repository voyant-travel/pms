/**
 * Operator-side implementation of `BulkReindexProductsService` from
 * `@voyant-travel/commerce`. Bridges the workflow runtime back into the
 * operator's catalog plane: enumerate every owned product, then reindex
 * one at a time. The promotions workflow drives the loop with
 * `ctx.parallel` so each per-product reindex stays bounded.
 */

import { createIndexerService } from "@voyant-travel/catalog"
import type { BulkReindexProductsService } from "@voyant-travel/commerce"
import { products } from "@voyant-travel/inventory/schema"

import {
  buildEmbeddingProvider,
  buildTypesenseIndexer,
  createProductsDocumentBuilder,
  getFieldPolicyRegistries,
  loadCatalogSlices,
  withEmbedding,
} from "./catalog-runtime.js"
import { withDbFromEnv } from "./db.js"

type BulkReindexEnv = CloudflareBindings & {
  TENANT_ID?: string
  TYPESENSE_HOST?: string
  TYPESENSE_ADMIN_API_KEY?: string
  TYPESENSE_API_KEY?: string
}

export function createBulkReindexProductsService(env: BulkReindexEnv): BulkReindexProductsService {
  const sellerOperatorId = env.TENANT_ID ?? "default"

  return {
    async listAllProductIds(): Promise<string[]> {
      return withDbFromEnv(env, async (db) => {
        const rows = await db.select({ id: products.id }).from(products)
        return rows.map((r) => r.id)
      })
    },

    async reindexProduct(productId: string): Promise<void> {
      const embeddings = buildEmbeddingProvider(env)
      const adapter = buildTypesenseIndexer(env, embeddings)
      // No indexer configured: nothing to do. The catalog plane is
      // optional — operators without Typesense get keyword-only search
      // off the relational store.
      if (!adapter) return

      await withDbFromEnv(env, async (db) => {
        const service = createIndexerService({
          adapter,
          slices: await loadCatalogSlices(db),
          registries: getFieldPolicyRegistries(),
        })
        const builder = withEmbedding(
          createProductsDocumentBuilder(db, { sellerOperatorId }),
          embeddings,
        )
        // Reindex across every slice the indexer was constructed with.
        // The promotions projection extension picks up the offer changes
        // on the next document build, so no extra wiring is needed here.
        await service.ensureCollections()
        await service.reindexEntity("products", productId, builder)
      })
    },
  }
}
