/**
 * Shared catalog-plane runtime helpers.
 *
 * Centralizes the env-driven construction of the Typesense indexer + the
 * default slice set so both the per-request MCP route handler and the
 * background catalog-bridge subscribers stay aligned.
 */

import { accommodationCatalogPolicy } from "@voyant-travel/accommodations/catalog-policy"
import {
  createFieldPolicyRegistry,
  createGeminiEmbeddingProvider,
  createTypesenseIndexer,
  type DocumentBuilder,
  type EmbeddingProvider,
  type FieldPolicyRegistry,
  type IndexerAdapter,
  type IndexerDocument,
  type IndexerSlice,
  type TypesenseClient,
  type TypesenseCollectionSchema,
  type TypesenseSearchQuery,
  type TypesenseSearchResponse,
} from "@voyant-travel/catalog"
import { charterCatalogPolicy } from "@voyant-travel/charters/catalog-policy"
import {
  createProductPricingProjectionExtension,
  createProductPromotionsProjectionExtension,
  loadProductPriceFrom,
  marketLocales,
  markets,
} from "@voyant-travel/commerce"
import { cruiseCabinFacetsCatalogPolicy } from "@voyant-travel/cruises/catalog-policy-cabins"
import {
  createCruiseDocumentBuilder,
  createCruisesRegistry,
} from "@voyant-travel/cruises/service-catalog-plane"
import { createCruiseCabinFacetProjectionExtension } from "@voyant-travel/cruises/service-catalog-plane-cabins"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { channelProductMappings, channels } from "@voyant-travel/distribution"
import { productCatalogPolicy } from "@voyant-travel/inventory/catalog-policy"
import { productDeparturesCatalogPolicy } from "@voyant-travel/inventory/catalog-policy-departures"
import { productDestinationsCatalogPolicy } from "@voyant-travel/inventory/catalog-policy-destinations"
import { productPricingCatalogPolicy } from "@voyant-travel/inventory/catalog-policy-pricing"
import { productPromotionsCatalogPolicy } from "@voyant-travel/inventory/catalog-policy-promotions"
import { productTaxonomyCatalogPolicy } from "@voyant-travel/inventory/catalog-policy-taxonomy"
import { extrasCatalogPolicy } from "@voyant-travel/inventory/extras"
import {
  createProductDocumentBuilder,
  createProductStorefrontCardProjectionExtension,
} from "@voyant-travel/inventory/service-catalog-plane"
import { createProductDestinationsProjectionExtension } from "@voyant-travel/inventory/service-catalog-plane-destinations"
import { createProductTaxonomyProjectionExtension } from "@voyant-travel/inventory/service-catalog-plane-taxonomy"
import { createProductDeparturesProjectionExtension } from "@voyant-travel/operations"
import { and, asc, eq } from "drizzle-orm"

export const CATALOG_VERTICALS = [
  "products",
  "extras",
  "cruises",
  "charters",
  "accommodations",
] as const

const INDEXED_AUDIENCES = ["staff", "customer"] as const

/**
 * The slice set the operator starter indexes by default — staff (admin
 * search) + customer (storefront browse) on en-GB and the `default` market.
 * Kept in one place so the bulk-reindex CLI, the live-reindex bridge, and
 * the MCP routes never drift on which collections exist.
 */
export const DEFAULT_SLICES: ReadonlyArray<IndexerSlice> = [
  { vertical: "products", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "products", locale: "en-GB", audience: "customer", market: "default" },
  { vertical: "extras", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "extras", locale: "en-GB", audience: "customer", market: "default" },
  { vertical: "cruises", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "cruises", locale: "en-GB", audience: "customer", market: "default" },
  { vertical: "charters", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "charters", locale: "en-GB", audience: "customer", market: "default" },
  { vertical: "accommodations", locale: "en-GB", audience: "staff", market: "default" },
  { vertical: "accommodations", locale: "en-GB", audience: "customer", market: "default" },
]

export async function loadCatalogSlices(db: AnyDrizzleDb): Promise<IndexerSlice[]> {
  const [marketRows, localeRows] = await Promise.all([
    db
      .select({
        id: markets.id,
        defaultLanguageTag: markets.defaultLanguageTag,
      })
      .from(markets)
      .where(eq(markets.status, "active"))
      .orderBy(asc(markets.code)),
    db
      .select({
        marketId: marketLocales.marketId,
        languageTag: marketLocales.languageTag,
      })
      .from(marketLocales)
      .where(eq(marketLocales.active, true))
      .orderBy(asc(marketLocales.sortOrder), asc(marketLocales.languageTag)),
  ])

  const localesByMarket = new Map<string, Set<string>>()
  for (const market of marketRows) {
    localesByMarket.set(market.id, new Set([market.defaultLanguageTag]))
  }
  for (const locale of localeRows) {
    localesByMarket.get(locale.marketId)?.add(locale.languageTag)
  }

  const marketSlices = marketRows.flatMap((market) => {
    const locales = localesByMarket.get(market.id) ?? new Set([market.defaultLanguageTag])
    return CATALOG_VERTICALS.flatMap((vertical) =>
      Array.from(locales).flatMap((locale) =>
        INDEXED_AUDIENCES.map((audience) => ({
          vertical,
          locale,
          audience,
          market: market.id,
        })),
      ),
    )
  })

  return uniqueSlices([...DEFAULT_SLICES, ...marketSlices])
}

function uniqueSlices(slices: ReadonlyArray<IndexerSlice>): IndexerSlice[] {
  const seen = new Set<string>()
  const out: IndexerSlice[] = []
  for (const slice of slices) {
    const key = `${slice.vertical}|${slice.locale}|${slice.audience}|${slice.market}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(slice)
  }
  return out
}

/**
 * Just the env keys this module reads. Callers may pass any superset
 * (e.g. the full `CloudflareBindings`); structural assignment ignores
 * extra properties.
 */
export type CatalogRuntimeEnv = {
  TYPESENSE_HOST?: string
  TYPESENSE_ADMIN_API_KEY?: string
  TYPESENSE_API_KEY?: string
  VOYANT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CLOUD_API_URL?: string
}

/**
 * Construct the embedding provider from env, or return `undefined` when no
 * Voyant Cloud key is configured. Used both for query-time embedding
 * (semantic search) and write-time embedding (attaching `text_embedding`
 * to indexer docs).
 *
 * Default: Gemini via the Voyant Cloud AI gateway (`/ai/v1/gemini`). The
 * gateway forwards to Google's embeddings API with the org's saved
 * provider key, so the template only needs the Voyant Cloud token. Usage
 * tracking + token-level rate limits are handled by the gateway.
 *
 * Swap by editing this function:
 *  - Direct Google: pass `auth: "google"` + the raw Gemini key.
 *  - OpenAI: import `createOpenAIEmbeddingProvider` and read
 *    `OPENAI_API_KEY` instead.
 *  - Custom provider: return anything matching `EmbeddingProvider`
 *    from `@voyant-travel/catalog`.
 *
 * Switching providers (or models) is a deliberate `bulkReindex` operation —
 * the catalog plane scopes vector queries to documents matching the active
 * `embedding_model_id`, so mid-migration mixes are handled cleanly.
 */
export function buildEmbeddingProvider(env: CatalogRuntimeEnv): EmbeddingProvider | undefined {
  const apiKey = env.VOYANT_API_KEY ?? env.VOYANT_CLOUD_API_KEY
  if (!apiKey) return undefined
  const cloudBase = (env.VOYANT_CLOUD_API_URL ?? "https://api.voyant.travel").replace(/\/$/, "")
  return createGeminiEmbeddingProvider({
    apiKey,
    auth: "bearer",
    baseUrl: `${cloudBase}/ai/v1/gemini`,
  })
}

/**
 * Construct the Typesense `IndexerAdapter` from env, or return `undefined`
 * when Typesense isn't configured. When an `EmbeddingProvider` is supplied,
 * the indexer's collection schema declares a `text_embedding` vector field
 * sized to the provider's dimensions, unlocking semantic + hybrid search.
 */
export function buildTypesenseIndexer(
  env: CatalogRuntimeEnv,
  embeddings?: EmbeddingProvider,
): IndexerAdapter | undefined {
  const host = env.TYPESENSE_HOST
  const apiKey = env.TYPESENSE_ADMIN_API_KEY ?? env.TYPESENSE_API_KEY
  if (!host || !apiKey) return undefined

  try {
    new URL(host)
  } catch {
    return undefined
  }

  const client = createTypesenseFetchClient(host, apiKey)

  return createTypesenseIndexer({
    client,
    vectorDimensions: embeddings?.capabilities.dimensions,
    // Seed the real per-vertical registries so worker-side search (which never
    // runs ensureCollection) sorts/filters on numeric fields like
    // `priceFromAmountCents` instead of falling back to the string-only
    // inferred registry.
    registries: getFieldPolicyRegistries(),
  })
}

/**
 * Minimal fetch-based Typesense client. Used in place of the official
 * `typesense` SDK because that SDK pulls in `axios` + `node:https`, which
 * crashes the worker mid-request inside Cloudflare workerd (Miniflare),
 * surfacing as a generic `fetch failed` at the dispatch level.
 *
 * Implements only the subset the catalog `IndexerAdapter` exercises —
 * see `TypesenseClient` interface in `@voyant-travel/catalog`. Errors throw
 * with the response status + body so failures bubble up cleanly.
 */
function createTypesenseFetchClient(host: string, apiKey: string): TypesenseClient {
  const baseUrl = host.replace(/\/$/, "")
  const baseHeaders = { "X-TYPESENSE-API-KEY": apiKey }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set("X-TYPESENSE-API-KEY", apiKey)
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Typesense ${init.method ?? "GET"} ${path} ${res.status}: ${text}`)
    }
    return res
  }

  function buildSearchUrl(name: string, query: TypesenseSearchQuery): string {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue
      params.set(k, String(v))
    }
    return `/collections/${encodeURIComponent(name)}/documents/search?${params.toString()}`
  }

  return {
    collections(name?: string) {
      return {
        async create(schema: TypesenseCollectionSchema): Promise<void> {
          await request("/collections", { method: "POST", body: JSON.stringify(schema) })
        },
        async update(schema: Partial<TypesenseCollectionSchema>): Promise<void> {
          if (!name) throw new Error("update requires a collection name")
          await request(`/collections/${encodeURIComponent(name)}`, {
            method: "PATCH",
            body: JSON.stringify(schema),
          })
        },
        async delete(): Promise<void> {
          if (!name) throw new Error("delete requires a collection name")
          await request(`/collections/${encodeURIComponent(name)}`, { method: "DELETE" })
        },
        async retrieve(): Promise<TypesenseCollectionSchema> {
          if (!name) throw new Error("retrieve requires a collection name")
          const res = await request(`/collections/${encodeURIComponent(name)}`, { method: "GET" })
          return (await res.json()) as TypesenseCollectionSchema
        },
        documents() {
          if (!name) throw new Error("documents() requires a collection name")
          return {
            // Defined as an arrow-assigned property rather than a method named
            // `import` so Vite/rolldown's import-analysis doesn't mistake the
            // `import(` token for a dynamic import expression (which corrupts
            // the parse). The public API shape (`documents().import(...)`) is
            // unchanged.
            import: async (
              documents: unknown[],
              options?: { action?: "upsert" | "create" },
            ): Promise<unknown> => {
              const action = options?.action ?? "create"
              const ndjson = documents.map((d) => JSON.stringify(d)).join("\n")
              const res = await fetch(
                `${baseUrl}/collections/${encodeURIComponent(name)}/documents/import?action=${action}`,
                {
                  method: "POST",
                  headers: { ...baseHeaders, "Content-Type": "text/plain" },
                  body: ndjson,
                },
              )
              if (!res.ok) {
                const text = await res.text().catch(() => "")
                throw new Error(`Typesense import ${name} ${res.status}: ${text}`)
              }
              return res.text()
            },
            async delete(query: { filter_by: string }): Promise<unknown> {
              const params = new URLSearchParams({ filter_by: query.filter_by })
              const res = await request(
                `/collections/${encodeURIComponent(name)}/documents?${params.toString()}`,
                { method: "DELETE" },
              )
              return res.json()
            },
            async search(query: TypesenseSearchQuery): Promise<TypesenseSearchResponse> {
              const res = await request(buildSearchUrl(name, query), { method: "GET" })
              return (await res.json()) as TypesenseSearchResponse
            },
          }
        },
      }
    },
  }
}

/**
 * Singleton-per-process registry map. Built lazily; safe across requests
 * because field policies are static.
 */
let _registries: Map<string, FieldPolicyRegistry> | undefined
export function getFieldPolicyRegistries(): Map<string, FieldPolicyRegistry> {
  if (!_registries) {
    _registries = new Map<string, FieldPolicyRegistry>([
      [
        "products",
        createFieldPolicyRegistry([
          ...productCatalogPolicy,
          ...productDestinationsCatalogPolicy,
          ...productTaxonomyCatalogPolicy,
          ...productDeparturesCatalogPolicy,
          ...productPricingCatalogPolicy,
          ...productPromotionsCatalogPolicy,
        ]),
      ],
      ["extras", createFieldPolicyRegistry(extrasCatalogPolicy)],
      ["cruises", createCruisesRegistry(cruiseCabinFacetsCatalogPolicy)],
      ["charters", createFieldPolicyRegistry(charterCatalogPolicy)],
      ["accommodations", createFieldPolicyRegistry(accommodationCatalogPolicy)],
    ])
  }
  return _registries
}

async function hasActiveSalesChannelMapping(db: AnyDrizzleDb, productId: string): Promise<boolean> {
  const rows = await db
    .select({ id: channelProductMappings.id })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channels.id, channelProductMappings.channelId))
    .where(
      and(
        eq(channelProductMappings.productId, productId),
        eq(channelProductMappings.active, true),
        eq(channels.status, "active"),
      ),
    )
    .limit(1)

  return rows.length > 0
}

/**
 * Build the products `DocumentBuilder` with all child-entity projection
 * extensions wired in. Single source of truth for both the live catalog
 * bridge (event-driven reindex) and the bulk reindex CLI — without this,
 * the two paths drift and bulk reindex produces docs missing the
 * denormalized child-entity fields.
 *
 * Resolves the products registry from `getFieldPolicyRegistries()` so the
 * builder honors the same composed policy the indexer service sees.
 */
export function createProductsDocumentBuilder(
  db: AnyDrizzleDb,
  context: { sellerOperatorId: string },
): DocumentBuilder {
  const registry = getFieldPolicyRegistries().get("products")
  return createProductDocumentBuilder(db, {
    sellerOperatorId: context.sellerOperatorId,
    registry,
    extensions: [
      createProductStorefrontCardProjectionExtension(),
      createProductDestinationsProjectionExtension(),
      createProductTaxonomyProjectionExtension(),
      createProductDeparturesProjectionExtension(),
      createProductPricingProjectionExtension(),
      createProductPromotionsProjectionExtension({ loadOriginalPrice: loadProductPriceFrom }),
    ],
    isPublicAudienceListable: ({ db, product }) => hasActiveSalesChannelMapping(db, product.id),
  })
}

/**
 * Build the cruises `DocumentBuilder` with cabin/deck facets wired in.
 * The registry and projection extension are paired: the registry admits
 * the denormalized cabin/deck fields, and the extension supplies them.
 */
export function createCruisesDocumentBuilder(
  db: AnyDrizzleDb,
  context: { sellerOperatorId: string },
): DocumentBuilder {
  const registry = getFieldPolicyRegistries().get("cruises")
  return createCruiseDocumentBuilder(db, {
    sellerOperatorId: context.sellerOperatorId,
    registry,
    extensions: [createCruiseCabinFacetProjectionExtension()],
  })
}

/**
 * Wraps a `DocumentBuilder` so that every emitted document carries a
 * `text_embedding` vector computed from the document's merchandisable
 * fields. No-op if `embeddings` is undefined — the inner builder runs
 * unchanged. Embedding errors are caught and logged so a transient OpenAI
 * outage doesn't poison the reindex pipeline.
 */
export function withEmbedding(
  inner: DocumentBuilder,
  embeddings: EmbeddingProvider | undefined,
): DocumentBuilder {
  if (!embeddings) return inner
  return async (entityId, slice): Promise<IndexerDocument | null> => {
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
      console.warn(`[catalog] embedding failed for ${slice.vertical}/${entityId}: ${message}`)
      return doc
    }
  }
}

function composeMerchandisableText(doc: IndexerDocument): string {
  // Concatenate the well-known merchandisable fields that ship with the
  // products policy. Order matters: name first (highest signal), then
  // description, then tags. Other verticals copy this when they adopt.
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
