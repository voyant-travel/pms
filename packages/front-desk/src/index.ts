/**
 * `pms-front-desk` — daily front-desk operations (PLAN §4.2, Phase 3).
 *
 * Owns `pms_stay_ops` (1:1 operational overlay on upstream `stay_booking_items`;
 * see `schema.ts`) and reads across upstream `stay_booking_items` + `booking_items`
 * + `bookings` (plus local `pms_unit_assignments`) to build the tape chart and the
 * arrivals/departures/in-house boards. Check-in / check-out / no-show flip the ops
 * overlay; no-show also mirrors onto the upstream reservation status.
 *
 * Auto-discovered by `modulesFromGlob` in `src/api/composition.ts`; the module
 * name `pms/front-desk` mounts admin routes at `/v1/admin/pms/front-desk/*`. Pure
 * assemblers/guards are re-exported for the admin UI half.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import { createFrontDeskAdminRoutes } from "./routes.js"
import type { FrontDeskModuleDeps } from "./service-reservations.js"

/**
 * Build the `pms/front-desk` module with the deployment's injected write path.
 * The "New reservation" create route persists through the app-side
 * `persistStayBooking` seam, so — like `createChannelsModule` — the deployment
 * passes it in rather than this package importing it.
 */
export function createFrontDeskModule(deps: FrontDeskModuleDeps) {
  return defineDeploymentModule({
    module: { name: "pms/front-desk" },
    adminRoutes: createFrontDeskAdminRoutes(deps),
  })
}

export type { FrontDeskDb } from "./db.js"
export type { StayOpsRow } from "./schema.js"
export {
  type BoardEntry,
  type Boards,
  type ClassifyBoardsInput,
  classifyBoards,
} from "./service-boards.js"
export {
  type CheckInOptions,
  checkInBlockedReason,
  checkOutBlockedReason,
  type OpsResult,
  type UnitReadinessInfo,
  type UnitReadinessLookup,
} from "./service-ops.js"
export type {
  AssignmentContext,
  StayContext,
  StayPicture,
} from "./service-reads.js"
export {
  type AvailabilityOffer,
  assembleAvailability,
  type CreateReservationResult,
  createReservation,
  type FrontDeskModuleDeps,
  fitsPartyOccupancy,
  getReservationAvailability,
  nightsBetween,
  type PersistStayBookingFn,
  type PersistStayBookingResult,
  type ReservationAvailability,
  type ReservationNightlyRate,
  type ReservationRatePlanOffer,
  type ReservationRoomTypeAvailability,
  type RoomTypeMeta,
} from "./service-reservations.js"
export {
  assembleTapeChart,
  type TapeChart,
  type TapeChartCell,
  type TapeChartGroup,
  type TapeChartUnit,
  type TapeChartUnitRow,
  type UnassignedArrival,
} from "./service-tape-chart.js"
export * from "./validation.js"
