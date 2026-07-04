/**
 * Tape chart (PLAN §4.2): a units × dates grid, units grouped by room type, each
 * occupied cell referencing the stay in the unit on that date, plus the list of
 * in-window arrivals that still need a unit assigned.
 *
 * `assembleTapeChart` is PURE — grid assembly from already-loaded rows, unit
 * tested without a db. `getTapeChart` loads units (local), room-type names
 * (upstream) and the stay picture, then delegates.
 */

import { roomTypes } from "@voyant-travel/accommodations/schema"
import { RequestValidationError } from "@voyant-travel/hono"
import { asc, eq } from "drizzle-orm"

import { expandDates } from "../units/dates.js"
import { roomUnits } from "../units/schema.js"
import type { FrontDeskDb } from "./db.js"
import { type AssignmentContext, loadStayPicture, type StayContext } from "./service-reads.js"
import type { TapeChartQuery } from "./validation.js"

export interface TapeChartUnit {
  id: string
  unitNumber: string
  name: string | null
  status: string
  roomTypeId: string
  roomTypeName: string
}

export interface TapeChartCell {
  date: string
  bookingItemId: string
  guestName: string | null
  reservationStatus: string
  opsStatus: string | null
  checkInDate: string
  checkOutDate: string
}

export interface TapeChartUnitRow {
  unitId: string
  unitNumber: string
  name: string | null
  status: string
  cells: TapeChartCell[]
}

export interface TapeChartGroup {
  roomTypeId: string
  roomTypeName: string
  units: TapeChartUnitRow[]
}

export interface UnassignedArrival {
  bookingItemId: string
  roomTypeId: string
  checkInDate: string
  checkOutDate: string
  guestName: string | null
  reservationStatus: string
}

export interface TapeChart {
  propertyId: string
  from: string
  to: string
  dates: string[]
  groups: TapeChartGroup[]
  unassignedArrivals: UnassignedArrival[]
}

export interface AssembleTapeChartInput {
  propertyId: string
  from: string
  to: string
  dates: readonly string[]
  units: readonly TapeChartUnit[]
  stays: readonly StayContext[]
  assignments: readonly AssignmentContext[]
}

/** A cancelled reservation never occupies a cell or shows as an arrival. */
function isLive(stay: StayContext): boolean {
  return stay.reservationStatus !== "cancelled"
}

export function assembleTapeChart(input: AssembleTapeChartInput): TapeChart {
  const stayByItem = new Map(input.stays.map((s) => [s.bookingItemId, s]))
  const windowDates = new Set(input.dates)

  // Group assignments by unit for cell placement.
  const assignmentsByUnit = new Map<string, AssignmentContext[]>()
  for (const a of input.assignments) {
    const list = assignmentsByUnit.get(a.unitId) ?? []
    list.push(a)
    assignmentsByUnit.set(a.unitId, list)
  }

  const unitRow = (unit: TapeChartUnit): TapeChartUnitRow => {
    const cells: TapeChartCell[] = []
    for (const a of assignmentsByUnit.get(unit.id) ?? []) {
      const stay = stayByItem.get(a.bookingItemId)
      if (!stay || !isLive(stay)) continue
      // Half-open occupancy: nights a.fromDate … a.toDate-1, intersected with window.
      for (const date of expandDates(a.fromDate, a.toDate)) {
        if (date === a.toDate || !windowDates.has(date)) continue
        cells.push({
          date,
          bookingItemId: stay.bookingItemId,
          guestName: stay.guestName,
          reservationStatus: stay.reservationStatus,
          opsStatus: stay.opsStatus,
          checkInDate: stay.checkInDate,
          checkOutDate: stay.checkOutDate,
        })
      }
    }
    cells.sort((a, b) => a.date.localeCompare(b.date))
    return {
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      name: unit.name,
      status: unit.status,
      cells,
    }
  }

  // Group units by room type, preserving unit input order within a group.
  const groups = new Map<string, TapeChartGroup>()
  for (const unit of input.units) {
    const group = groups.get(unit.roomTypeId) ?? {
      roomTypeId: unit.roomTypeId,
      roomTypeName: unit.roomTypeName,
      units: [],
    }
    group.units.push(unitRow(unit))
    groups.set(unit.roomTypeId, group)
  }

  const assignedItems = new Set(input.assignments.map((a) => a.bookingItemId))
  const unassignedArrivals: UnassignedArrival[] = input.stays
    .filter(
      (s) =>
        isLive(s) &&
        !assignedItems.has(s.bookingItemId) &&
        s.checkInDate >= input.from &&
        s.checkInDate <= input.to,
    )
    .map((s) => ({
      bookingItemId: s.bookingItemId,
      roomTypeId: s.roomTypeId,
      checkInDate: s.checkInDate,
      checkOutDate: s.checkOutDate,
      guestName: s.guestName,
      reservationStatus: s.reservationStatus,
    }))

  return {
    propertyId: input.propertyId,
    from: input.from,
    to: input.to,
    dates: [...input.dates],
    groups: [...groups.values()],
    unassignedArrivals,
  }
}

export async function getTapeChart(db: FrontDeskDb, query: TapeChartQuery): Promise<TapeChart> {
  let dates: string[]
  try {
    dates = expandDates(query.from, query.to)
  } catch (err) {
    throw new RequestValidationError(err instanceof Error ? err.message : "invalid date range")
  }

  const [unitRows, roomTypeRows, picture] = await Promise.all([
    db
      .select({
        id: roomUnits.id,
        unitNumber: roomUnits.unitNumber,
        name: roomUnits.name,
        status: roomUnits.status,
        roomTypeId: roomUnits.roomTypeId,
      })
      .from(roomUnits)
      .where(eq(roomUnits.propertyId, query.propertyId))
      .orderBy(asc(roomUnits.unitNumber)),
    db
      .select({ id: roomTypes.id, name: roomTypes.name })
      .from(roomTypes)
      .where(eq(roomTypes.propertyId, query.propertyId)),
    loadStayPicture(db, query.propertyId, query.from, query.to),
  ])

  const roomTypeName = new Map(roomTypeRows.map((r) => [r.id, r.name]))
  const units: TapeChartUnit[] = unitRows.map((u) => ({
    id: u.id,
    unitNumber: u.unitNumber,
    name: u.name,
    status: u.status,
    roomTypeId: u.roomTypeId,
    roomTypeName: roomTypeName.get(u.roomTypeId) ?? u.roomTypeId,
  }))

  return assembleTapeChart({
    propertyId: query.propertyId,
    from: query.from,
    to: query.to,
    dates,
    units,
    stays: picture.stays,
    assignments: picture.assignments,
  })
}
