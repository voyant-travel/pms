import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the units services run against. `c.get("db")` hands the
 * route a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`). The
 * derivation recompute writes as a single `INSERT … ON CONFLICT`, atomic on
 * every flavor, so no interactive-transaction-only client is required.
 */
export type UnitsDb = AnyDrizzleDb
