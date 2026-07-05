/**
 * Serialized-inventory derivation (PLAN §4.1, §7).
 *
 * For a room type whose upstream `inventoryMode` is `serialized`, the sellable
 * daily capacity is NOT hand-authored — it is DERIVED from the count of active,
 * physically-available units of that type, minus any units blocked on the day
 * (maintenance, Phase 4). This keeps the upstream `room_type_daily_inventory`
 * table authoritative so the `accommodations` owned-stay search/quote path keeps
 * working untouched.
 *
 * Design (per §7 — "idempotent recompute per (roomType, date), not incremental
 * counters"):
 *   - `computeDailyCapacities` is PURE — count of available units per date,
 *     minus a pluggable per-date blocked-unit set. Unit-tested without a db.
 *   - `recomputeDailyInventory` loads the units + target dates and writes them as
 *     a SINGLE `INSERT … ON CONFLICT (room_type_id, date) DO UPDATE` statement,
 *     which is atomic and convergent (re-running the same inputs yields the same
 *     rows). It updates ONLY `capacity` — never `closed`, which stays an authoring
 *     (close-to-arrival) concern owned by the ARI calendar.
 *   - Pooled / virtual room types are never touched (capacity stays authored).
 *
 * Phase 4 maintenance hook: `recomputeDailyInventory` accepts
 * `blockedUnitIdsByDate` (date → set of blocked unit ids). Phase 4's maintenance
 * module builds that map from `maintenance_blocks` and passes it in; Phase 3
 * defaults to none, so capacity == count of available units.
 */

import { roomTypeDailyInventory, roomTypes } from "@voyant-travel/accommodations/schema"
import { RequestValidationError } from "@voyant-travel/hono"
import { and, eq, gte, inArray, sql } from "drizzle-orm"

import { expandDates, formatIsoDate } from "./dates.js"
import type { UnitsDb } from "./db.js"
import { roomUnits } from "./schema.js"

type InventoryRow = typeof roomTypeDailyInventory.$inferInsert

/** Default forward horizon (days) recomputed when a unit changes without an explicit range. */
export const DEFAULT_DERIVATION_HORIZON_DAYS = 365

/** The minimal unit shape the pure derivation needs. */
export interface UnitForDerivation {
  id: string
  status: string
  active: boolean
}

/** Optional per-date blocked-unit sets (Phase 4 maintenance injects this). */
export type BlockedUnitIdsByDate = ReadonlyMap<string, ReadonlySet<string>>

/** A unit contributes sellable capacity iff it is active and physically available. */
export function isSellableUnit(unit: UnitForDerivation): boolean {
  return unit.active && unit.status === "available"
}

/**
 * PURE: derive `date → capacity` for a serialized room type. Capacity on a date
 * is the number of sellable units NOT blocked on that date. Idempotent and
 * side-effect free — the single source of the derivation math.
 */
export function computeDailyCapacities(
  units: readonly UnitForDerivation[],
  dates: readonly string[],
  blockedUnitIdsByDate?: BlockedUnitIdsByDate,
): Map<string, number> {
  const sellable = units.filter(isSellableUnit)
  const byDate = new Map<string, number>()
  for (const date of dates) {
    const blocked = blockedUnitIdsByDate?.get(date)
    const capacity = blocked ? sellable.filter((u) => !blocked.has(u.id)).length : sellable.length
    byDate.set(date, capacity)
  }
  return byDate
}

/** Build the atomic upsert rows from a computed `date → capacity` map. Pure. */
export function buildInventoryRowsFromCapacities(
  roomTypeId: string,
  capacities: ReadonlyMap<string, number>,
): InventoryRow[] {
  return [...capacities.entries()].map(([date, capacity]) => ({ roomTypeId, date, capacity }))
}

export interface RecomputeResult {
  roomTypeId: string
  /** `false` when the room type is pooled/virtual (or missing) — nothing was written. */
  serialized: boolean
  dates: number
  upserted: number
}

/**
 * Recompute the derived daily capacity for `roomTypeId` over `[from, to]`.
 * No-op (serialized:false) for non-serialized room types. Atomic + idempotent.
 */
export async function recomputeDailyInventory(
  db: UnitsDb,
  roomTypeId: string,
  from: string,
  to: string,
  options: { blockedUnitIdsByDate?: BlockedUnitIdsByDate } = {},
): Promise<RecomputeResult> {
  let dates: string[]
  try {
    dates = expandDates(from, to)
  } catch (err) {
    throw new RequestValidationError(err instanceof Error ? err.message : "invalid date range")
  }
  return recomputeForDates(db, roomTypeId, dates, options.blockedUnitIdsByDate)
}

/**
 * Recompute derived capacity after a unit mutation: covers a forward horizon
 * window PLUS every existing future inventory row for the room type, so removing
 * or disabling a unit corrects rows already written beyond the window. Called
 * from unit create/update/delete/status changes. No-op for non-serialized types.
 */
export async function recomputeInventoryForRoomTypeChange(
  db: UnitsDb,
  roomTypeId: string,
  options: { blockedUnitIdsByDate?: BlockedUnitIdsByDate; today?: string } = {},
): Promise<RecomputeResult> {
  const today = options.today ?? formatIsoDate(new Date())
  const horizonEnd = addHorizon(today)

  const existingFuture = await db
    .select({ date: roomTypeDailyInventory.date })
    .from(roomTypeDailyInventory)
    .where(
      and(
        eq(roomTypeDailyInventory.roomTypeId, roomTypeId),
        gte(roomTypeDailyInventory.date, today),
      ),
    )

  const dateSet = new Set<string>(expandDates(today, horizonEnd))
  for (const row of existingFuture) dateSet.add(row.date)
  const dates = [...dateSet].sort()

  return recomputeForDates(db, roomTypeId, dates, options.blockedUnitIdsByDate)
}

function addHorizon(today: string): string {
  const base = new Date(`${today}T00:00:00.000Z`).getTime()
  return formatIsoDate(new Date(base + DEFAULT_DERIVATION_HORIZON_DAYS * 86_400_000))
}

/** Shared core: guard serialized, load units, compute, atomic upsert (capacity only). */
async function recomputeForDates(
  db: UnitsDb,
  roomTypeId: string,
  dates: readonly string[],
  blockedUnitIdsByDate?: BlockedUnitIdsByDate,
): Promise<RecomputeResult> {
  const [roomType] = await db
    .select({ id: roomTypes.id, inventoryMode: roomTypes.inventoryMode })
    .from(roomTypes)
    .where(eq(roomTypes.id, roomTypeId))
    .limit(1)

  if (roomType?.inventoryMode !== "serialized") {
    return { roomTypeId, serialized: false, dates: 0, upserted: 0 }
  }
  if (dates.length === 0) return { roomTypeId, serialized: true, dates: 0, upserted: 0 }

  const units = await db
    .select({ id: roomUnits.id, status: roomUnits.status, active: roomUnits.active })
    .from(roomUnits)
    .where(eq(roomUnits.roomTypeId, roomTypeId))

  const capacities = computeDailyCapacities(units, dates, blockedUnitIdsByDate)
  const rows = buildInventoryRowsFromCapacities(roomTypeId, capacities)

  await db
    .insert(roomTypeDailyInventory)
    .values(rows)
    .onConflictDoUpdate({
      target: [roomTypeDailyInventory.roomTypeId, roomTypeDailyInventory.date],
      // Only capacity is derived; `closed` stays owned by the ARI calendar.
      set: { capacity: sql`excluded.capacity`, updatedAt: sql`now()` },
    })

  return { roomTypeId, serialized: true, dates: dates.length, upserted: rows.length }
}

/** Load the distinct serialized room-type ids referenced by a set of units (dedup helper). */
export async function serializedRoomTypeIds(
  db: UnitsDb,
  roomTypeIds: readonly string[],
): Promise<string[]> {
  if (roomTypeIds.length === 0) return []
  const rows = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        inArray(roomTypes.id, [...new Set(roomTypeIds)]),
        eq(roomTypes.inventoryMode, "serialized"),
      ),
    )
  return rows.map((r) => r.id)
}
