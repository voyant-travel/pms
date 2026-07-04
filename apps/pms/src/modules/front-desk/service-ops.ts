/**
 * Check-in / check-out / no-show operations over `pms_stay_ops` (PLAN §4.2).
 *
 * The ops row is created on first touch (upsert on the unique `booking_item_id`).
 * Guards are PURE predicates (`checkInBlockedReason` / `checkOutBlockedReason`)
 * so they are unit-tested without a db; the service maps a non-null reason to a
 * 409. Serialized room types require a unit assignment to check in — enforced as
 * a WARN-not-block flag (front desk may assign later). No-show is the one place
 * we write UPSTREAM: it mirrors the operational no-show onto the reservation by
 * setting `stay_booking_items.status = 'no_show'` (the enum already includes it),
 * so the reservation record and the boards agree.
 */

import { roomTypes, stayBookingItems } from "@voyant-travel/accommodations/schema"
import { ApiHttpError } from "@voyant-travel/hono"
import { eq, sql } from "drizzle-orm"

import { unitAssignments } from "../units/schema.js"
import type { FrontDeskDb } from "./db.js"
import { stayOps } from "./schema.js"
import type { CheckInInput, CheckOutInput, NoShowInput } from "./validation.js"

type StayOpsRow = typeof stayOps.$inferSelect

export interface OpsResult {
  data: StayOpsRow
  warnings: string[]
}

/** PURE: reason a stay cannot be checked in, or null when it may. */
export function checkInBlockedReason(reservationStatus: string): string | null {
  if (reservationStatus === "cancelled") return "stay is cancelled"
  if (reservationStatus === "no_show") return "stay is marked no-show"
  return null
}

/** PURE: reason a stay cannot be checked out, or null when it may. */
export function checkOutBlockedReason(opsStatus: string | null): string | null {
  if (opsStatus === "checked_in") return null
  if (opsStatus === "checked_out") return "stay is already checked out"
  return "stay is not checked in"
}

async function loadStay(db: FrontDeskDb, bookingItemId: string) {
  const [stay] = await db
    .select({
      bookingItemId: stayBookingItems.bookingItemId,
      roomTypeId: stayBookingItems.roomTypeId,
      status: stayBookingItems.status,
    })
    .from(stayBookingItems)
    .where(eq(stayBookingItems.bookingItemId, bookingItemId))
    .limit(1)
  if (!stay) {
    throw new ApiHttpError(`stay for booking item ${bookingItemId} not found`, {
      status: 404,
      code: "not_found",
    })
  }
  return stay
}

async function isSerializedRoomType(db: FrontDeskDb, roomTypeId: string): Promise<boolean> {
  const [rt] = await db
    .select({ inventoryMode: roomTypes.inventoryMode })
    .from(roomTypes)
    .where(eq(roomTypes.id, roomTypeId))
    .limit(1)
  return rt?.inventoryMode === "serialized"
}

async function hasUnitAssignment(db: FrontDeskDb, bookingItemId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: unitAssignments.id })
    .from(unitAssignments)
    .where(eq(unitAssignments.bookingItemId, bookingItemId))
    .limit(1)
  return Boolean(row)
}

export async function checkIn(
  db: FrontDeskDb,
  input: CheckInInput,
  userId?: string,
): Promise<OpsResult> {
  const stay = await loadStay(db, input.bookingItemId)
  const reason = checkInBlockedReason(stay.status)
  if (reason) {
    throw new ApiHttpError(`cannot check in: ${reason}`, { status: 409, code: "checkin_blocked" })
  }

  const warnings: string[] = []
  if (
    (await isSerializedRoomType(db, stay.roomTypeId)) &&
    !(await hasUnitAssignment(db, input.bookingItemId))
  ) {
    warnings.push("no unit assigned for a serialized room type — assign a unit before arrival")
  }

  const now = new Date()
  const [row] = await db
    .insert(stayOps)
    .values({
      bookingItemId: input.bookingItemId,
      opsStatus: "checked_in",
      checkedInAt: now,
      docType: input.docType ?? null,
      docNumber: input.docNumber ?? null,
      notes: input.notes ?? null,
      checkedInBy: userId ?? null,
    })
    .onConflictDoUpdate({
      target: stayOps.bookingItemId,
      set: {
        opsStatus: "checked_in",
        checkedInAt: now,
        docType: sql`coalesce(excluded.doc_type, ${stayOps.docType})`,
        docNumber: sql`coalesce(excluded.doc_number, ${stayOps.docNumber})`,
        notes: sql`coalesce(excluded.notes, ${stayOps.notes})`,
        checkedInBy: sql`excluded.checked_in_by`,
        updatedAt: now,
      },
    })
    .returning()
  return { data: row, warnings }
}

export async function checkOut(
  db: FrontDeskDb,
  input: CheckOutInput,
  userId?: string,
): Promise<OpsResult> {
  const [current] = await db
    .select()
    .from(stayOps)
    .where(eq(stayOps.bookingItemId, input.bookingItemId))
    .limit(1)
  const reason = checkOutBlockedReason(current?.opsStatus ?? null)
  if (reason) {
    throw new ApiHttpError(`cannot check out: ${reason}`, { status: 409, code: "checkout_blocked" })
  }

  const now = new Date()
  const [row] = await db
    .update(stayOps)
    .set({
      opsStatus: "checked_out",
      checkedOutAt: now,
      checkedOutBy: userId ?? null,
      updatedAt: now,
    })
    .where(eq(stayOps.bookingItemId, input.bookingItemId))
    .returning()
  return { data: row, warnings: [] }
}

export async function noShow(
  db: FrontDeskDb,
  input: NoShowInput,
  userId?: string,
): Promise<OpsResult> {
  // Ensure the stay exists (also validates the loose booking-item ref).
  await loadStay(db, input.bookingItemId)

  const now = new Date()
  const [row] = await db
    .insert(stayOps)
    .values({
      bookingItemId: input.bookingItemId,
      opsStatus: "no_show",
      checkedInBy: userId ?? null,
    })
    .onConflictDoUpdate({
      target: stayOps.bookingItemId,
      set: { opsStatus: "no_show", updatedAt: now },
    })
    .returning()

  // Mirror the operational no-show onto the upstream reservation status.
  await db
    .update(stayBookingItems)
    .set({ status: "no_show", updatedAt: now })
    .where(eq(stayBookingItems.bookingItemId, input.bookingItemId))

  return { data: row, warnings: [] }
}
