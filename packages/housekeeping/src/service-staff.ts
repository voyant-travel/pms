/**
 * CRUD for `pms_staff` — the NON-LOGIN operational staff records this module owns
 * as the assignee pool for housekeeping tasks (PLAN §4.3). Staff are deliberately
 * NOT coupled to Better Auth users: they are simple named records with a role and
 * an optional property scope.
 *
 * Deactivation is a soft delete (`active = false`), never a hard delete: a task
 * may still reference a staff row via its loose `assignee_staff_id`, and the board
 * resolves the name from here — dropping the row would leave a dangling id. There
 * is therefore no delete route; deactivate + reactivate via PATCH `active`.
 */

import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, eq, type SQL } from "drizzle-orm"
import type { HousekeepingDb } from "./db.js"
import { type StaffRow, staff } from "./schema.js"
import type { InsertStaffInput, StaffListQuery, UpdateStaffInput } from "./validation.js"

/** Drop `undefined` keys so a PATCH only writes the fields the caller sent. */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

export async function listStaff(
  db: HousekeepingDb,
  query: StaffListQuery,
): Promise<ListResponse<StaffRow>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(staff.propertyId, query.propertyId))
  if (query.active !== undefined) clauses.push(eq(staff.active, query.active))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(staff)
      .where(where)
      .orderBy(asc(staff.name))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(staff).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getStaff(db: HousekeepingDb, id: string): Promise<StaffRow | null> {
  const [row] = await db.select().from(staff).where(eq(staff.id, id)).limit(1)
  return row ?? null
}

export async function createStaff(db: HousekeepingDb, input: InsertStaffInput): Promise<StaffRow> {
  const [row] = await db
    .insert(staff)
    .values({
      propertyId: input.propertyId ?? null,
      name: input.name,
      role: input.role,
      notes: input.notes ?? null,
    })
    .returning()
  return row
}

export async function updateStaff(
  db: HousekeepingDb,
  id: string,
  input: UpdateStaffInput,
): Promise<StaffRow | null> {
  const existing = await getStaff(db, id)
  if (!existing) return null
  const [row] = await db
    .update(staff)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(staff.id, id))
    .returning()
  return row ?? null
}

/** Soft-delete: flip `active = false` (there is no hard-delete route). */
export async function deactivateStaff(db: HousekeepingDb, id: string): Promise<StaffRow | null> {
  const [row] = await db
    .update(staff)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(staff.id, id))
    .returning()
  return row ?? null
}
