/**
 * Request validation schemas for the `pms-housekeeping` module. Single source of
 * truth for the shapes the routes parse via `parseJsonBody` / `parseQuery`;
 * re-exported from `index.ts` so the admin UI half can import the inferred types.
 */

import { paginationSchema } from "@voyant-travel/types"
import { z } from "zod"

/** A loose TypeID reference column (cross-entity refs are plain text). */
const typeid = z.string().min(1)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
const metadata = z.record(z.string(), z.unknown())

// --- enums (shared with the schema) ------------------------------------------

export const housekeepingTaskTypeSchema = z.enum(["clean", "inspect", "turndown", "deep_clean"])
export const housekeepingTaskStatusSchema = z.enum(["open", "in_progress", "done", "skipped"])
export const unitRoomStatusSchema = z.enum(["dirty", "clean", "inspected"])
export const maintenanceReasonSchema = z.enum(["maintenance", "renovation", "deep_clean", "other"])
export const maintenanceStatusSchema = z.enum(["active", "resolved", "cancelled"])
export const staffRoleSchema = z.enum([
  "housekeeper",
  "supervisor",
  "maintenance",
  "front_desk",
  "other",
])

// --- staff (non-login assignee records) --------------------------------------

export const insertStaffSchema = z.object({
  // NULL propertyId = a member available at every property.
  propertyId: typeid.nullish(),
  name: z.string().min(1),
  role: staffRoleSchema.default("housekeeper"),
  notes: z.string().nullish(),
})

export const updateStaffSchema = z.object({
  propertyId: typeid.nullish(),
  name: z.string().min(1).optional(),
  role: staffRoleSchema.optional(),
  active: z.boolean().optional(),
  notes: z.string().nullish(),
})

export const staffListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
})

// --- housekeeping tasks ------------------------------------------------------

export const insertTaskSchema = z.object({
  unitId: typeid,
  propertyId: typeid,
  type: housekeepingTaskTypeSchema.default("clean"),
  priority: z.number().int().optional(),
  assigneeStaffId: typeid.nullish(),
  dueDate: isoDate.nullish(),
  notes: z.string().nullish(),
  metadata: metadata.nullish(),
})

/** Update task fields (content). Status transitions go through the status route. */
export const updateTaskSchema = z.object({
  type: housekeepingTaskTypeSchema.optional(),
  priority: z.number().int().optional(),
  assigneeStaffId: typeid.nullish(),
  dueDate: isoDate.nullish(),
  notes: z.string().nullish(),
  metadata: metadata.nullish(),
})

/** Transition a task's status (open → in_progress → done | skipped). */
export const taskStatusSchema = z.object({
  status: housekeepingTaskStatusSchema,
})

export const taskListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  date: isoDate.optional(),
  status: housekeepingTaskStatusSchema.optional(),
  type: housekeepingTaskTypeSchema.optional(),
  assigneeStaffId: typeid.optional(),
})

// --- room status -------------------------------------------------------------

export const roomStatusListQuerySchema = z.object({
  propertyId: typeid,
})

export const setRoomStatusSchema = z.object({
  unitId: typeid,
  roomStatus: unitRoomStatusSchema,
})

// --- auto-generation ---------------------------------------------------------

export const generateQuerySchema = z.object({
  propertyId: typeid,
  date: isoDate,
})

// --- maintenance blocks ------------------------------------------------------

export const insertMaintenanceBlockSchema = z.object({
  unitId: typeid,
  propertyId: typeid,
  fromDate: isoDate,
  toDate: isoDate,
  reason: maintenanceReasonSchema.default("maintenance"),
  description: z.string().nullish(),
  metadata: metadata.nullish(),
})

export const updateMaintenanceBlockSchema = z.object({
  fromDate: isoDate.optional(),
  toDate: isoDate.optional(),
  reason: maintenanceReasonSchema.optional(),
  description: z.string().nullish(),
  status: maintenanceStatusSchema.optional(),
  metadata: metadata.nullish(),
})

export const maintenanceBlockListQuerySchema = paginationSchema.extend({
  propertyId: typeid.optional(),
  unitId: typeid.optional(),
  status: maintenanceStatusSchema.optional(),
})

// --- readiness (front-desk check-in gating) ----------------------------------

/** Comma-separated `unitIds` plus an optional `date` (defaults to today). */
export const readinessQuerySchema = z.object({
  unitIds: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  date: isoDate.optional(),
})

export type InsertStaffInput = z.infer<typeof insertStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
export type StaffListQuery = z.infer<typeof staffListQuerySchema>
export type StaffRole = z.infer<typeof staffRoleSchema>
export type InsertTaskInput = z.infer<typeof insertTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type TaskStatusInput = z.infer<typeof taskStatusSchema>
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
export type RoomStatusListQuery = z.infer<typeof roomStatusListQuerySchema>
export type SetRoomStatusInput = z.infer<typeof setRoomStatusSchema>
export type GenerateQuery = z.infer<typeof generateQuerySchema>
export type InsertMaintenanceBlockInput = z.infer<typeof insertMaintenanceBlockSchema>
export type UpdateMaintenanceBlockInput = z.infer<typeof updateMaintenanceBlockSchema>
export type MaintenanceBlockListQuery = z.infer<typeof maintenanceBlockListQuerySchema>
export type ReadinessQuery = z.infer<typeof readinessQuerySchema>
