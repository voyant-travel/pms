/**
 * `pms-units` — physical room inventory + unit assignment (PLAN §4.1, Phase 3).
 *
 * Owns two deployment-local tables (`pms_room_units`, `pms_unit_assignments` —
 * see `schema.ts`) and derives the upstream `room_type_daily_inventory` capacity
 * for `serialized` room types from the count of active, available units (see
 * `service-inventory.ts`). Auto-discovered by `modulesFromGlob` in
 * `src/api/composition.ts`; the module name `pms/units` mounts admin routes at
 * `/v1/admin/pms/units/*`. Pure helpers are re-exported for the admin UI half.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import { unitsAdminRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "pms/units" },
  adminRoutes: unitsAdminRoutes,
})

export { addDays, expandDates, MAX_RANGE_DAYS, rangesOverlap } from "./dates.js"
export type { UnitsDb } from "./db.js"
export type { RoomUnitRow, UnitAssignmentRow } from "./schema.js"
export {
  type AssignmentResult,
  type DateInterval,
  filterOverlapping,
} from "./service-assignments.js"
export {
  type BlockedUnitIdsByDate,
  buildInventoryRowsFromCapacities,
  computeDailyCapacities,
  DEFAULT_DERIVATION_HORIZON_DAYS,
  isSellableUnit,
  type RecomputeResult,
  recomputeDailyInventory,
  recomputeInventoryForRoomTypeChange,
  type UnitForDerivation,
} from "./service-inventory.js"
export * from "./validation.js"
