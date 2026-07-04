/**
 * Unit-assignment service: assign / move / unassign a booking item to a physical
 * unit over a date range, and list assignments per unit/date-range.
 *
 * Overlap guard (PLAN §4.1, §7): two assignments on the SAME unit must not cover
 * an overlapping half-open date interval. We enforce this at the service layer
 * with a check-then-insert (the DB is neon-http, no interactive transactions):
 *   1. narrow the overlap set in SQL via the `(unit_id, from_date, to_date)`
 *      index, then
 *   2. confirm with the PURE `filterOverlapping` helper (unit-tested).
 * We deliberately do NOT add a Postgres GIST exclusion constraint: it needs the
 * `btree_gist` extension, which may be unavailable on the target DB and would
 * fail migration apply. The blessed fallback (service guard + supporting index)
 * is used and documented. The small check-then-insert race under heavy
 * concurrency is acceptable for front-desk assignment volumes (Phase 3).
 *
 * Room-type match is a WARN-not-block: assigning a booking item to a unit of a
 * different room type returns a `warnings` entry rather than throwing.
 */

import { stayBookingItems } from "@voyant-travel/accommodations/schema"
import { ApiHttpError, RequestValidationError } from "@voyant-travel/hono"
import { and, asc, eq, gt, lt, ne } from "drizzle-orm"

import { rangesOverlap } from "./dates.js"
import type { UnitsDb } from "./db.js"
import { roomUnits, unitAssignments } from "./schema.js"
import type {
  AssignmentListQuery,
  InsertAssignmentInput,
  UpdateAssignmentInput,
} from "./validation.js"

type AssignmentRow = typeof unitAssignments.$inferSelect

export interface AssignmentResult {
  data: AssignmentRow
  warnings: string[]
}

/** Minimal interval shape for the pure overlap check. */
export interface DateInterval {
  id: string
  fromDate: string
  toDate: string
}

/**
 * PURE: existing intervals that overlap `[from, to)`, excluding `excludeId`.
 * The single source of the overlap decision; unit-tested without a db.
 */
export function filterOverlapping<T extends DateInterval>(
  existing: readonly T[],
  from: string,
  to: string,
  excludeId?: string,
): T[] {
  return existing.filter(
    (row) => row.id !== excludeId && rangesOverlap(row.fromDate, row.toDate, from, to),
  )
}

function assertOrderedRange(from: string, to: string): void {
  if (to <= from) {
    throw new RequestValidationError(`assignment end ${to} must be after start ${from}`)
  }
}

/** Load a unit or 404. */
async function requireUnit(db: UnitsDb, unitId: string) {
  const [unit] = await db.select().from(roomUnits).where(eq(roomUnits.id, unitId)).limit(1)
  if (!unit)
    throw new ApiHttpError(`unit ${unitId} does not exist`, { status: 404, code: "not_found" })
  return unit
}

/** Room-type-mismatch warning between a unit and a booking item's stay room type. */
async function roomTypeWarnings(
  db: UnitsDb,
  bookingItemId: string,
  unitRoomTypeId: string,
): Promise<string[]> {
  const [stay] = await db
    .select({ roomTypeId: stayBookingItems.roomTypeId })
    .from(stayBookingItems)
    .where(eq(stayBookingItems.bookingItemId, bookingItemId))
    .limit(1)
  if (stay && stay.roomTypeId !== unitRoomTypeId) {
    return [
      `unit room type ${unitRoomTypeId} does not match the booking item's room type ${stay.roomTypeId}`,
    ]
  }
  return []
}

/** Existing assignments on a unit that overlap `[from, to)` (excluding `excludeId`). */
async function overlappingAssignments(
  db: UnitsDb,
  unitId: string,
  from: string,
  to: string,
  excludeId?: string,
): Promise<AssignmentRow[]> {
  const clauses = [
    eq(unitAssignments.unitId, unitId),
    lt(unitAssignments.fromDate, to),
    gt(unitAssignments.toDate, from),
  ]
  if (excludeId) clauses.push(ne(unitAssignments.id, excludeId))
  return db
    .select()
    .from(unitAssignments)
    .where(and(...clauses))
}

function assertNoConflict(conflicts: readonly AssignmentRow[], unitId: string): void {
  if (conflicts.length > 0) {
    throw new ApiHttpError(
      `unit ${unitId} already has an overlapping assignment (${conflicts[0].fromDate}..${conflicts[0].toDate})`,
      { status: 409, code: "assignment_overlap" },
    )
  }
}

export async function assignUnit(
  db: UnitsDb,
  input: InsertAssignmentInput,
  assignedBy?: string,
): Promise<AssignmentResult> {
  assertOrderedRange(input.fromDate, input.toDate)
  const unit = await requireUnit(db, input.unitId)

  const conflicts = filterOverlapping(
    await overlappingAssignments(db, input.unitId, input.fromDate, input.toDate),
    input.fromDate,
    input.toDate,
  )
  assertNoConflict(conflicts, input.unitId)

  const warnings = await roomTypeWarnings(db, input.bookingItemId, unit.roomTypeId)
  const [row] = await db
    .insert(unitAssignments)
    .values({
      bookingItemId: input.bookingItemId,
      unitId: input.unitId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      notes: input.notes ?? null,
      assignedBy: assignedBy ?? null,
    })
    .returning()
  return { data: row, warnings }
}

export async function moveAssignment(
  db: UnitsDb,
  id: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentResult | null> {
  const [current] = await db
    .select()
    .from(unitAssignments)
    .where(eq(unitAssignments.id, id))
    .limit(1)
  if (!current) return null

  const unitId = input.unitId ?? current.unitId
  const fromDate = input.fromDate ?? current.fromDate
  const toDate = input.toDate ?? current.toDate
  assertOrderedRange(fromDate, toDate)

  const unit = await requireUnit(db, unitId)
  const conflicts = filterOverlapping(
    await overlappingAssignments(db, unitId, fromDate, toDate, id),
    fromDate,
    toDate,
    id,
  )
  assertNoConflict(conflicts, unitId)

  const warnings = await roomTypeWarnings(db, current.bookingItemId, unit.roomTypeId)
  const [row] = await db
    .update(unitAssignments)
    .set({
      unitId,
      fromDate,
      toDate,
      notes: input.notes === undefined ? current.notes : (input.notes ?? null),
      updatedAt: new Date(),
    })
    .where(eq(unitAssignments.id, id))
    .returning()
  return { data: row, warnings }
}

export async function unassign(db: UnitsDb, id: string): Promise<AssignmentRow | null> {
  const [row] = await db.delete(unitAssignments).where(eq(unitAssignments.id, id)).returning()
  return row ?? null
}

export async function listAssignments(
  db: UnitsDb,
  query: AssignmentListQuery,
): Promise<AssignmentRow[]> {
  const clauses = []
  if (query.unitId) clauses.push(eq(unitAssignments.unitId, query.unitId))
  if (query.bookingItemId) clauses.push(eq(unitAssignments.bookingItemId, query.bookingItemId))
  // A date-range filter selects assignments that overlap [from, to).
  if (query.to) clauses.push(lt(unitAssignments.fromDate, query.to))
  if (query.from) clauses.push(gt(unitAssignments.toDate, query.from))
  return db
    .select()
    .from(unitAssignments)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(asc(unitAssignments.fromDate))
}
