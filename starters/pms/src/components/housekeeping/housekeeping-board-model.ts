/**
 * Pure view-model for the housekeeping board (PLAN §4.3). Two independent
 * concerns:
 *
 *   1. Task board — group the day's tasks into the Open / In progress /
 *      Done+Skipped columns and order each column (priority desc, then unit
 *      number asc, natural-numeric so "9" precedes "10").
 *   2. Room-status strip — merge the per-unit housekeeping status rows with the
 *      day's ACTIVE maintenance blocks so a wrench overlay and the "inspected"
 *      gating (server rule: a unit must be clean before it can be inspected) are
 *      decided in one dependency-free place.
 *
 * Free of React / fetch / drizzle and unit-tested. Only string-union types are
 * imported from the module barrel (`import type`, erased at build) so the browser
 * bundle never pulls the server-only schema — mirrors `boards-model.ts`.
 */

import type { RoomStatus, TaskStatus } from "@voyant-travel/pms-housekeeping"

// --- task board --------------------------------------------------------------

/** The three board columns. `done` and `skipped` share the terminal column. */
export type TaskBucket = "open" | "in_progress" | "closed"

export const TASK_BUCKETS: readonly TaskBucket[] = ["open", "in_progress", "closed"]

/** Every task type the board renders (mirrors `housekeepingTaskTypeSchema`). */
export type TaskType = "clean" | "inspect" | "turndown" | "deep_clean"

/** Structural subset of a stored task the board needs (no audit/Date columns). */
export interface TaskLike {
  id: string
  unitId: string
  type: TaskType
  status: TaskStatus
  priority: number
  assigneeStaffId: string | null
  source: "auto" | "manual"
  dueDate: string | null
  notes: string | null
}

/** A task decorated with its resolved unit number + assignee name for display. */
export interface TaskView extends TaskLike {
  unitNumber: string
  /** Resolved staff name for `assigneeStaffId`, or null when unassigned. */
  assigneeName: string | null
}

/** Which board column a task status belongs to. */
export function taskBucket(status: TaskStatus): TaskBucket {
  if (status === "open") return "open"
  if (status === "in_progress") return "in_progress"
  return "closed"
}

/**
 * Decorate a task with its unit number (falls back to the raw id) and its
 * assignee's staff name (null when unassigned or unresolved).
 */
export function toTaskView(
  task: TaskLike,
  unitNumberOf: (unitId: string) => string,
  staffNameOf: (staffId: string) => string | undefined = () => undefined,
): TaskView {
  return {
    ...task,
    unitNumber: unitNumberOf(task.unitId) || task.unitId,
    assigneeName: task.assigneeStaffId ? (staffNameOf(task.assigneeStaffId) ?? null) : null,
  }
}

/** Column ordering: highest priority first, then unit number ascending (numeric). */
export function compareTaskViews(a: TaskView, b: TaskView): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.unitNumber.localeCompare(b.unitNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

/** Group tasks into board columns, each sorted by {@link compareTaskViews}. */
export function groupTasks(tasks: readonly TaskView[]): Record<TaskBucket, TaskView[]> {
  const groups: Record<TaskBucket, TaskView[]> = { open: [], in_progress: [], closed: [] }
  for (const task of tasks) groups[taskBucket(task.status)].push(task)
  for (const bucket of TASK_BUCKETS) groups[bucket].sort(compareTaskViews)
  return groups
}

// PURE mirrors of the server `taskStatusTransitionBlockedReason` allow-set, so
// the per-row action buttons gate without a round-trip.

/** A task may be started only from `open`. */
export function canStartTask(status: TaskStatus): boolean {
  return status === "open"
}

/** A task may be completed / skipped from `open` or `in_progress`. */
export function canCloseTask(status: TaskStatus): boolean {
  return status === "open" || status === "in_progress"
}

// --- room-status strip -------------------------------------------------------

/** Structural subset of a maintenance block used to compute the day's overlay. */
export interface MaintenanceOverlaySource {
  unitId: string
  status: "active" | "resolved" | "cancelled"
  fromDate: string
  toDate: string
}

/**
 * Unit ids with an ACTIVE maintenance block covering `date` (inclusive range).
 * PURE — the same active + [from,to] rule the server uses for its blocked map.
 */
export function blockedUnitIdsOnDate(
  blocks: readonly MaintenanceOverlaySource[],
  date: string,
): Set<string> {
  const blocked = new Set<string>()
  for (const block of blocks) {
    if (block.status === "active" && block.fromDate <= date && date <= block.toDate) {
      blocked.add(block.unitId)
    }
  }
  return blocked
}

/** A unit joined with its housekeeping status (as returned by `GET /room-status`). */
export interface RoomStatusInput {
  unitId: string
  unitNumber: string
  roomTypeId: string
  floor: string | null
  roomStatus: RoomStatus | null
}

/** A room-status cell with the maintenance overlay + inspect-gating resolved. */
export interface RoomStatusCell extends RoomStatusInput {
  underMaintenance: boolean
  /** `inspected` is only reachable from `clean` (mirrors the server 409). */
  canInspect: boolean
}

/** Merge units × status rows × the day's active blocks into display cells. */
export function mergeRoomStatus(
  units: readonly RoomStatusInput[],
  blocks: readonly MaintenanceOverlaySource[],
  date: string,
): RoomStatusCell[] {
  const blocked = blockedUnitIdsOnDate(blocks, date)
  return units.map((unit) => ({
    ...unit,
    underMaintenance: blocked.has(unit.unitId),
    canInspect: unit.roomStatus === "clean",
  }))
}

/**
 * PURE mirror of the server `roomStatusTransitionBlockedReason`: reason a unit
 * cannot move `current → next`, or null when allowed. Same-state is a no-op.
 */
export function roomStatusDisabledReason(
  current: RoomStatus | null,
  next: RoomStatus,
): string | null {
  if (current === next) return null
  if (next === "inspected" && current !== "clean") {
    return "Room must be clean before it can be inspected"
  }
  return null
}
