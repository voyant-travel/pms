/**
 * Deployment-local schema for the `pms-housekeeping` module (PLAN §4.3, Phase 4).
 *
 * Owns the housekeeping + maintenance operating tables the framework's
 * `@voyant-travel/accommodations` package deliberately left out (they were
 * deleted with the hospitality package when the resale boundary was drawn):
 *
 *   - `pms_housekeeping_tasks` — a cleaning/inspection task against one unit.
 *   - `pms_unit_room_status`   — one row per unit tracking its housekeeping
 *                                 lifecycle (dirty → clean → inspected).
 *   - `pms_maintenance_blocks` — a unit out of service over a date range, which
 *                                 reduces derived serialized capacity (feeds the
 *                                 units module's `blockedUnitIdsByDate` hook).
 *
 * Picked up by `drizzle.deployment-migrations.config.ts` (glob
 * `./src/modules/<name>/schema.ts`) and migrated as a deployment source AFTER the
 * framework bundle. Cross-module references (unit, property, booking item, user)
 * are LOOSE typeid text columns — never `.references()` to an upstream or
 * sibling-module table — per the repo guardrail (loose refs + service-layer
 * existence checks). This module owns no intra-module FKs.
 *
 * TypeID prefixes (checked against @voyant-travel/schema-kit PREFIXES — all
 * unused): `hkt` (housekeeping task), `hkrs` (housekeeping room status), `mblk`
 * (maintenance block), `hstf` (housekeeping staff). Generated via
 * `newIdFromPrefix` because these prefixes are deployment-local and therefore not
 * in the closed upstream `PrefixKey` registry that `typeId()` requires.
 *
 * `pms_staff` are NON-LOGIN operational staff records owned by this module — they
 * are the assignee pool for tasks (a task's `assignee_staff_id` is a loose ref to
 * a `pms_staff` row, NOT a Better Auth user). Staff are soft-deleted (`active`)
 * rather than hard-deleted so referencing tasks keep a resolvable name.
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

/** Deployment-local primary key: text + auto-generated TypeID from a custom prefix. */
const localId = (prefix: string) =>
  text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => newIdFromPrefix(prefix))

// --- staff (non-login assignee records) --------------------------------------

/** Operational role of a staff member (drives the board's assignee picker). */
export const staffRoleEnum = pgEnum("pms_staff_role", [
  "housekeeper",
  "supervisor",
  "maintenance",
  "front_desk",
  "other",
])

export const staff = pgTable(
  "pms_staff",
  {
    id: localId("hstf"),
    // Loose ref to the property the member works at. NULL = all properties.
    propertyId: typeIdRef("property_id"),
    name: text("name").notNull(),
    role: staffRoleEnum("role").notNull().default("housekeeper"),
    // Soft-delete flag: deactivated staff drop out of the assignee picker but
    // keep resolving names on tasks that already reference them.
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pms_staff_property").on(table.propertyId),
    index("idx_pms_staff_active").on(table.active),
  ],
)

// --- housekeeping tasks ------------------------------------------------------

/** What kind of housekeeping work the task represents. */
export const housekeepingTaskTypeEnum = pgEnum("pms_housekeeping_task_type", [
  "clean",
  "inspect",
  "turndown",
  "deep_clean",
])

/** Task lifecycle: open → in_progress → done | skipped (done/skipped terminal). */
export const housekeepingTaskStatusEnum = pgEnum("pms_housekeeping_task_status", [
  "open",
  "in_progress",
  "done",
  "skipped",
])

/** How the task came to exist — `auto` (departure/stayover generation) or `manual`. */
export const housekeepingTaskSourceEnum = pgEnum("pms_housekeeping_task_source", ["auto", "manual"])

export const housekeepingTasks = pgTable(
  "pms_housekeeping_tasks",
  {
    id: localId("hkt"),
    // Loose cross-module refs (the units live in the sibling `pms-units` module).
    unitId: typeIdRef("unit_id").notNull(),
    propertyId: typeIdRef("property_id").notNull(),
    type: housekeepingTaskTypeEnum("type").notNull().default("clean"),
    status: housekeepingTaskStatusEnum("status").notNull().default("open"),
    priority: integer("priority").notNull().default(0),
    // Loose ref to the `pms_staff` member the task is assigned to (NOT an auth
    // user). Nullable (unassigned).
    assigneeStaffId: typeIdRef("assignee_staff_id"),
    dueDate: date("due_date"),
    source: housekeepingTaskSourceEnum("source").notNull().default("manual"),
    // Deterministic idempotency key for auto-generated tasks (e.g. `dep:<unit>:<date>`).
    // NULL for manual tasks; UNIQUE allows many NULLs in Postgres, so manual rows
    // never collide while auto rows dedupe via ON CONFLICT DO NOTHING.
    sourceKey: text("source_key"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotency: one auto task per deterministic source key.
    uniqueIndex("uidx_pms_housekeeping_tasks_source_key").on(table.sourceKey),
    // Board/list filters (property + due date + status) and per-unit lookups.
    index("idx_pms_housekeeping_tasks_property_due").on(table.propertyId, table.dueDate),
    index("idx_pms_housekeeping_tasks_unit").on(table.unitId),
    index("idx_pms_housekeeping_tasks_status").on(table.status),
    index("idx_pms_housekeeping_tasks_assignee").on(table.assigneeStaffId),
  ],
)

// --- per-unit housekeeping room status --------------------------------------

/** Housekeeping lifecycle state of a physical unit. Distinct from the physical
 *  `pms_room_unit_status` (available/out_of_order/...) owned by the units module. */
export const unitRoomStatusEnum = pgEnum("pms_housekeeping_room_status", [
  "dirty",
  "clean",
  "inspected",
])

export const unitRoomStatus = pgTable(
  "pms_unit_room_status",
  {
    id: localId("hkrs"),
    // One row per unit (loose ref, UNIQUE) — upserted on every status change.
    unitId: typeIdRef("unit_id").notNull(),
    roomStatus: unitRoomStatusEnum("room_status").notNull().default("dirty"),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastChangedBy: typeIdRef("last_changed_by"),
  },
  (table) => [uniqueIndex("uidx_pms_unit_room_status_unit").on(table.unitId)],
)

// --- maintenance blocks ------------------------------------------------------

/** Why a unit is blocked from service. */
export const maintenanceReasonEnum = pgEnum("pms_maintenance_reason", [
  "maintenance",
  "renovation",
  "deep_clean",
  "other",
])

/** Block lifecycle. Only `active` blocks reduce derived sellable capacity. */
export const maintenanceStatusEnum = pgEnum("pms_maintenance_status", [
  "active",
  "resolved",
  "cancelled",
])

export const maintenanceBlocks = pgTable(
  "pms_maintenance_blocks",
  {
    id: localId("mblk"),
    unitId: typeIdRef("unit_id").notNull(),
    propertyId: typeIdRef("property_id").notNull(),
    // Inclusive calendar-date range: the unit is blocked on every date in
    // [from_date, to_date] (unlike half-open stays — a maintenance day is a
    // full day out of service).
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    reason: maintenanceReasonEnum("reason").notNull().default("maintenance"),
    description: text("description"),
    status: maintenanceStatusEnum("status").notNull().default("active"),
    createdBy: typeIdRef("created_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Supports the active-block overlap query (unit + date range) that builds
    // the `blockedUnitIdsByDate` map for the inventory recompute.
    index("idx_pms_maintenance_blocks_unit_dates").on(table.unitId, table.fromDate, table.toDate),
    index("idx_pms_maintenance_blocks_property").on(table.propertyId),
    index("idx_pms_maintenance_blocks_status").on(table.status),
  ],
)

export type StaffRow = typeof staff.$inferSelect
export type HousekeepingTaskRow = typeof housekeepingTasks.$inferSelect
export type UnitRoomStatusRow = typeof unitRoomStatus.$inferSelect
export type MaintenanceBlockRow = typeof maintenanceBlocks.$inferSelect
