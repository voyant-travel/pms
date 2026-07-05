import type { referenceAirports } from "@voyant-travel/flights/reference/local-postgres"
import type { drizzle } from "drizzle-orm/postgres-js"

export type Db = ReturnType<typeof drizzle>
export type AirportSeedRow = typeof referenceAirports.$inferInsert
