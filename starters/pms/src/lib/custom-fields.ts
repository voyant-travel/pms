import {
  type CustomFieldDefinition,
  type CustomFieldRegistry,
  createCustomFieldRegistry,
} from "@voyant-travel/core/custom-fields"
import { loadCustomFieldDefinitions } from "@voyant-travel/custom-fields"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

type CustomFieldModule = {
  default?: CustomFieldDefinition | CustomFieldDefinition[]
  fields?: CustomFieldDefinition | CustomFieldDefinition[]
}

function flattenCustomFieldDefinitions(value: unknown): CustomFieldDefinition[] {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(flattenCustomFieldDefinitions)
  return [value as CustomFieldDefinition]
}

function customFieldsFromGlob(modules: Record<string, CustomFieldModule>): CustomFieldDefinition[] {
  return Object.values(modules).flatMap((module) =>
    flattenCustomFieldDefinitions(module.default ?? module.fields),
  )
}

function mergeCustomFieldDefinitions(
  sources: readonly (readonly CustomFieldDefinition[])[],
): CustomFieldDefinition[] {
  const merged = new Map<string, CustomFieldDefinition>()
  for (const source of sources) {
    for (const field of source) {
      const id = `${field.entity}.${field.namespace}.${field.key}`
      if (!merged.has(id)) merged.set(id, field)
    }
  }
  return [...merged.values()]
}

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
