import { referenceAirports } from "@voyant-travel/flights/reference/local-postgres"

import { EUROPE_AIRPORTS } from "./seed-flights-reference-airports-europe"
import { GLOBAL_AIRPORTS } from "./seed-flights-reference-airports-global"
import type { Db } from "./seed-flights-reference-types"

/**
 * Seed 60 major hub airports across Europe, North America, Asia / Middle East,
 * Africa, South America, and Oceania.
 */
export async function seedAirports(db: Db): Promise<number> {
  const rows = [...EUROPE_AIRPORTS, ...GLOBAL_AIRPORTS]
  await db.insert(referenceAirports).values(rows).onConflictDoNothing()
  return rows.length
}
