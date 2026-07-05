/**
 * Front-desk boards (PLAN §4.2): arrivals, departures and in-house lists for a
 * single business date.
 *
 * `classifyBoards` is PURE — arrival/departure/in-house partitioning from loaded
 * stays, unit-tested without a db. `getBoards` loads the stay picture for the
 * one date and delegates. Classification (half-open nights):
 *   - arrivals   : check-in == date
 *   - departures : check-out == date
 *   - in-house   : check-in < date < check-out, OR ops status checked_in
 * Only live reservations (`reserved`) are eligible; cancelled and no-show stays
 * are excluded. A stay already checked out drops off in-house.
 */

import { RequestValidationError } from "@voyant-travel/hono"

import { parseIsoDate } from "@voyant-travel/pms-units"
import type { FrontDeskDb } from "./db.js"
import { type AssignmentContext, loadStayPicture, type StayContext } from "./service-reads.js"
import type { BoardsQuery } from "./validation.js"

export interface BoardEntry {
  bookingItemId: string
  bookingId: string
  bookingNumber: string
  guestName: string | null
  roomTypeId: string
  checkInDate: string
  checkOutDate: string
  adults: number
  children: number
  infants: number
  opsStatus: string | null
  unitId: string | null
}

export interface Boards {
  propertyId: string
  date: string
  arrivals: BoardEntry[]
  departures: BoardEntry[]
  inHouse: BoardEntry[]
}

function isEligible(stay: StayContext): boolean {
  return stay.reservationStatus === "reserved"
}

export interface ClassifyBoardsInput {
  propertyId: string
  date: string
  stays: readonly StayContext[]
  assignments?: readonly AssignmentContext[]
}

export function classifyBoards(input: ClassifyBoardsInput): Boards {
  const { date } = input
  const unitByItem = new Map((input.assignments ?? []).map((a) => [a.bookingItemId, a.unitId]))

  const entry = (stay: StayContext): BoardEntry => ({
    bookingItemId: stay.bookingItemId,
    bookingId: stay.bookingId,
    bookingNumber: stay.bookingNumber,
    guestName: stay.guestName,
    roomTypeId: stay.roomTypeId,
    checkInDate: stay.checkInDate,
    checkOutDate: stay.checkOutDate,
    adults: stay.adults,
    children: stay.children,
    infants: stay.infants,
    opsStatus: stay.opsStatus,
    unitId: unitByItem.get(stay.bookingItemId) ?? null,
  })

  const arrivals: BoardEntry[] = []
  const departures: BoardEntry[] = []
  const inHouse: BoardEntry[] = []

  for (const stay of input.stays) {
    if (!isEligible(stay)) continue
    if (stay.checkInDate === date) arrivals.push(entry(stay))
    if (stay.checkOutDate === date) departures.push(entry(stay))

    const spansNight = stay.checkInDate < date && date < stay.checkOutDate
    const stillIn = stay.opsStatus !== "checked_out"
    if (stillIn && (spansNight || stay.opsStatus === "checked_in")) {
      // Don't double-list a departure whose night has already passed.
      if (stay.checkOutDate > date) inHouse.push(entry(stay))
    }
  }

  const byName = (a: BoardEntry, b: BoardEntry) =>
    (a.guestName ?? "").localeCompare(b.guestName ?? "") ||
    a.bookingItemId.localeCompare(b.bookingItemId)
  arrivals.sort(byName)
  departures.sort(byName)
  inHouse.sort(byName)

  return { propertyId: input.propertyId, date, arrivals, departures, inHouse }
}

export async function getBoards(db: FrontDeskDb, query: BoardsQuery): Promise<Boards> {
  // Validate the date shape (throws a clean 400 on a malformed date).
  try {
    parseIsoDate(query.date)
  } catch (err) {
    throw new RequestValidationError(err instanceof Error ? err.message : "invalid date")
  }
  const picture = await loadStayPicture(db, query.propertyId, query.date, query.date)
  return classifyBoards({
    propertyId: query.propertyId,
    date: query.date,
    stays: picture.stays,
    assignments: picture.assignments,
  })
}
