/**
 * External cruise catalog refresh cron.
 *
 * Reconciles configured cruise adapters into `cruise_search_index` and, when
 * the catalog search runtime is configured, the catalog sourced-entry/search
 * slices used by admin and storefront catalog browsing.
 */

import { createIndexerService } from "@voyant-travel/catalog"
import { refreshExternalCruiseCatalog } from "@voyant-travel/cruises/service-external-refresh"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { type BookingEngineEnv, ensureBookingEngineRegistry } from "../lib/booking-engine-runtime"
import {
  buildEmbeddingProvider,
  buildTypesenseIndexer,
  getFieldPolicyRegistries,
  loadCatalogSlices,
  withEmbedding,
} from "../lib/catalog-runtime"
import { withDbFromEnv } from "../lib/db"

export { EXTERNAL_CRUISE_CATALOG_REFRESH_CRON } from "../../scheduled-crons"

export async function runScheduledExternalCruiseCatalogRefresh(
  _event: ScheduledController,
  env: CloudflareBindings & BookingEngineEnv,
) {
  return withDbFromEnv(env, async (rawDb) => {
    const db = rawDb as unknown as PostgresJsDatabase
    const embeddings = buildEmbeddingProvider(env)
    const indexer = buildTypesenseIndexer(env, embeddings)

    if (!indexer) {
      return refreshExternalCruiseCatalog({ db })
    }

    const indexerService = createIndexerService({
      adapter: indexer,
      slices: await loadCatalogSlices(rawDb),
      registries: getFieldPolicyRegistries(),
    })
    await indexerService.ensureCollections()

    return refreshExternalCruiseCatalog({
      db,
      sourceAdapterRegistry: await ensureBookingEngineRegistry(env),
      indexerService,
      fieldPolicyRegistries: getFieldPolicyRegistries(),
      wrapCatalogBuilder: (builder) => withEmbedding(builder, embeddings),
      onCatalogProgress(event) {
        console.info("[external-cruise-refresh] catalog page", event)
      },
    })
  })
}
