/**
 * Request validation schemas for the `pms-units` module. Single source of truth
 * for the shapes the routes parse via `parseJsonBody` / `parseQuery`; re-exported
 * from `index.ts` so the admin UI half can import the inferred types.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

/** A loose TypeID reference column (cross-entity refs are plain text). */
const typeid = z.string().min(1)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const metadata = z.record(z.string(), z.unknown())

/** Query-string boolean: only the literal strings `"true"` / `"false"`. */
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true")

/** Physical unit status — occupancy is derived from assignments, never stored. */
export const roomUnitStatusSchema = z.enum(["available", "out_of_order", "out_of_service"])

// --- room units --------------------------------------------------------------

export const insertRoomUnitSchema = z.object({
  propertyId: typeid,
  roomTypeId: typeid,
  unitNumber: z.string().min(1),
  name: z.string().nullish(),
  floor: z.string().nullish(),
  wing: z.string().nullish(),
  status: roomUnitStatusSchema.default("available"),
  connectingUnitId: typeid.nullish(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
  metadata: metadata.nullish(),
})
// propertyId is immutable — a unit never moves property (roomTypeId may change).
export const updateRoomUnitSchema = insertRoomUnitSchema.partial().omit({ propertyId: true })

export const roomUnitListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  roomTypeId: typeid.optional(),
  status: roomUnitStatusSchema.optional(),
  active: booleanQuery.optional(),
})

// --- unit assignments --------------------------------------------------------

export const insertAssignmentSchema = z.object({
  bookingItemId: typeid,
  unitId: typeid,
  fromDate: isoDate,
  toDate: isoDate,
  notes: z.string().nullish(),
})
/** Move = change the unit and/or the date range of an existing assignment. */
export const updateAssignmentSchema = z.object({
  unitId: typeid.optional(),
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  notes: z.string().nullish(),
})

export const assignmentListQuerySchema = z.object({
  unitId: typeid.optional(),
  bookingItemId: typeid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})

// --- serialized-inventory derivation -----------------------------------------

/** Recompute the derived daily capacity for a serialized room type over a range. */
export const recomputeInventorySchema = z.object({
  from: isoDate,
  to: isoDate,
})

export type InsertRoomUnitInput = z.infer<typeof insertRoomUnitSchema>
export type UpdateRoomUnitInput = z.infer<typeof updateRoomUnitSchema>
export type RoomUnitListQuery = z.infer<typeof roomUnitListQuerySchema>
export type InsertAssignmentInput = z.infer<typeof insertAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>
export type RecomputeInventoryInput = z.infer<typeof recomputeInventorySchema>
