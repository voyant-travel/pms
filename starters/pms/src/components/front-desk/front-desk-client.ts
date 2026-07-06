/**
 * Client-side data layer for the Front Desk admin pages. Thin wrappers over the
 * two deployment-local modules mounted at `/v1/admin/pms/units/*` and
 * `/v1/admin/pms/front-desk/*` (see `packages/units`, `packages/front-desk`),
 * plus the shared query keys so a mutation invalidates the right reads.
 *
 * Request/response shapes come from the modules' zod-inferred input types and
 * pure return types (`import type` only — no runtime coupling to the server-only
 * drizzle schema). Stored rows are those inputs plus the server-assigned id and
 * audit columns, mirroring `ari-client.ts`.
 */

import type {
  Boards,
  CheckInInput,
  CheckOutInput,
  CreateReservationResult,
  NoShowInput,
  ReservationAvailability,
  StayOpsRow,
  TapeChart,
} from "@voyant-travel/pms-front-desk"
import type {
  InsertAssignmentInput,
  InsertRoomUnitInput,
  RecomputeResult,
  UpdateAssignmentInput,
  UpdateRoomUnitInput,
} from "@voyant-travel/pms-units"
import { api } from "@/lib/api-client"

const UNITS = "/v1/admin/pms/units"
const FRONT_DESK = "/v1/admin/pms/front-desk"

// --- stored-row shapes -------------------------------------------------------

type Stored<T> = T & { id: string; createdAt?: string; updatedAt?: string }

export type RoomUnitStatus = InsertRoomUnitInput["status"]
export type RoomUnit = Stored<InsertRoomUnitInput> & { active: boolean }
export type UnitAssignment = Stored<InsertAssignmentInput> & { assignedBy: string | null }

interface ListEnvelope<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}
interface ItemEnvelope<T> {
  data: T
}
/** Assign/move/check-in etc. return the row plus non-blocking warnings. */
export interface WarningEnvelope<T> {
  data: T
  warnings: string[]
}

// --- query keys --------------------------------------------------------------

export const frontDeskKeys = {
  all: ["front-desk"] as const,
  tapeChart: (propertyId: string, from: string, to: string) =>
    [...frontDeskKeys.all, "tape-chart", propertyId, from, to] as const,
  boards: (propertyId: string, date: string) =>
    [...frontDeskKeys.all, "boards", propertyId, date] as const,
  units: (propertyId?: string) => [...frontDeskKeys.all, "units", propertyId ?? null] as const,
  assignments: (bookingItemId: string) =>
    [...frontDeskKeys.all, "assignments", bookingItemId] as const,
}

// --- new reservation (availability + create) ---------------------------------

export interface AvailabilityRequestBody {
  propertyId: string
  checkIn: string
  checkOut: string
  adults: number
  children: number
  rooms: number
}

export interface CreateReservationBody {
  propertyId: string
  checkIn: string
  checkOut: string
  occupancy: { adults: number; children: number; infants: number }
  selections: Array<{ roomTypeId: string; ratePlanId: string; quantity: number }>
  guest: { firstName: string; lastName: string; email?: string; phone?: string }
  notes?: string
}

export function getReservationAvailability(
  body: AvailabilityRequestBody,
): Promise<ItemEnvelope<ReservationAvailability>> {
  return api.post<ItemEnvelope<ReservationAvailability>>(
    `${FRONT_DESK}/reservations/availability`,
    body,
  )
}

export function createReservation(
  body: CreateReservationBody,
): Promise<ItemEnvelope<CreateReservationResult>> {
  return api.post<ItemEnvelope<CreateReservationResult>>(`${FRONT_DESK}/reservations`, body)
}

// --- room units --------------------------------------------------------------

export interface RoomUnitListQueryInput {
  propertyId?: string
  roomTypeId?: string
  status?: RoomUnitStatus
  active?: boolean
}

export function listRoomUnits(query: RoomUnitListQueryInput): Promise<ListEnvelope<RoomUnit>> {
  // `limit` is capped at 200 by the shared paginationSchema; requesting more
  // (e.g. 500) makes the route reject the query with a 400, which silently
  // breaks every caller that builds a unit id → number map (boards, unit list).
  const params = new URLSearchParams({ limit: "200", offset: "0" })
  if (query.propertyId) params.set("propertyId", query.propertyId)
  if (query.roomTypeId) params.set("roomTypeId", query.roomTypeId)
  if (query.status) params.set("status", query.status)
  if (query.active !== undefined) params.set("active", String(query.active))
  return api.get<ListEnvelope<RoomUnit>>(`${UNITS}/units?${params.toString()}`)
}
export function createRoomUnit(input: InsertRoomUnitInput): Promise<ItemEnvelope<RoomUnit>> {
  return api.post<ItemEnvelope<RoomUnit>>(`${UNITS}/units`, input)
}
export function updateRoomUnit(
  id: string,
  input: UpdateRoomUnitInput,
): Promise<ItemEnvelope<RoomUnit>> {
  return api.patch<ItemEnvelope<RoomUnit>>(`${UNITS}/units/${id}`, input)
}
export function deleteRoomUnit(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${UNITS}/units/${id}`)
}
export function recomputeInventory(
  roomTypeId: string,
  range: { from: string; to: string },
): Promise<ItemEnvelope<RecomputeResult>> {
  return api.post<ItemEnvelope<RecomputeResult>>(
    `${UNITS}/room-types/${roomTypeId}/recompute-inventory`,
    range,
  )
}

// --- unit assignments --------------------------------------------------------

export function listAssignmentsForBookingItem(
  bookingItemId: string,
): Promise<ItemEnvelope<UnitAssignment[]>> {
  return api.get<ItemEnvelope<UnitAssignment[]>>(
    `${UNITS}/assignments?bookingItemId=${encodeURIComponent(bookingItemId)}`,
  )
}
export function assignUnit(input: InsertAssignmentInput): Promise<WarningEnvelope<UnitAssignment>> {
  return api.post<WarningEnvelope<UnitAssignment>>(`${UNITS}/assignments`, input)
}
export function moveAssignment(
  id: string,
  input: UpdateAssignmentInput,
): Promise<WarningEnvelope<UnitAssignment>> {
  return api.patch<WarningEnvelope<UnitAssignment>>(`${UNITS}/assignments/${id}`, input)
}
export function unassign(id: string): Promise<{ success: true }> {
  return api.delete<{ success: true }>(`${UNITS}/assignments/${id}`)
}

// --- tape chart + boards (read) ----------------------------------------------

export function getTapeChart(
  propertyId: string,
  from: string,
  to: string,
): Promise<ItemEnvelope<TapeChart>> {
  return api.get<ItemEnvelope<TapeChart>>(
    `${FRONT_DESK}/tape-chart?propertyId=${propertyId}&from=${from}&to=${to}`,
  )
}
export function getBoards(propertyId: string, date: string): Promise<ItemEnvelope<Boards>> {
  return api.get<ItemEnvelope<Boards>>(`${FRONT_DESK}/boards?propertyId=${propertyId}&date=${date}`)
}

// --- in-stay operations (write) ----------------------------------------------

export function checkIn(input: CheckInInput): Promise<WarningEnvelope<StayOpsRow>> {
  return api.post<WarningEnvelope<StayOpsRow>>(`${FRONT_DESK}/check-in`, input)
}
export function checkOut(input: CheckOutInput): Promise<WarningEnvelope<StayOpsRow>> {
  return api.post<WarningEnvelope<StayOpsRow>>(`${FRONT_DESK}/check-out`, input)
}
export function noShow(input: NoShowInput): Promise<WarningEnvelope<StayOpsRow>> {
  return api.post<WarningEnvelope<StayOpsRow>>(`${FRONT_DESK}/no-show`, input)
}
