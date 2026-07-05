/**
 * Adapts the official `typesense` Node SDK client to the catalog package's
 * minimal `TypesenseClient` interface.
 *
 * The one behavioral wrinkle this smooths over: the SDK's `documents().import()`
 * THROWS an `ImportError` when any row fails (for array input) instead of
 * returning the per-row results. That would short-circuit the catalog
 * indexer's own import-failure policy (`importFailureMode`), making
 * `--best-effort` impossible and producing a less informative error than the
 * adapter's summary. We catch that error and return its `importResults` array
 * so the adapter stays the single decision point for how to treat row failures
 * — matching the fetch-based client used in the worker, which also returns the
 * raw results rather than throwing.
 */

import type { TypesenseClient } from "@voyant-travel/catalog"
import type { Client as TypesenseSdkClient } from "typesense"

/** The SDK's ImportError carries the parsed per-row results here. */
function importResultsFromError(err: unknown): unknown[] | undefined {
  if (err && typeof err === "object" && "importResults" in err) {
    const results = (err as { importResults?: unknown }).importResults
    if (Array.isArray(results)) return results
  }
  return undefined
}

export function asTypesenseClient(client: TypesenseSdkClient): TypesenseClient {
  const sdk = client as { collections(name?: string): unknown }
  return {
    collections(name?: string) {
      // Delegate explicitly (rather than spreading) so the SDK's prototype
      // methods keep their `this` binding.
      const collection = sdk.collections(name) as ReturnType<TypesenseClient["collections"]>
      return {
        create: (schema) => collection.create(schema),
        update: (schema) => collection.update(schema),
        delete: () => collection.delete(),
        retrieve: () => collection.retrieve(),
        documents() {
          const documents = collection.documents()
          return {
            import: async (docs, options) => {
              try {
                return await documents.import(docs, options)
              } catch (err) {
                const results = importResultsFromError(err)
                if (results) return results
                throw err
              }
            },
            delete: (query) => documents.delete(query),
            search: (query) => documents.search(query),
          }
        },
      }
    },
  }
}
