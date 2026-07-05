import {
  type CustomFieldRegistry,
  createCustomFieldRegistry,
  customFieldsFromGlob,
  mergeCustomFieldDefinitions,
} from "@voyant-travel/core/custom-fields"
import { loadCustomFieldDefinitions } from "@voyant-travel/relationships/custom-fields-registry"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/**
 * Code-declared custom fields, discovered from `src/custom-fields/*.ts` at build
 * time (Vite compiles `import.meta.glob` to static imports — Workers-safe).
 */
const codeFields = customFieldsFromGlob(import.meta.glob("../custom-fields/*.ts", { eager: true }))

// The unified registry merges code-declared fields with the runtime
// `custom_field_definitions` (admin-created) — so it is resolved per request
// from the DB. Definitions change rarely; cache the merged registry per isolate
// with a short TTL to keep the booking write path off a query every time.
const CACHE_TTL_MS = 10_000
let cache: { at: number; registry: CustomFieldRegistry } | null = null

/**
 * Resolve the deployment's custom-field registry: code-declared ∪ runtime
 * `custom_field_definitions` (code wins on a `(entity, key)` collision). The
 * `customFields` provider the framework injects into entity write paths. See
 * docs/architecture/custom-fields-unification-adr.md.
 */
export async function resolveOperatorCustomFields(db: unknown): Promise<CustomFieldRegistry> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.registry
  }
  const dbFields = await loadCustomFieldDefinitions(db as PostgresJsDatabase)
  const registry = createCustomFieldRegistry(mergeCustomFieldDefinitions([codeFields, dbFields]))
  cache = { at: now, registry }
  return registry
}
