/**
 * Rates & availability calendar service: the read grid plus the two bulk
 * upserts over the upstream `rate_plan_daily_rates` and
 * `room_type_daily_inventory` tables.
 *
 * Bulk writes are **atomic + idempotent** by construction: each operation's
 * `from..to` range (optionally weekday-masked) is expanded to concrete dates
 * (pure — see `date-mask.ts`), the rows are deduplicated on their natural key
 * (last write wins within a request), and the whole set is written as a single
 * `INSERT … ON CONFLICT (<natural key>) DO UPDATE SET … = excluded.…` statement.
 * A single ON CONFLICT statement is atomic in Postgres and re-running the same
 * payload converges to the same rows, so the endpoints are safely retryable.
 *
 * Natural keys (upstream unique indexes):
 *   - rate_plan_daily_rates    → (rate_plan_id, room_type_id, date)
 *   - room_type_daily_inventory→ (room_type_id, date)
 */

import {
  ratePlanDailyRates,
  ratePlanRoomTypes,
  ratePlans,
  roomTypeDailyInventory,
  roomTypes,
} from "@voyant-travel/accommodations/schema"
import { RequestValidationError } from "@voyant-travel/hono"
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { expandDates } from "./date-mask.js"
import type { AriDb } from "./db.js"
import type { BulkInventoryOperation, BulkRateOperation, CalendarQuery } from "./validation.js"

type RateRow = typeof ratePlanDailyRates.$inferInsert
type InventoryRow = typeof roomTypeDailyInventory.$inferInsert

/** Wrap a pure range-expansion failure as a clean 400 for the caller. */
function expand(from: string, to: string, weekdays?: readonly number[]): string[] {
  try {
    return expandDates(from, to, weekdays)
  } catch (err) {
    throw new RequestValidationError(err instanceof Error ? err.message : "invalid date range")
  }
}

/**
 * Expand + dedupe rate operations into upsert rows keyed by
 * (ratePlanId, roomTypeId, date). Pure — unit-tested without a db. Postgres
 * rejects a statement that touches the same conflict target twice, so dedupe
 * (last-write-wins) is required, not just an optimization.
 */
export function buildRateRows(operations: readonly BulkRateOperation[]): RateRow[] {
  const byKey = new Map<string, RateRow>()
  for (const op of operations) {
    for (const date of expand(op.from, op.to, op.weekdays)) {
      byKey.set(`${op.ratePlanId}|${op.roomTypeId}|${date}`, {
        ratePlanId: op.ratePlanId,
        roomTypeId: op.roomTypeId,
        date,
        sellCurrency: op.sellCurrency,
        sellAmountCents: op.sellAmountCents,
        costCurrency: op.costCurrency ?? null,
        costAmountCents: op.costAmountCents ?? null,
        taxAmountCents: op.taxAmountCents ?? null,
        feeAmountCents: op.feeAmountCents ?? null,
        occupancyBasis: op.occupancyBasis ?? "room",
        includedAdults: op.includedAdults ?? 2,
        includedChildren: op.includedChildren ?? 0,
        includedInfants: op.includedInfants ?? 0,
        metadata: op.metadata ?? null,
      })
    }
  }
  return [...byKey.values()]
}

/** Expand + dedupe inventory operations into upsert rows keyed by (roomTypeId, date). Pure. */
export function buildInventoryRows(operations: readonly BulkInventoryOperation[]): InventoryRow[] {
  const byKey = new Map<string, InventoryRow>()
  for (const op of operations) {
    for (const date of expand(op.from, op.to, op.weekdays)) {
      byKey.set(`${op.roomTypeId}|${date}`, {
        roomTypeId: op.roomTypeId,
        date,
        capacity: op.capacity,
        closed: op.closed ?? false,
        metadata: op.metadata ?? null,
      })
    }
  }
  return [...byKey.values()]
}

async function assertIdsExist(
  db: AriDb,
  table: typeof ratePlans | typeof roomTypes,
  ids: readonly string[],
  label: string,
): Promise<void> {
  if (ids.length === 0) return
  const found = await db
    .select({ id: table.id })
    .from(table)
    .where(inArray(table.id, [...ids]))
  const present = new Set(found.map((r) => r.id))
  const missing = ids.filter((id) => !present.has(id))
  if (missing.length > 0) {
    throw new RequestValidationError(`unknown ${label}: ${[...new Set(missing)].join(", ")}`)
  }
}

export async function bulkUpsertRates(
  db: AriDb,
  operations: readonly BulkRateOperation[],
): Promise<{ upserted: number }> {
  const rows = buildRateRows(operations)
  if (rows.length === 0) return { upserted: 0 }
  await assertIdsExist(db, ratePlans, [...new Set(rows.map((r) => r.ratePlanId))], "rate plan")
  await assertIdsExist(db, roomTypes, [...new Set(rows.map((r) => r.roomTypeId))], "room type")

  await db
    .insert(ratePlanDailyRates)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        ratePlanDailyRates.ratePlanId,
        ratePlanDailyRates.roomTypeId,
        ratePlanDailyRates.date,
      ],
      set: {
        sellCurrency: sql`excluded.sell_currency`,
        sellAmountCents: sql`excluded.sell_amount_cents`,
        costCurrency: sql`excluded.cost_currency`,
        costAmountCents: sql`excluded.cost_amount_cents`,
        taxAmountCents: sql`excluded.tax_amount_cents`,
        feeAmountCents: sql`excluded.fee_amount_cents`,
        occupancyBasis: sql`excluded.occupancy_basis`,
        includedAdults: sql`excluded.included_adults`,
        includedChildren: sql`excluded.included_children`,
        includedInfants: sql`excluded.included_infants`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    })
  return { upserted: rows.length }
}

export async function bulkUpsertInventory(
  db: AriDb,
  operations: readonly BulkInventoryOperation[],
): Promise<{ upserted: number }> {
  const rows = buildInventoryRows(operations)
  if (rows.length === 0) return { upserted: 0 }
  await assertIdsExist(db, roomTypes, [...new Set(rows.map((r) => r.roomTypeId))], "room type")

  await db
    .insert(roomTypeDailyInventory)
    .values(rows)
    .onConflictDoUpdate({
      target: [roomTypeDailyInventory.roomTypeId, roomTypeDailyInventory.date],
      set: {
        capacity: sql`excluded.capacity`,
        closed: sql`excluded.closed`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    })
  return { upserted: rows.length }
}

// --- read grid ---------------------------------------------------------------

export interface CalendarRoomType {
  id: string
  code: string | null
  name: string
  inventoryMode: string
  ratePlanIds: string[]
}
export interface CalendarRatePlan {
  id: string
  code: string
  name: string
  currencyCode: string
}
export interface CalendarInventoryCell {
  roomTypeId: string
  date: string
  capacity: number
  closed: boolean
}
export interface CalendarRateCell {
  ratePlanId: string
  roomTypeId: string
  date: string
  sellCurrency: string
  sellAmountCents: number
  costCurrency: string | null
  costAmountCents: number | null
  taxAmountCents: number | null
  feeAmountCents: number | null
  occupancyBasis: string
  includedAdults: number
  includedChildren: number
  includedInfants: number
}
export interface CalendarGrid {
  propertyId: string
  from: string
  to: string
  roomTypes: CalendarRoomType[]
  ratePlans: CalendarRatePlan[]
  inventory: CalendarInventoryCell[]
  rates: CalendarRateCell[]
}

export interface AssembleCalendarInput {
  propertyId: string
  from: string
  to: string
  roomTypeRows: (typeof roomTypes.$inferSelect)[]
  ratePlanRows: (typeof ratePlans.$inferSelect)[]
  joinRows: (typeof ratePlanRoomTypes.$inferSelect)[]
  inventoryRows: (typeof roomTypeDailyInventory.$inferSelect)[]
  rateRows: (typeof ratePlanDailyRates.$inferSelect)[]
}

/**
 * Assemble the calendar grid from already-loaded rows. Pure — the join-mapping
 * (room type → its attached rate plans) and wire projection are unit-tested
 * without a db. Only active joins contribute a rate-plan association.
 */
export function assembleCalendar(input: AssembleCalendarInput): CalendarGrid {
  const ratePlanIdsByRoomType = new Map<string, string[]>()
  for (const join of input.joinRows) {
    if (join.active === false) continue
    const list = ratePlanIdsByRoomType.get(join.roomTypeId) ?? []
    list.push(join.ratePlanId)
    ratePlanIdsByRoomType.set(join.roomTypeId, list)
  }

  return {
    propertyId: input.propertyId,
    from: input.from,
    to: input.to,
    roomTypes: input.roomTypeRows.map((rt) => ({
      id: rt.id,
      code: rt.code,
      name: rt.name,
      inventoryMode: rt.inventoryMode,
      ratePlanIds: ratePlanIdsByRoomType.get(rt.id) ?? [],
    })),
    ratePlans: input.ratePlanRows.map((rp) => ({
      id: rp.id,
      code: rp.code,
      name: rp.name,
      currencyCode: rp.currencyCode,
    })),
    inventory: input.inventoryRows.map((inv) => ({
      roomTypeId: inv.roomTypeId,
      date: inv.date,
      capacity: inv.capacity,
      closed: inv.closed,
    })),
    rates: input.rateRows.map((r) => ({
      ratePlanId: r.ratePlanId,
      roomTypeId: r.roomTypeId,
      date: r.date,
      sellCurrency: r.sellCurrency,
      sellAmountCents: r.sellAmountCents,
      costCurrency: r.costCurrency,
      costAmountCents: r.costAmountCents,
      taxAmountCents: r.taxAmountCents,
      feeAmountCents: r.feeAmountCents,
      occupancyBasis: r.occupancyBasis,
      includedAdults: r.includedAdults,
      includedChildren: r.includedChildren,
      includedInfants: r.includedInfants,
    })),
  }
}

export async function getCalendar(db: AriDb, query: CalendarQuery): Promise<CalendarGrid> {
  // Validate ordering + size (throws a clean 400 on an inverted/oversized range).
  expand(query.from, query.to)

  const roomTypeRows = await db
    .select()
    .from(roomTypes)
    .where(eq(roomTypes.propertyId, query.propertyId))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.name))
  const ratePlanRows = await db
    .select()
    .from(ratePlans)
    .where(eq(ratePlans.propertyId, query.propertyId))
    .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name))

  const roomTypeIds = roomTypeRows.map((r) => r.id)
  const ratePlanIds = ratePlanRows.map((r) => r.id)

  const [joinRows, inventoryRows, rateRows] = await Promise.all([
    ratePlanIds.length
      ? db
          .select()
          .from(ratePlanRoomTypes)
          .where(inArray(ratePlanRoomTypes.ratePlanId, ratePlanIds))
      : Promise.resolve([]),
    roomTypeIds.length
      ? db
          .select()
          .from(roomTypeDailyInventory)
          .where(
            and(
              inArray(roomTypeDailyInventory.roomTypeId, roomTypeIds),
              gte(roomTypeDailyInventory.date, query.from),
              lte(roomTypeDailyInventory.date, query.to),
            ),
          )
      : Promise.resolve([]),
    roomTypeIds.length
      ? db
          .select()
          .from(ratePlanDailyRates)
          .where(
            and(
              inArray(ratePlanDailyRates.roomTypeId, roomTypeIds),
              gte(ratePlanDailyRates.date, query.from),
              lte(ratePlanDailyRates.date, query.to),
            ),
          )
      : Promise.resolve([]),
  ])

  return assembleCalendar({
    propertyId: query.propertyId,
    from: query.from,
    to: query.to,
    roomTypeRows,
    ratePlanRows,
    joinRows,
    inventoryRows,
    rateRows,
  })
}
