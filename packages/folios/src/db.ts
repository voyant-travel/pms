import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the folio services run against. `c.get("db")` hands the
 * route a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`). Posting
 * writes are single `INSERT … ON CONFLICT` statements (idempotent by
 * `source_key`), atomic on every flavor, so no interactive-transaction-only
 * client is required. Settlement calls the finance service with this same handle.
 */
export type FoliosDb = AnyDrizzleDb
