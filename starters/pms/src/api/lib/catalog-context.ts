/**
 * Per-request catalog context builder shared by the packaged plain-JSON
 * catalog search module and app-local runtime helpers.
 */

import type {
  EmbeddingProvider,
  IndexerAdapter,
  ResolverScope,
  Visibility,
} from "@voyant-travel/catalog"
import { getResolvedExtraById } from "@voyant-travel/inventory/extras"
import { getResolvedProductById } from "@voyant-travel/inventory/service-catalog-plane"
import type { Context } from "hono"

import { buildEmbeddingProvider, buildTypesenseIndexer, DEFAULT_SLICES } from "./catalog-runtime"

export interface OperatorCatalogResolvedEntity {
  vertical: string
  entityId: string
  fields: Record<string, unknown>
  provenance?: Record<string, { locale: string; audience: string; market: string } | null>
}

export interface OperatorCatalogContext {
  actor: Visibility
  tenantId: string
  defaultScope: ResolverScope
  catalog: {
    indexer?: IndexerAdapter
    embeddings?: EmbeddingProvider
    resolveEntity?: (
      vertical: string,
      entityId: string,
      scope: ResolverScope,
    ) => Promise<OperatorCatalogResolvedEntity | null>
  }
}

export function buildCatalogContext(c: Context): OperatorCatalogContext {
  const env = c.env as CloudflareBindings & {
    VOYANT_API_KEY?: string
    VOYANT_CLOUD_API_KEY?: string
    TENANT_ID?: string
    TYPESENSE_HOST?: string
    TYPESENSE_ADMIN_API_KEY?: string
    TYPESENSE_API_KEY?: string
  }
  const db = c.var.db
  const actor = (c.var.actor ?? "staff") as OperatorCatalogContext["actor"]
  const audience: OperatorCatalogContext["defaultScope"]["audience"] =
    actor === "staff" ? "staff" : actor
  // Default locale to the first indexed slice, NOT the browser's
  // `accept-language`. The operator only indexes `DEFAULT_SLICES`
  // (en-GB by default), so a Chrome-on-en-US user would otherwise hit
  // a non-existent `products__en-US__staff__default` collection. Callers
  // can still override via the request body's `locale` field.
  const locale = DEFAULT_SLICES[0]?.locale ?? "en-GB"
  const tenantId = env.TENANT_ID ?? "default"
  const sellerOperatorId = tenantId

  const embeddings = buildEmbeddingProvider(env)
  const indexer = buildTypesenseIndexer(env, embeddings)

  return {
    actor,
    tenantId,
    defaultScope: { locale, audience, market: "default", actor },
    catalog: {
      embeddings,
      indexer,
      async resolveEntity(vertical, entityId): Promise<OperatorCatalogResolvedEntity | null> {
        const ctx = {
          sellerOperatorId,
          scope: { locale, audience, market: "default", actor },
        }
        let view: Awaited<ReturnType<typeof getResolvedProductById>> | null = null
        if (vertical === "products") view = await getResolvedProductById(db, entityId, ctx)
        else if (vertical === "extras") view = await getResolvedExtraById(db, entityId, ctx)
        else return null
        if (!view) return null
        const fields: Record<string, unknown> = {}
        for (const [path, value] of view.values) {
          fields[path] = value
        }
        return { vertical, entityId, fields }
      },
    },
  }
}
