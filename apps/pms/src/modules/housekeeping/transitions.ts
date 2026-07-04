/**
 * PURE decision helpers for the housekeeping module (PLAN §4.3). Kept free of any
 * db so they are trivially unit-tested and are the single source of truth for the
 * task/room-status/readiness rules the services enforce.
 */

export type TaskStatus = "open" | "in_progress" | "done" | "skipped"
export type RoomStatus = "dirty" | "clean" | "inspected"

/** Allowed task status transitions (done/skipped are terminal). Same-state is a no-op. */
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["in_progress", "done", "skipped"],
  in_progress: ["done", "skipped"],
  done: [],
  skipped: [],
}

/**
 * PURE: reason a task cannot move `current → next`, or null when it may. Moving to
 * the same status is always allowed (idempotent no-op).
 */
export function taskStatusTransitionBlockedReason(
  current: TaskStatus,
  next: TaskStatus,
): string | null {
  if (current === next) return null
  if (TASK_TRANSITIONS[current].includes(next)) return null
  return `cannot move task from ${current} to ${next}`
}

/**
 * PURE: the room status a completed task implies, or null when completing this
 * task type has no room-status effect. Completing a `clean` task sets the unit
 * `clean`; completing an `inspect` task sets it `inspected`.
 */
export function roomStatusForCompletedTask(taskType: string): RoomStatus | null {
  if (taskType === "clean" || taskType === "turndown" || taskType === "deep_clean") return "clean"
  if (taskType === "inspect") return "inspected"
  return null
}

/**
 * PURE: reason a unit cannot move `current → next` room status, or null when it
 * may. Rule (PLAN §4.3): setting `inspected` requires the unit already be `clean`.
 * Dirty and clean are reachable from anywhere; same-state is a no-op.
 */
export function roomStatusTransitionBlockedReason(
  current: RoomStatus | null,
  next: RoomStatus,
): string | null {
  if (current === next) return null
  if (next === "inspected" && current !== "clean") {
    return "a unit must be clean before it can be inspected"
  }
  return null
}

export interface UnitReadiness {
  unitId: string
  /** Housekeeping status, or null when the unit has never been touched. */
  roomStatus: RoomStatus | null
  hasActiveMaintenanceBlock: boolean
  ready: boolean
  reasons: string[]
}

/**
 * PURE: is a unit ready to receive a guest on check-in? Ready iff it is
 * housekeeping-clean or inspected AND has no active maintenance block. Returns the
 * blocking reasons so the front-desk warning is descriptive.
 */
export function assessUnitReadiness(input: {
  unitId: string
  roomStatus: RoomStatus | null
  hasActiveMaintenanceBlock: boolean
}): UnitReadiness {
  const reasons: string[] = []
  if (input.roomStatus !== "clean" && input.roomStatus !== "inspected") {
    reasons.push(`room is ${input.roomStatus ?? "not yet cleaned"}`)
  }
  if (input.hasActiveMaintenanceBlock) reasons.push("unit has an active maintenance block")
  return {
    unitId: input.unitId,
    roomStatus: input.roomStatus,
    hasActiveMaintenanceBlock: input.hasActiveMaintenanceBlock,
    ready: reasons.length === 0,
    reasons,
  }
}
