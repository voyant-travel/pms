/**
 * `pms-housekeeping` — housekeeping tasks + room status + maintenance blocks
 * (PLAN §4.3, Phase 4).
 *
 * Owns three deployment-local tables (`pms_housekeeping_tasks`,
 * `pms_unit_room_status`, `pms_maintenance_blocks` — see `schema.ts`). Auto-
 * generates cleaning tasks from the day's departures/stayovers, tracks the
 * dirty → clean → inspected unit lifecycle, and feeds active maintenance blocks
 * into the units module's serialized-inventory derivation (`blockedUnitIdsByDate`).
 * Also exposes `getUnitReadiness` — the seam front-desk check-in uses to warn on
 * not-ready units. Dependency direction is housekeeping → units, never reverse.
 *
 * Auto-discovered by `modulesFromGlob` in `src/api/composition.ts`; the module
 * name `pms/housekeeping` mounts admin routes at `/v1/admin/pms/housekeeping/*`.
 * Pure helpers are re-exported for the admin UI half + the cron job.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import { housekeepingAdminRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "pms/housekeeping" },
  adminRoutes: housekeepingAdminRoutes,
})

export type { HousekeepingDb } from "./db.js"
export {
  buildSourceKey,
  type GeneratedTaskKind,
  type GenerationPlan,
  type PlannedTask,
  planGeneratedTasks,
  type StayUnitRef,
} from "./generation.js"
export {
  buildBlockedUnitIdsByDate,
  type MaintenanceWindow,
  windowCoversDate,
} from "./maintenance-window.js"
export type {
  HousekeepingTaskRow,
  MaintenanceBlockRow,
  UnitRoomStatusRow,
} from "./schema.js"
export {
  type GenerationResult,
  generateTasksForDate,
  loadGenerationInput,
} from "./service-generation.js"
export {
  createMaintenanceBlock,
  type MaintenanceBlockResult,
} from "./service-maintenance.js"
export { getUnitReadiness, type UnitReadinessLookup } from "./service-readiness.js"
export { getUnitRoomStatuses, listRoomStatusForProperty } from "./service-room-status.js"
export {
  assessUnitReadiness,
  type RoomStatus,
  roomStatusForCompletedTask,
  roomStatusTransitionBlockedReason,
  type TaskStatus,
  taskStatusTransitionBlockedReason,
  type UnitReadiness,
} from "./transitions.js"
export * from "./validation.js"
