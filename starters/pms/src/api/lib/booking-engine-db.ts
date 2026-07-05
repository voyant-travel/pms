import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export function asPostgresDb(db: unknown): PostgresJsDatabase {
  return db as never
}
