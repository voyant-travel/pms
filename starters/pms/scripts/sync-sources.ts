/**
 * Source discovery sync CLI — pulls projections from every registered
 *
 * agent-quality: file-size exception -- Source sync CLI keeps adapter setup, indexing, and progress reporting together until CLI phases are split into reusable modules.
 *
 * `SourceAdapter` (Voyant Connect peers, GDS connectors, the demo
 * upstream at `apps/catalog-demo-api`) and pushes them into the
 * deployment's Typesense index. Sourced rows then show up in the
 * Catalog UI alongside the operator's owned products.
 *
 * Usage (from starters/operator):
 *   pnpm exec tsx scripts/sync-sources.ts
 *   pnpm sync:sources
 *
 * Env required:
 *   TYPESENSE_HOST            — e.g. http://localhost:8108
 *   TYPESENSE_ADMIN_API_KEY   — admin key (or TYPESENSE_API_KEY)
 *   DATABASE_URL              — catalog DB where sourced-entry rows are upserted
 *
 * Configure at least one source adapter:
 *   CATALOG_DEMO_API_URL      — demo upstream URL
 *   VOYANT_API_KEY            — Voyant API key, used for Connect + embeddings
 *   VOYANT_CONNECT_OPERATOR_ID
 *
 * Env optional:
 *   VOYANT_CONNECT_API_URL
 *   VOYANT_CONNECT_MARKET
 *   VOYANT_CONNECT_SYNC_LIMIT
 *   VOYANT_CATALOG_EMBEDDINGS — set to `false` to skip sync-time embeddings
 *   VOYANT_CLOUD_API_KEY      — legacy alias for VOYANT_API_KEY
 *   VOYANT_CONNECT_API_KEY    — legacy alias for VOYANT_API_KEY
 */

import {
  createGeminiEmbeddingProvider,
  createIndexerService,
  createTypesenseIndexer,
  type DocumentBuilder,
  type EmbeddingProvider,
  type IndexerDocument,
  type IndexerSlice,
} from "@voyant-travel/catalog"
import { type SyncSourcesSummary, syncSources } from "@voyant-travel/catalog/booking-engine"
import { config } from "dotenv"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { Client as TypesenseSdkClient } from "typesense"
import { getFieldPolicyRegistries } from "../src/api/lib/catalog-runtime.js"
import { buildSyncSourceRegistry } from "./lib/build-sync-source-registry.js"
import { asTypesenseClient } from "./lib/typesense-sdk-client.js"

config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })

const typesenseHost = process.env.TYPESENSE_HOST
const typesenseKey = process.env.TYPESENSE_ADMIN_API_KEY ?? process.env.TYPESENSE_API_KEY
const cloudApiKey =
  process.env.VOYANT_CATALOG_EMBEDDINGS === "false"
    ? undefined
    : (process.env.VOYANT_API_KEY ?? process.env.VOYANT_CLOUD_API_KEY)
const cloudApiUrl = (process.env.VOYANT_CLOUD_API_URL ?? "https://api.voyant.travel").replace(
  /\/$/,
  "",
)
const databaseUrl = process.env.DATABASE_URL

if (!typesenseHost) throw new Error("TYPESENSE_HOST is not set")
if (!typesenseKey) throw new Error("TYPESENSE_ADMIN_API_KEY is not set")
if (!databaseUrl) throw new Error("DATABASE_URL is not set")

// Drizzle client. The sync upserts a row into `catalog_sourced_entries`
// for every projection alongside the indexer write so the catalog
// detail sheet's content endpoint (and the snapshot capture path) can
// resolve the entity by its catalog-side id (sourced-content §2.5.2).
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })
const db = drizzle(sql)

// ── Registry: register every adapter the deployment supports ─────────────
// Same wiring (demo + Connect + cruise adapters) as the live booking-engine
// registry, factored out so it can be unit-tested without the CLI side effects.
const registry = await buildSyncSourceRegistry(process.env)

const adapterKinds = registry.kinds()
if (adapterKinds.length === 0) {
  console.warn(
    "[sync-sources] no SourceAdapters are registered — set CATALOG_DEMO_API_URL or wire " +
      "another adapter to populate the index from sourced inventory.",
  )
  process.exit(0)
}

console.info(`[sync-sources] registered adapters: ${adapterKinds.join(", ")}`)

// ── Indexer + embeddings (mirrors scripts/reindex.ts wiring) ─────────────
const embeddings: EmbeddingProvider | undefined = cloudApiKey
  ? createGeminiEmbeddingProvider({
      apiKey: cloudApiKey,
      auth: "bearer",
      baseUrl: `${cloudApiUrl}/ai/v1/gemini`,
    })
  : undefined

if (embeddings) {
  console.info(
    `[sync-sources] embeddings enabled — model=${embeddings.capabilities.modelId} dims=${embeddings.capabilities.dimensions}`,
  )
} else {
  console.info("[sync-sources] embeddings disabled — keyword-only index")
}

const parsed = new URL(typesenseHost)
const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80
const protocol = parsed.protocol.replace(":", "") as "http" | "https"
const tsClient = new TypesenseSdkClient({
  nodes: [{ host: parsed.hostname, port, protocol }],
  apiKey: typesenseKey,
  connectionTimeoutSeconds: 10,
})
const indexer = createTypesenseIndexer({
  client: asTypesenseClient(tsClient),
  vectorDimensions: embeddings?.capabilities.dimensions,
})

// Index with the SAME composed field-policy registries the search runtime uses
// (catalog-runtime). Single source of truth, so the indexed collection always
// has every field search can sort/filter/facet on — otherwise search-only
// fields 404 (e.g. price sort on `priceFromAmountCents`, departure sort on
// `nextDepartureAt`).
const fieldPolicyRegistries = getFieldPolicyRegistries()

const VERTICALS = ["products", "extras", "cruises", "charters", "accommodations"] as const
const slices: IndexerSlice[] = VERTICALS.flatMap((vertical) => [
  { vertical, locale: "en-GB", audience: "staff", market: "default" },
  { vertical, locale: "en-GB", audience: "customer", market: "default" },
])

const indexerService = createIndexerService({
  adapter: indexer,
  slices,
  registries: fieldPolicyRegistries,
})

console.info(`[sync-sources] ensuring collections for ${slices.length} slice(s)`)
await indexerService.ensureCollections()

// ── Run the sync ─────────────────────────────────────────────────────────
const wrapBuilder = embeddings
  ? (inner: DocumentBuilder): DocumentBuilder =>
      async (entityId, slice): Promise<IndexerDocument | null> => {
        const doc = await inner(entityId, slice)
        if (!doc) return null
        const text = composeMerchandisableText(doc)
        if (!text) return doc
        try {
          const [vector] = await embeddings.embed([text])
          if (!vector) return doc
          return {
            ...doc,
            embeddings: { ...(doc.embeddings ?? {}), text_embedding: vector },
            embedding_model_id: embeddings.capabilities.modelId,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.warn(
            `[sync-sources] embedding failed for ${slice.vertical}/${entityId}: ${message}`,
          )
          return doc
        }
      }
  : undefined

const summary: SyncSourcesSummary = await syncSources({
  registry,
  indexerService,
  fieldPolicyRegistries,
  db,
  ...(wrapBuilder ? { wrapBuilder } : {}),
  onProgress(event) {
    console.info(
      `[sync-sources] ${event.adapter}: page ${event.page}, +${event.pageSize} → ${event.totalSoFar}`,
    )
  },
})

console.info("[sync-sources] complete")
for (const adapter of summary.adapters) {
  const verticals = adapter.verticalsTouched.join(",") || "(none)"
  console.info(
    `[sync-sources]   · ${adapter.adapter}: ${adapter.projectionsSynced} projection(s) across [${verticals}], skipped ${adapter.skippedNoRegistry}, sourced-entries upserted ${adapter.sourcedEntriesUpserted}`,
  )
}
console.info(`[sync-sources] total projections synced: ${summary.totalProjections}`)
await sql.end()
process.exit(0)

function composeMerchandisableText(doc: IndexerDocument): string {
  const parts: string[] = []
  const name = doc.fields.name
  if (typeof name === "string" && name.length > 0) parts.push(name)
  const description = doc.fields.description
  if (typeof description === "string" && description.length > 0) parts.push(description)
  const tags = doc.fields.tags
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === "string" && tag.length > 0) parts.push(tag)
    }
  }
  return parts.join(" — ")
}
