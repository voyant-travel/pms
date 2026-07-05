import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the ARI services run against. `c.get("db")` hands the route
 * a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`); the bulk-upsert
 * endpoints rely on single-statement `INSERT … ON CONFLICT`, which is atomic on
 * every flavor, so no interactive-transaction-only client is required.
 */
export type AriDb = AnyDrizzleDb
