import type { AnyDrizzleDb } from "@voyant-travel/db"

/**
 * The Drizzle client the channel services run against. `c.get("db")` hands the
 * route a `VoyantDb` (the same three-flavor union as `AnyDrizzleDb`). Ledger
 * writes are single `INSERT … ON CONFLICT` statements (idempotent by the dedupe /
 * (channel, reservationId) unique index), atomic on every flavor, so no
 * interactive-transaction-only client is required for the ledger itself. The
 * ingest path (creating a real booking) opens its own transaction via the shared
 * `persistStayBooking` helper.
 */
export type ChannelsDb = AnyDrizzleDb
