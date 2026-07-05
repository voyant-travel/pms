import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the housekeeping services run against. `c.get("db")` hands
 * the route a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`). Task
 * generation and status upserts are single `INSERT … ON CONFLICT` statements,
 * atomic on every flavor, so no interactive-transaction-only client is required.
 */
export type HousekeepingDb = AnyDrizzleDb
