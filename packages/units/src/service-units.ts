/**
 * CRUD service for physical room units (`pms_room_units`). Cross-module refs
 * (property, room type) are loose text columns, so existence is validated here.
 * Every mutation that can change derived serialized capacity (create, roomType
 * change, status/active change, delete) triggers a best-effort recompute of the
 * affected room type(s) via `recomputeInventoryForRoomTypeChange`.
 */

import { roomTypes } from "@voyant-travel/accommodations/schema"
import { ApiHttpError } from "@voyant-travel/hono"
import { properties } from "@voyant-travel/operations/places"
import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, eq, type SQL } from "drizzle-orm"

import type { UnitsDb } from "./db.js"
import { roomUnits } from "./schema.js"
import { recomputeInventoryForRoomTypeChange } from "./service-inventory.js"
import type { InsertRoomUnitInput, RoomUnitListQuery, UpdateRoomUnitInput } from "./validation.js"

/** Drop `undefined` keys so a PATCH only writes the fields the caller sent. */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

async function assertPropertyExists(db: UnitsDb, propertyId: string): Promise<void> {
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

async function assertRoomTypeExists(db: UnitsDb, roomTypeId: string): Promise<void> {
  const [row] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(eq(roomTypes.id, roomTypeId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`room type ${roomTypeId} does not exist`, {
      status: 404,
      code: "not_found",
    })
  }
}

export async function listRoomUnits(
  db: UnitsDb,
  query: RoomUnitListQuery,
): Promise<ListResponse<typeof roomUnits.$inferSelect>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(roomUnits.propertyId, query.propertyId))
  if (query.roomTypeId) clauses.push(eq(roomUnits.roomTypeId, query.roomTypeId))
  if (query.status) clauses.push(eq(roomUnits.status, query.status))
  if (query.active !== undefined) clauses.push(eq(roomUnits.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(roomUnits)
      .where(where)
      .orderBy(asc(roomUnits.unitNumber))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(roomUnits).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getRoomUnit(db: UnitsDb, id: string) {
  const [row] = await db.select().from(roomUnits).where(eq(roomUnits.id, id)).limit(1)
  return row ?? null
}

export async function createRoomUnit(db: UnitsDb, input: InsertRoomUnitInput) {
  await assertPropertyExists(db, input.propertyId)
  await assertRoomTypeExists(db, input.roomTypeId)
  const [row] = await db.insert(roomUnits).values(input).returning()
  await recomputeInventoryForRoomTypeChange(db, row.roomTypeId)
  return row
}

export async function updateRoomUnit(db: UnitsDb, id: string, input: UpdateRoomUnitInput) {
  const existing = await getRoomUnit(db, id)
  if (!existing) return null
  if (input.roomTypeId) await assertRoomTypeExists(db, input.roomTypeId)

  const [row] = await db
    .update(roomUnits)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(roomUnits.id, id))
    .returning()
  if (!row) return null

  // Recompute both the old and new room type when the unit was re-typed, moved
  // between statuses, or (de)activated — anything that shifts derived capacity.
  const affected = new Set([existing.roomTypeId, row.roomTypeId])
  for (const roomTypeId of affected) await recomputeInventoryForRoomTypeChange(db, roomTypeId)
  return row
}

export async function deleteRoomUnit(db: UnitsDb, id: string) {
  const [row] = await db.delete(roomUnits).where(eq(roomUnits.id, id)).returning()
  if (!row) return null
  await recomputeInventoryForRoomTypeChange(db, row.roomTypeId)
  return row
}
