/**
 * CRUD + status transitions for housekeeping tasks (`pms_housekeeping_tasks`).
 * Cross-module refs (unit, property) are loose text columns, so existence is
 * validated here. Status transitions run through the PURE
 * `taskStatusTransitionBlockedReason` guard; completing a `clean`/`inspect` task
 * mirrors onto the unit's housekeeping room status (PLAN §4.3).
 */

import { ApiHttpError } from "@voyant-travel/hono"
import { properties } from "@voyant-travel/operations/places"
import { roomUnits } from "@voyant-travel/pms-units/schema"
import { type ListResponse, listResponse } from "@voyant-travel/types"
import { and, asc, count, desc, eq, lte, type SQL } from "drizzle-orm"
import type { HousekeepingDb } from "./db.js"
import { housekeepingTasks } from "./schema.js"
import { upsertRoomStatus } from "./service-room-status.js"
import {
  roomStatusForCompletedTask,
  type TaskStatus,
  taskStatusTransitionBlockedReason,
} from "./transitions.js"
import type {
  InsertTaskInput,
  TaskListQuery,
  TaskStatusInput,
  UpdateTaskInput,
} from "./validation.js"

type TaskRow = typeof housekeepingTasks.$inferSelect

/** Drop `undefined` keys so a PATCH only writes the fields the caller sent. */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

async function assertUnitExists(db: HousekeepingDb, unitId: string): Promise<void> {
  const [row] = await db
    .select({ id: roomUnits.id })
    .from(roomUnits)
    .where(eq(roomUnits.id, unitId))
    .limit(1)
  if (!row) {
    throw new ApiHttpError(`unit ${unitId} does not exist`, { status: 404, code: "not_found" })
  }
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

export async function listTasks(
  db: HousekeepingDb,
  query: TaskListQuery,
): Promise<ListResponse<TaskRow>> {
  const clauses: SQL[] = []
  if (query.propertyId) clauses.push(eq(housekeepingTasks.propertyId, query.propertyId))
  if (query.status) clauses.push(eq(housekeepingTasks.status, query.status))
  if (query.type) clauses.push(eq(housekeepingTasks.type, query.type))
  if (query.assigneeUserId) clauses.push(eq(housekeepingTasks.assigneeUserId, query.assigneeUserId))
  // `date` selects tasks due on or before that business date (the day's board).
  if (query.date) clauses.push(lte(housekeepingTasks.dueDate, query.date))
  const where = clauses.length ? and(...clauses) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(housekeepingTasks)
      .where(where)
      // Highest priority first, then oldest due date.
      .orderBy(desc(housekeepingTasks.priority), asc(housekeepingTasks.dueDate))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(housekeepingTasks).where(where),
  ])
  return listResponse(rows, { total, limit: query.limit, offset: query.offset })
}

export async function getTask(db: HousekeepingDb, id: string): Promise<TaskRow | null> {
  const [row] = await db
    .select()
    .from(housekeepingTasks)
    .where(eq(housekeepingTasks.id, id))
    .limit(1)
  return row ?? null
}

export async function createTask(db: HousekeepingDb, input: InsertTaskInput): Promise<TaskRow> {
  await assertPropertyExists(db, input.propertyId)
  await assertUnitExists(db, input.unitId)
  const [row] = await db
    .insert(housekeepingTasks)
    .values({
      unitId: input.unitId,
      propertyId: input.propertyId,
      type: input.type,
      priority: input.priority ?? 0,
      assigneeUserId: input.assigneeUserId ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      source: "manual",
      metadata: input.metadata ?? null,
    })
    .returning()
  return row
}

export async function updateTask(
  db: HousekeepingDb,
  id: string,
  input: UpdateTaskInput,
): Promise<TaskRow | null> {
  const existing = await getTask(db, id)
  if (!existing) return null
  const [row] = await db
    .update(housekeepingTasks)
    .set({ ...definedOnly(input), updatedAt: new Date() })
    .where(eq(housekeepingTasks.id, id))
    .returning()
  return row ?? null
}

export async function deleteTask(db: HousekeepingDb, id: string): Promise<TaskRow | null> {
  const [row] = await db.delete(housekeepingTasks).where(eq(housekeepingTasks.id, id)).returning()
  return row ?? null
}

/**
 * Transition a task's status. Completing a `clean`/`inspect` task mirrors onto
 * the unit's housekeeping room status (clean → `clean`, inspect → `inspected`).
 */
export async function setTaskStatus(
  db: HousekeepingDb,
  id: string,
  input: TaskStatusInput,
  userId?: string,
): Promise<TaskRow | null> {
  const existing = await getTask(db, id)
  if (!existing) return null

  const reason = taskStatusTransitionBlockedReason(existing.status as TaskStatus, input.status)
  if (reason) {
    throw new ApiHttpError(reason, { status: 409, code: "task_transition_blocked" })
  }

  const [row] = await db
    .update(housekeepingTasks)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(housekeepingTasks.id, id))
    .returning()
  if (!row) return null

  // On completion, reflect the task type onto the unit's room status.
  if (input.status === "done") {
    const nextRoomStatus = roomStatusForCompletedTask(row.type)
    if (nextRoomStatus) await upsertRoomStatus(db, row.unitId, nextRoomStatus, userId)
  }
  return row
}
