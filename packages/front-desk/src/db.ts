import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the front-desk services run against. `c.get("db")` hands the
 * route a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`). Ops flips
 * are single-statement upserts, atomic on every flavor.
 */
export type FrontDeskDb = AnyDrizzleDb
