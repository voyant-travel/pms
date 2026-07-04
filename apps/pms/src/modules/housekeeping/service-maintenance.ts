/**
 * Maintenance blocks (`pms_maintenance_blocks`) CRUD + the units → daily
 * inventory integration (PLAN §4.3). An ACTIVE block takes a unit out of service
 * over an inclusive date range, which must reduce the derived sellable capacity
 * of its serialized room type. On every mutation (create / update / resolve /
 * cancel) we rebuild the affected room type's derived inventory by calling the
 * units module's `recomputeDailyInventory` with a `blockedUnitIdsByDate` map
 * assembled from ALL currently-active blocks for that room type.
 *
 * Dependency direction is housekeeping → units (direct import of the sibling
 * module's recompute + schema) — never the reverse.
 */

import { roomTypes } from "@voyant-travel/accommodations/schema"
import { ApiHttpError } from "@voyant-travel/hono"
import { properties } from "@voyant-travel/operations/places"
import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, eq, type SQL } from "drizzle-orm"

import { expandDates } from "../units/dates.js"
import { roomUnits } from "../units/schema.js"
import { recomputeDailyInventory } from "../units/service-inventory.js"
import type { HousekeepingDb } from "./db.js"
import { buildBlockedUnitIdsByDate, type MaintenanceWindow } from "./maintenance-window.js"
import { maintenanceBlocks } from "./schema.js"
import type {
  InsertMaintenanceBlockInput,
  MaintenanceBlockListQuery,
  UpdateMaintenanceBlockInput,
} from "./validation.js"

type BlockRow = typeof maintenanceBlocks.$inferSelect

export interface MaintenanceBlockResult {
  data: BlockRow
  /** Room type whose derived inventory was recomputed (null for pooled/virtual). */
  recomputedRoomTypeId: string | null
}

async function assertUnitExists(db: HousekeepingDb, unitId: string): Promise<string> {
  const [row] = await db
    .select({ id: roomUnits.id, roomTypeId: roomUnits.roomTypeId })
    .from(roomUnits)
    .where(eq(roomUnits.id, unitId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`unit ${unitId} does not exist`, { status: 404, code: "not_found" })
  }
  return row.roomTypeId
}

async function assertPropertyExists(db: HousekeepingDb, propertyId: string): Promise<void> {
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`property ${propertyId} does not exist`, {
      status: 404,
      code: "not_found",
    })
  }
}

/** Active maintenance windows for every unit of a room type (for the blocked map). */
async function loadActiveWindowsForRoomType(
  db: HousekeepingDb,
  roomTypeId: string,
): Promise<MaintenanceWindow[]> {
  const rows = await db
    .select({
      unitId: maintenanceBlocks.unitId,
      fromDate: maintenanceBlocks.fromDate,
      toDate: maintenanceBlocks.toDate,
    })
    .from(maintenanceBlocks)
    .innerJoin(roomUnits, eq(roomUnits.id, maintenanceBlocks.unitId))
    .where(and(eq(roomUnits.roomTypeId, roomTypeId), eq(maintenanceBlocks.status, "active")))
  return rows
}

/**
 * Recompute the derived inventory for the room type owning `unitId` over
 * `[from, to]`, applying every currently-active block. No-op for pooled/virtual
 * room types (the units recompute guards on `inventoryMode`). Returns the room
 * type id when serialized, else null.
 */
async function recomputeForUnitRange(
  db: HousekeepingDb,
  unitId: string,
  from: string,
  to: string,
): Promise<string | null> {
  const [unit] = await db
    .select({ roomTypeId: roomUnits.roomTypeId })
    .from(roomUnits)
    .where(eq(roomUnits.id, unitId))
    .limit(1)
  if (!unit) return null

  const [rt] = await db
    .select({ inventoryMode: roomTypes.inventoryMode })
    .from(roomTypes)
    .where(eq(roomTypes.id, unit.roomTypeId))
    .limit(1)
  if (rt?.inventoryMode !== "serialized") return null

  const windows = await loadActiveWindowsForRoomType(db, unit.roomTypeId)
  const dates = expandDates(from, to)
  const blockedUnitIdsByDate = buildBlockedUnitIdsByDate(windows, dates)
  await recomputeDailyInventory(db, unit.roomTypeId, from, to, { blockedUnitIdsByDate })
  return unit.roomTypeId
}

export async function listMaintenanceBlocks(
  db: HousekeepingDb,
  query: MaintenanceBlockListQuery,
): Promise<ListResponse<BlockRow>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(maintenanceBlocks.propertyId, query.propertyId))
  if (query.unitId) clauses.push(eq(maintenanceBlocks.unitId, query.unitId))
  if (query.status) clauses.push(eq(maintenanceBlocks.status, query.status))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(maintenanceBlocks)
      .where(where)
      .orderBy(asc(maintenanceBlocks.fromDate))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(maintenanceBlocks).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getMaintenanceBlock(
  db: HousekeepingDb,
  id: string,
): Promise<BlockRow | null> {
  const [row] = await db
    .select()
    .from(maintenanceBlocks)
    .where(eq(maintenanceBlocks.id, id))
    .limit(1)
  return row ?? null
}

export async function createMaintenanceBlock(
  db: HousekeepingDb,
  input: InsertMaintenanceBlockInput,
  userId?: string,
): Promise<MaintenanceBlockResult> {
  if (input.toDate < input.fromDate) {
    throw new ApiHttpError(`block end ${input.toDate} precedes start ${input.fromDate}`, {
      status: 400,
      code: "invalid_range",
    })
  }
  await assertPropertyExists(db, input.propertyId)
  await assertUnitExists(db, input.unitId)

  const [row] = await db
    .insert(maintenanceBlocks)
    .values({
      unitId: input.unitId,
      propertyId: input.propertyId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason,
      description: input.description ?? null,
      status: "active",
      createdBy: userId ?? null,
      metadata: input.metadata ?? null,
    })
    .returning()

  const recomputedRoomTypeId = await recomputeForUnitRange(db, row.unitId, row.fromDate, row.toDate)
  return { data: row, recomputedRoomTypeId }
}

export async function updateMaintenanceBlock(
  db: HousekeepingDb,
  id: string,
  input: UpdateMaintenanceBlockInput,
): Promise<MaintenanceBlockResult | null> {
  const existing = await getMaintenanceBlock(db, id)
  if (!existing) return null

  const fromDate = input.fromDate ?? existing.fromDate
  const toDate = input.toDate ?? existing.toDate
  if (toDate < fromDate) {
    throw new ApiHttpError(`block end ${toDate} precedes start ${fromDate}`, {
      status: 400,
      code: "invalid_range",
    })
  }

  const [row] = await db
    .update(maintenanceBlocks)
    .set({
      fromDate,
      toDate,
      reason: input.reason ?? existing.reason,
      description:
        input.description === undefined ? existing.description : (input.description ?? null),
      status: input.status ?? existing.status,
      metadata: input.metadata === undefined ? existing.metadata : (input.metadata ?? null),
      updatedAt: new Date(),
    })
    .where(eq(maintenanceBlocks.id, id))
    .returning()
  if (!row) return null

  // Recompute across the union of the old and new windows so vacating a date
  // (shortening/cancelling) restores capacity there too.
  const unionFrom = existing.fromDate < fromDate ? existing.fromDate : fromDate
  const unionTo = existing.toDate > toDate ? existing.toDate : toDate
  const recomputedRoomTypeId = await recomputeForUnitRange(db, row.unitId, unionFrom, unionTo)
  return { data: row, recomputedRoomTypeId }
}

/** Set a block to `resolved` or `cancelled` and restore the freed capacity. */
async function setBlockStatus(
  db: HousekeepingDb,
  id: string,
  status: "resolved" | "cancelled",
): Promise<MaintenanceBlockResult | null> {
  const existing = await getMaintenanceBlock(db, id)
  if (!existing) return null
  const [row] = await db
    .update(maintenanceBlocks)
    .set({ status, updatedAt: new Date() })
    .where(eq(maintenanceBlocks.id, id))
    .returning()
  if (!row) return null
  const recomputedRoomTypeId = await recomputeForUnitRange(db, row.unitId, row.fromDate, row.toDate)
  return { data: row, recomputedRoomTypeId }
}

export function resolveMaintenanceBlock(db: HousekeepingDb, id: string) {
  return setBlockStatus(db, id, "resolved")
}

export function cancelMaintenanceBlock(db: HousekeepingDb, id: string) {
  return setBlockStatus(db, id, "cancelled")
}
