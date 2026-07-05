/**
 * Per-unit housekeeping room status (`pms_unit_room_status`) — one upserted row
 * per unit tracking the dirty → clean → inspected lifecycle (PLAN §4.3).
 *
 * The route-driven `setRoomStatus` enforces the transition rule (inspected
 * requires clean) via the PURE `roomStatusTransitionBlockedReason`. Task
 * completion is an authoritative side-effect and uses the lower-level
 * `upsertRoomStatus` (no guard) — completing an inspect task attests the room was
 * clean, so it sets `inspected` directly.
 */

import { ApiHttpError } from "@voyant-travel/hono"
import { roomUnits } from "@voyant-travel/pms-units/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { HousekeepingDb } from "./db.js"
import { unitRoomStatus } from "./schema.js"
import { type RoomStatus, roomStatusTransitionBlockedReason } from "./transitions.js"
import type { SetRoomStatusInput } from "./validation.js"

type UnitRoomStatusRow = typeof unitRoomStatus.$inferSelect

/** A unit joined with its housekeeping status (null status → never touched). */
export interface RoomStatusEntry {
  unitId: string
  unitNumber: string
  roomTypeId: string
  floor: string | null
  roomStatus: RoomStatus | null
  lastChangedAt: string | null
  lastChangedBy: string | null
}

/** Every unit in a property with its current housekeeping status (left join). */
export async function listRoomStatusForProperty(
  db: HousekeepingDb,
  propertyId: string,
): Promise<RoomStatusEntry[]> {
  const rows = await db
    .select({
      unitId: roomUnits.id,
      unitNumber: roomUnits.unitNumber,
      roomTypeId: roomUnits.roomTypeId,
      floor: roomUnits.floor,
      roomStatus: unitRoomStatus.roomStatus,
      lastChangedAt: unitRoomStatus.lastChangedAt,
      lastChangedBy: unitRoomStatus.lastChangedBy,
    })
    .from(roomUnits)
    .leftJoin(unitRoomStatus, eq(unitRoomStatus.unitId, roomUnits.id))
    .where(eq(roomUnits.propertyId, propertyId))
    .orderBy(roomUnits.unitNumber)

  return rows.map((r) => ({
    unitId: r.unitId,
    unitNumber: r.unitNumber,
    roomTypeId: r.roomTypeId,
    floor: r.floor,
    roomStatus: (r.roomStatus as RoomStatus | null) ?? null,
    lastChangedAt: r.lastChangedAt ? r.lastChangedAt.toISOString() : null,
    lastChangedBy: r.lastChangedBy ?? null,
  }))
}

/** Current housekeeping status for a set of units (unit id → status). */
export async function getUnitRoomStatuses(
  db: HousekeepingDb,
  unitIds: readonly string[],
): Promise<Map<string, RoomStatus>> {
  if (unitIds.length === 0) return new Map()
  const rows = await db
    .select({ unitId: unitRoomStatus.unitId, roomStatus: unitRoomStatus.roomStatus })
    .from(unitRoomStatus)
    .where(inArray(unitRoomStatus.unitId, [...unitIds]))
  return new Map(rows.map((r) => [r.unitId, r.roomStatus as RoomStatus]))
}

/** Raw upsert of a unit's housekeeping status — no transition guard. */
export async function upsertRoomStatus(
  db: HousekeepingDb,
  unitId: string,
  roomStatus: RoomStatus,
  userId?: string,
): Promise<UnitRoomStatusRow> {
  const now = new Date()
  const [row] = await db
    .insert(unitRoomStatus)
    .values({ unitId, roomStatus, lastChangedAt: now, lastChangedBy: userId ?? null })
    .onConflictDoUpdate({
      target: unitRoomStatus.unitId,
      set: { roomStatus, lastChangedAt: now, lastChangedBy: userId ?? null },
    })
    .returning()
  return row
}

/** Set a unit's housekeeping status, enforcing the transition rule. */
export async function setRoomStatus(
  db: HousekeepingDb,
  input: SetRoomStatusInput,
  userId?: string,
): Promise<UnitRoomStatusRow> {
  await assertUnitExists(db, input.unitId)
  const [current] = await db
    .select({ roomStatus: unitRoomStatus.roomStatus })
    .from(unitRoomStatus)
    .where(eq(unitRoomStatus.unitId, input.unitId))
    .limit(1)

  const reason = roomStatusTransitionBlockedReason(
    (current?.roomStatus as RoomStatus | null) ?? null,
    input.roomStatus,
  )
  if (reason) {
    throw new ApiHttpError(reason, { status: 409, code: "room_status_transition_blocked" })
  }
  return upsertRoomStatus(db, input.unitId, input.roomStatus, userId)
}

async function assertUnitExists(db: HousekeepingDb, unitId: string): Promise<void> {
  const [row] = await db
    .select({ id: roomUnits.id })
    .from(roomUnits)
    .where(and(eq(roomUnits.id, unitId)))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`unit ${unitId} does not exist`, { status: 404, code: "not_found" })
  }
}

/** Mark a set of units dirty (guest departed) — best-effort bulk upsert. */
export async function markUnitsDirty(
  db: HousekeepingDb,
  unitIds: readonly string[],
  userId?: string,
): Promise<number> {
  if (unitIds.length === 0) return 0
  const now = new Date()
  const rows = unitIds.map((unitId) => ({
    unitId,
    roomStatus: "dirty" as const,
    lastChangedAt: now,
    lastChangedBy: userId ?? null,
  }))
  await db
    .insert(unitRoomStatus)
    .values(rows)
    .onConflictDoUpdate({
      target: unitRoomStatus.unitId,
      set: {
        roomStatus: sql`excluded.room_status`,
        lastChangedAt: sql`excluded.last_changed_at`,
        lastChangedBy: sql`excluded.last_changed_by`,
      },
    })
  return rows.length
}
