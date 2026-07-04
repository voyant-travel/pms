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

/** Minimal readiness shape the check-in warning path consumes (structural). */
export interface UnitReadinessInfo {
  unitId: string
  ready: boolean
  reasons: string[]
}

/**
 * Optional injected lookup that reports whether the assigned units are
 * guest-ready on a date. Supplied by the housekeeping module at route wiring
 * (front-desk → housekeeping); when absent, check-in skips readiness warnings.
 */
export type UnitReadinessLookup = (
  db: FrontDeskDb,
  unitIds: string[],
  date: string,
) => Promise<UnitReadinessInfo[]>

export interface CheckInOptions {
  getUnitReadiness?: UnitReadinessLookup
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
      checkInDate: stayBookingItems.checkInDate,
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

async function loadAssignedUnitIds(db: FrontDeskDb, bookingItemId: string): Promise<string[]> {
  const rows = await db
    .select({ unitId: unitAssignments.unitId })
    .from(unitAssignments)
    .where(eq(unitAssignments.bookingItemId, bookingItemId))
  return rows.map((r) => r.unitId)
}

export async function checkIn(
  db: FrontDeskDb,
  input: CheckInInput,
  userId?: string,
  options: CheckInOptions = {},
): Promise<OpsResult> {
  const stay = await loadStay(db, input.bookingItemId)
  const reason = checkInBlockedReason(stay.status)
  if (reason) {
    throw new ApiHttpError(`cannot check in: ${reason}`, { status: 409, code: "checkin_blocked" })
  }

  const warnings: string[] = []
  const assignedUnitIds = await loadAssignedUnitIds(db, input.bookingItemId)
  if ((await isSerializedRoomType(db, stay.roomTypeId)) && assignedUnitIds.length === 0) {
    warnings.push("no unit assigned for a serialized room type — assign a unit before arrival")
  }

  // Housekeeping readiness gating — WARN (never block): a dirty room or an
  // active maintenance block on the assigned unit surfaces a warning so the
  // agent can react, but the check-in still proceeds.
  if (options.getUnitReadiness && assignedUnitIds.length > 0) {
    const readiness = await options.getUnitReadiness(db, assignedUnitIds, stay.checkInDate)
    for (const unit of readiness) {
      if (!unit.ready) {
        warnings.push(`unit ${unit.unitId} is not ready for check-in: ${unit.reasons.join("; ")}`)
      }
    }
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
