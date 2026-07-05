import { collectionName, type IndexerSlice } from "@voyant-travel/catalog"

interface TypesenseCollectionSummary {
  name?: string
}

interface TypesenseSearchHit {
  document?: {
    id?: string
    "source.kind"?: string
  }
}

interface TypesenseSearchPage {
  hits?: TypesenseSearchHit[]
}

export type TypesenseDocumentSearch = (
  collection: string,
  params: URLSearchParams,
) => Promise<TypesenseSearchPage | null>

export interface TypesenseCollectionAdmin {
  list(): Promise<string[]>
  delete(collection: string): Promise<boolean>
}

export class TypesenseDocumentSearchError extends Error {
  constructor(
    readonly collection: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "TypesenseDocumentSearchError"
  }
}

export class TypesenseCollectionAdminError extends Error {
  constructor(
    readonly operation: "list" | "delete",
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "TypesenseCollectionAdminError"
  }
}

export function createTypesenseDocumentSearch(
  typesenseHost: string,
  typesenseApiKey: string,
): TypesenseDocumentSearch {
  return async (collection, params) => {
    const url = new URL(`${typesenseHost}/collections/${collection}/documents/search`)
    for (const [key, value] of params.entries()) url.searchParams.set(key, value)
    const res = await fetch(url, { headers: { "X-TYPESENSE-API-KEY": typesenseApiKey } })
    if (res.status === 404) return null
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new TypesenseDocumentSearchError(
        collection,
        res.status,
        body || `Typesense search failed for ${collection} with HTTP ${res.status}`,
      )
    }
    return (await res.json()) as TypesenseSearchPage
  }
}

export function createTypesenseCollectionAdmin(
  typesenseHost: string,
  typesenseApiKey: string,
): TypesenseCollectionAdmin {
  const headers = { "X-TYPESENSE-API-KEY": typesenseApiKey }
  return {
    async list() {
      const url = new URL(`${typesenseHost}/collections`)
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new TypesenseCollectionAdminError(
          "list",
          res.status,
          body || `Typesense collection list failed with HTTP ${res.status}`,
        )
      }
      const data = (await res.json()) as TypesenseCollectionSummary[]
      return data.map((collection) => collection.name).filter((name): name is string => !!name)
    },
    async delete(collection) {
      const url = new URL(`${typesenseHost}/collections/${collection}`)
      const res = await fetch(url, { method: "DELETE", headers })
      if (res.status === 404) return false
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new TypesenseCollectionAdminError(
          "delete",
          res.status,
          body || `Typesense collection delete failed for ${collection} with HTTP ${res.status}`,
        )
      }
      return true
    },
  }
}

/** First-party source kinds — the only docs the bulk reindex owns and may purge. */
const OWNED_SOURCE_KINDS: ReadonlySet<string> = new Set(["owned", "direct"])

export async function listStaleDocuments(
  slice: IndexerSlice,
  liveIds: ReadonlySet<string>,
  search: TypesenseDocumentSearch,
): Promise<string[]> {
  const staleIds: string[] = []
  const collection = collectionName(slice)
  const perPage = 250
  let page = 1
  // We only ever want to purge FIRST-PARTY (owned) docs — sourced docs are
  // owned by their adapter and refreshed by discovery sync, never here. Owned
  // catalog docs carry `source.kind` in {owned, direct}; sourced docs carry an
  // adapter kind. We enumerate every doc, read `source.kind` when the schema
  // indexes it, and purge a doc when its id is no longer live AND it is owned
  // (or the collection has no `source.kind` field at all — those collections
  // only ever hold owned docs). Filtering by `source.kind:=owned` server-side
  // was wrong: owned accommodation docs use `source.kind:"direct"`, so the old
  // filter matched nothing and stale docs leaked on every re-seed.
  let includeSourceKind = true

  while (true) {
    const params = new URLSearchParams({
      q: "*",
      query_by: "name",
      include_fields: includeSourceKind ? "id,source.kind" : "id",
      per_page: String(perPage),
      page: String(page),
    })
    let data: TypesenseSearchPage | null
    try {
      data = await search(collection, params)
    } catch (err) {
      if (
        err instanceof TypesenseDocumentSearchError &&
        err.status === 400 &&
        err.message.includes("source.kind") &&
        includeSourceKind
      ) {
        // Collection schema doesn't index `source.kind` — retry with id only.
        includeSourceKind = false
        continue
      }
      throw err
    }
    if (!data) break

    const hits = data.hits ?? []
    for (const hit of hits) {
      const id = hit.document?.id
      if (!id || liveIds.has(id)) continue
      const sourceKind = hit.document?.["source.kind"]
      if (sourceKind === undefined || OWNED_SOURCE_KINDS.has(sourceKind)) staleIds.push(id)
    }
    if (hits.length < perPage) break
    page += 1
  }

  return staleIds
}

export function listObsoleteCatalogCollections(
  activeSlices: ReadonlyArray<IndexerSlice>,
  collectionNames: ReadonlyArray<string>,
  options: {
    verticals: ReadonlySet<string>
    audiences?: ReadonlySet<IndexerSlice["audience"]>
  },
): string[] {
  const activeCollections = new Set(activeSlices.map((slice) => collectionName(slice)))
  const audiences = options.audiences ?? new Set<IndexerSlice["audience"]>(["staff", "customer"])
  const obsolete: string[] = []

  for (const name of collectionNames) {
    if (activeCollections.has(name)) continue
    const slice = parseCatalogCollectionName(name)
    if (!slice) continue
    if (!options.verticals.has(slice.vertical)) continue
    if (!audiences.has(slice.audience)) continue
    obsolete.push(name)
  }

  return obsolete.sort()
}

function parseCatalogCollectionName(name: string): IndexerSlice | null {
  const [vertical, locale, audience, market, ...rest] = name.split("__")
  if (!vertical || !locale || !audience || !market || rest.length > 0) return null
  if (!isIndexerAudience(audience)) return null
  return { vertical, locale, audience, market }
}

function isIndexerAudience(value: string): value is IndexerSlice["audience"] {
  return value === "staff" || value === "customer" || value === "partner" || value === "supplier"
}
