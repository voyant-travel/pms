/**
 * Bulk reindex CLI — populates the configured Typesense indexer with documents
 * from each adopted vertical, fanning out across the configured slices.
 *
 * Usage (from starters/operator):
 *   pnpm exec tsx scripts/reindex.ts                  # reindex all verticals
 *   pnpm exec tsx scripts/reindex.ts products         # one vertical only
 *   pnpm exec tsx scripts/reindex.ts --best-effort    # log row failures, exit 0
 *
 * By default the command FAILS NON-ZERO if Typesense reports any row-level
 * import failure (the import endpoint returns HTTP 200 even when individual
 * documents fail validation, so a reindex can otherwise silently leave the
 * collections empty). Pass `--best-effort` to log representative row errors
 * and continue.
 *
 * Env required:
 *   DATABASE_URL              — Postgres connection string
 *   TYPESENSE_HOST            — e.g. http://localhost:8108
 *   TYPESENSE_ADMIN_API_KEY   — admin key
 *
 * Env optional:
 *   VOYANT_API_KEY            — when set, every emitted document gets a
 *                               `text_embedding` vector via the Voyant
 *                               Cloud Gemini gateway. Without it, the
 *                               index works for keyword search only.
 *   VOYANT_CLOUD_API_KEY      — legacy alias for VOYANT_API_KEY.
 *   VOYANT_CLOUD_API_URL      — defaults to `https://api.voyant.travel`.
 *   VOYANT_CATALOG_EMBEDDINGS — set to `false` to skip embedding generation.
 */

import { roomTypes } from "@voyant-travel/accommodations/schema"
import { createRoomTypeDocumentBuilder } from "@voyant-travel/accommodations/service-catalog-plane"
import {
  createGeminiEmbeddingProvider,
  createIndexerService,
  createTypesenseIndexer,
  type DocumentBuilder,
  type EmbeddingProvider,
  type IndexerDocument,
} from "@voyant-travel/catalog"
import { charterProducts } from "@voyant-travel/charters/schema"
import { createCharterDocumentBuilder } from "@voyant-travel/charters/service-catalog-plane"
import { cruises } from "@voyant-travel/cruises/schema"
import { createDbClient } from "@voyant-travel/db"
import { createExtraDocumentBuilder, productExtras } from "@voyant-travel/inventory/extras"
import { products } from "@voyant-travel/inventory/schema"
import { config } from "dotenv"
import type { PgTable } from "drizzle-orm/pg-core"
import { Client as TypesenseSdkClient } from "typesense"

import {
  CATALOG_VERTICALS,
  createCruisesDocumentBuilder,
  createProductsDocumentBuilder,
  getFieldPolicyRegistries,
  loadCatalogSlices,
} from "../src/api/lib/catalog-runtime.js"
import {
  createTypesenseCollectionAdmin,
  createTypesenseDocumentSearch,
  listObsoleteCatalogCollections,
  listStaleDocuments,
} from "./lib/reindex-stale-documents.js"
import { asTypesenseClient } from "./lib/typesense-sdk-client.js"

config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })

const databaseUrl = process.env.DATABASE_URL
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

if (!databaseUrl) throw new Error("DATABASE_URL is not set")
if (!typesenseHost) throw new Error("TYPESENSE_HOST is not set")
if (!typesenseKey) throw new Error("TYPESENSE_ADMIN_API_KEY is not set")

const sellerOperatorId = process.env.TENANT_ID ?? "default"

const VERTICALS = CATALOG_VERTICALS

const cliArgs = process.argv.slice(2)
const bestEffort = cliArgs.includes("--best-effort")
const requestedVertical = cliArgs.find((arg) => !arg.startsWith("--"))

const db = createDbClient(databaseUrl, { adapter: "node" })
const slices = await loadCatalogSlices(db)

const embeddings: EmbeddingProvider | undefined = cloudApiKey
  ? createGeminiEmbeddingProvider({
      apiKey: cloudApiKey,
      auth: "bearer",
      baseUrl: `${cloudApiUrl}/ai/v1/gemini`,
    })
  : undefined

if (embeddings) {
  console.info(
    `[reindex] embeddings enabled via Voyant Cloud — model=${embeddings.capabilities.modelId} dims=${embeddings.capabilities.dimensions}`,
  )
} else {
  console.info("[reindex] embeddings disabled — keyword-only index")
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
  importFailureMode: bestEffort ? "best-effort" : "throw",
})
const searchDocuments = createTypesenseDocumentSearch(typesenseHost, typesenseKey)
const collectionAdmin = createTypesenseCollectionAdmin(typesenseHost, typesenseKey)

if (bestEffort) {
  console.info("[reindex] best-effort mode — row import failures will be logged, not fatal")
}

// Use the shared registry map so the CLI and the live catalog-bridge
// produce documents from the same composed policy. Without sharing this,
// the bulk path drifts from the live path on every new child-entity
// registry that lands (destinations, taxonomy, …).
const registries = getFieldPolicyRegistries()

const activeSlices = slices.filter(
  (slice) => !requestedVertical || slice.vertical === requestedVertical,
)

const service = createIndexerService({
  adapter: indexer,
  slices: activeSlices,
  registries,
})

interface VerticalConfig {
  vertical: (typeof VERTICALS)[number]
  // Drizzle table — typed loosely so each vertical's slightly different row
  // shape compiles against the same `select all rows + read .id` flow.
  table: PgTable & { id: { name: string } }
  builder: DocumentBuilder
}

function asVerticalTable(table: PgTable): VerticalConfig["table"] {
  return table as VerticalConfig["table"]
}

const VERTICAL_CONFIGS: VerticalConfig[] = [
  {
    vertical: "products",
    table: asVerticalTable(products),
    // Shared with the live catalog-bridge — keeps destination (and any
    // future child-entity) projections wired identically across paths.
    builder: createProductsDocumentBuilder(db, { sellerOperatorId }),
  },
  {
    vertical: "extras",
    table: asVerticalTable(productExtras),
    builder: createExtraDocumentBuilder(db, { sellerOperatorId }),
  },
  {
    vertical: "cruises",
    table: asVerticalTable(cruises),
    builder: createCruisesDocumentBuilder(db, { sellerOperatorId }),
  },
  {
    vertical: "charters",
    table: asVerticalTable(charterProducts),
    builder: createCharterDocumentBuilder(db, { sellerOperatorId }),
  },
  {
    vertical: "accommodations",
    table: asVerticalTable(roomTypes),
    builder: createRoomTypeDocumentBuilder(db, { sellerOperatorId }),
  },
]

console.info(`[reindex] ensuring collections for ${activeSlices.length} slice(s)`)
await service.ensureCollections()

const reindexedVerticals: ReadonlySet<string> = new Set(
  VERTICAL_CONFIGS.filter((cfg) => !requestedVertical || requestedVertical === cfg.vertical).map(
    (cfg) => cfg.vertical,
  ),
)
const existingCollections = await collectionAdmin.list()
const obsoleteCollections = listObsoleteCatalogCollections(activeSlices, existingCollections, {
  verticals: reindexedVerticals,
})
for (const collection of obsoleteCollections) {
  const deleted = await collectionAdmin.delete(collection)
  if (deleted) console.info(`[reindex] deleted obsolete catalog collection ${collection}`)
}

for (const cfg of VERTICAL_CONFIGS) {
  if (requestedVertical && requestedVertical !== cfg.vertical) continue

  const rows = (await db.select().from(cfg.table)) as Array<{ id: string }>
  console.info(`[reindex] ${cfg.vertical}: ${rows.length} rows`)

  const builder: DocumentBuilder = embeddings
    ? async (entityId, slice): Promise<IndexerDocument | null> => {
        const doc = await cfg.builder(entityId, slice)
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
          console.warn(`[reindex] embedding failed for ${slice.vertical}/${entityId}: ${message}`)
          return doc
        }
      }
    : cfg.builder

  let done = 0
  for (const row of rows) {
    await service.reindexEntity(cfg.vertical, row.id, builder)
    done++
    if (done % 25 === 0) console.info(`[reindex] ${cfg.vertical}: ${done}/${rows.length}`)
  }
  const sliceCount = activeSlices.filter((s) => s.vertical === cfg.vertical).length
  console.info(`[reindex] ${cfg.vertical}: done (${done} entities × ${sliceCount} slices)`)

  // Purge stale owned docs whose entity is no longer in Postgres. Without
  // this, every `pnpm seed` cycle (which re-creates products with fresh
  // TypeIDs) leaves the previous generation's docs behind and the catalog
  // UI shows duplicates. Sourced docs are owned by their adapter and are
  // intentionally NOT purged here — the discovery sync handles them.
  const liveIds = new Set(rows.map((r) => r.id))
  for (const slice of activeSlices.filter((s) => s.vertical === cfg.vertical)) {
    const toDelete = await listStaleDocuments(slice, liveIds, searchDocuments)
    if (toDelete.length === 0) continue
    console.info(
      `[reindex] ${cfg.vertical}/${slice.audience}: purging ${toDelete.length} stale owned doc(s)`,
    )
    await indexer.delete(slice, toDelete)
  }
}

console.info("[reindex] complete")
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
  return parts.join(" ")
}
