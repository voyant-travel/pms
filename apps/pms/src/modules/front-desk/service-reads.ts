/**
 * Shared read model for the front-desk screens. Loads the joined stay picture —
 * upstream `stay_booking_items` (dates, pax, reservation status) + `booking_items`
 * + `bookings` (guest, booking status) — for a property over an inclusive date
 * window, plus the local `pms_stay_ops` overlay and `pms_unit_assignments`.
 *
 * The DB join lives here; the tape-chart and boards services consume the
 * normalized `StayContext[]` through PURE assemblers so the grid/board logic is
 * unit-tested without a db (PLAN §7 — deterministic derivation).
 *
 * Walk-ins note (PLAN §4.2): there is NO booking-creation flow here — the admin
 * books through the catalog booking engine. These reads join plain `bookings`
 * regardless of origin, so a walk-in (or an OTA/Connect reservation) that lands
 * as a normal booking with a stay item shows up on the boards/tape chart with no
 * special-casing.
 */

import { stayBookingItems } from "@voyant-travel/accommodations/schema"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { and, eq, gte, inArray, lte } from "drizzle-orm"
import { unitAssignments } from "../units/schema.js"
import type { FrontDeskDb } from "./db.js"
import { stayOps } from "./schema.js"

/** One stay, normalized across upstream reservation + booking + local ops overlay. */
export interface StayContext {
  bookingItemId: string
  propertyId: string
  roomTypeId: string
  checkInDate: string
  checkOutDate: string
  /** Upstream reservation status: reserved | cancelled | no_show. */
  reservationStatus: string
  adults: number
  children: number
  infants: number
  roomCount: number
  bookingId: string
  bookingNumber: string
  bookingStatus: string
  guestName: string | null
  /** Front-desk ops overlay (null until a check-in/out/no-show touches the stay). */
  opsStatus: string | null
  checkedInAt: string | null
  checkedOutAt: string | null
}

/** A booking-item → unit assignment, projected for the grid. */
export interface AssignmentContext {
  bookingItemId: string
  unitId: string
  fromDate: string
  toDate: string
}

function guestName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim()
  return name.length > 0 ? name : null
}

export interface StayPicture {
  stays: StayContext[]
  assignments: AssignmentContext[]
}

/**
 * Load every stay for `propertyId` whose occupancy window intersects the
 * inclusive `[from, to]` day range (`check_in <= to AND check_out >= from`),
 * plus the unit assignments for those stays and the ops overlay. The precise
 * half-open night/arrival/departure logic is applied by the pure assemblers.
 */
export async function loadStayPicture(
  db: FrontDeskDb,
  propertyId: string,
  from: string,
  to: string,
): Promise<StayPicture> {
  const rows = await db
    .select({
      bookingItemId: stayBookingItems.bookingItemId,
      propertyId: stayBookingItems.propertyId,
      roomTypeId: stayBookingItems.roomTypeId,
      checkInDate: stayBookingItems.checkInDate,
      checkOutDate: stayBookingItems.checkOutDate,
      reservationStatus: stayBookingItems.status,
      adults: stayBookingItems.adults,
      children: stayBookingItems.children,
      infants: stayBookingItems.infants,
      roomCount: stayBookingItems.roomCount,
      bookingId: bookings.id,
      bookingNumber: bookings.bookingNumber,
      bookingStatus: bookings.status,
      contactFirstName: bookings.contactFirstName,
      contactLastName: bookings.contactLastName,
      opsStatus: stayOps.opsStatus,
      checkedInAt: stayOps.checkedInAt,
      checkedOutAt: stayOps.checkedOutAt,
    })
    .from(stayBookingItems)
    .innerJoin(bookingItems, eq(bookingItems.id, stayBookingItems.bookingItemId))
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .leftJoin(stayOps, eq(stayOps.bookingItemId, stayBookingItems.bookingItemId))
    .where(
      and(
        eq(stayBookingItems.propertyId, propertyId),
        lte(stayBookingItems.checkInDate, to),
        gte(stayBookingItems.checkOutDate, from),
      ),
    )

  const stays: StayContext[] = rows.map((r) => ({
    bookingItemId: r.bookingItemId,
    propertyId: r.propertyId,
    roomTypeId: r.roomTypeId,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    reservationStatus: r.reservationStatus,
    adults: r.adults,
    children: r.children,
    infants: r.infants,
    roomCount: r.roomCount,
    bookingId: r.bookingId,
    bookingNumber: r.bookingNumber,
    bookingStatus: r.bookingStatus,
    guestName: guestName(r.contactFirstName, r.contactLastName),
    opsStatus: r.opsStatus ?? null,
    checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
    checkedOutAt: r.checkedOutAt ? r.checkedOutAt.toISOString() : null,
  }))

  const bookingItemIds = stays.map((s) => s.bookingItemId)
  const assignmentRows = bookingItemIds.length
    ? await db
        .select({
          bookingItemId: unitAssignments.bookingItemId,
          unitId: unitAssignments.unitId,
          fromDate: unitAssignments.fromDate,
          toDate: unitAssignments.toDate,
        })
        .from(unitAssignments)
        .where(inArray(unitAssignments.bookingItemId, bookingItemIds))
    : []

  return { stays, assignments: assignmentRows }
}
