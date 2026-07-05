/**
 * Deployment-local schema for the `pms-units` module (PLAN §4.1, Phase 3).
 *
 * Owns the physical room inventory the framework's `@voyant-travel/accommodations`
 * package deliberately left out (units were deleted with the hospitality package
 * when the resale boundary was drawn). Two tables:
 *
 *   - `pms_room_units`        — one physical, sellable room (serialized inventory).
 *   - `pms_unit_assignments`  — a booking item ↔ unit occupancy over a date range.
 *
 * Picked up by `drizzle.deployment-migrations.config.ts` (glob
 * `./src/modules/<name>/schema.ts`) and migrated as a deployment source AFTER the
 * framework bundle. Cross-module references (property, room type, booking item)
 * are LOOSE typeid text columns — never `.references()` to an upstream table —
 * per the repo guardrail (loose refs + service-layer existence checks). The one
 * real FK is intra-module (`unit_assignments.unit_id → room_units.id`).
 *
 * TypeID prefixes (checked against @voyant-travel/schema-kit PREFIXES — both
 * unused): `runt` (room unit), `unas` (unit assignment). IDs are generated via
 * `newIdFromPrefix` because these prefixes are deployment-local and therefore not
 * in the closed upstream `PrefixKey` registry that `typeId()` requires.
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
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

/**
 * Physical status of a unit. Occupancy is NOT stored here — it is derived from
 * `pms_unit_assignments` at read time (a unit is "occupied" on a date iff an
 * assignment covers it). Only physical availability lives on the row.
 */
export const roomUnitStatusEnum = pgEnum("pms_room_unit_status", [
  "available",
  "out_of_order",
  "out_of_service",
])

export const roomUnits = pgTable(
  "pms_room_units",
  {
    id: localId("runt"),
    propertyId: typeIdRef("property_id").notNull(),
    roomTypeId: typeIdRef("room_type_id").notNull(),
    unitNumber: text("unit_number").notNull(),
    name: text("name"),
    floor: text("floor"),
    wing: text("wing"),
    status: roomUnitStatusEnum("status").notNull().default("available"),
    // Loose self-reference to a connecting unit (e.g. adjoining rooms). Nullable.
    connectingUnitId: typeIdRef("connecting_unit_id"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A unit number is unique within a property.
    uniqueIndex("uidx_pms_room_units_property_number").on(table.propertyId, table.unitNumber),
    // Loose-ref lookups (repo guardrail: index loose foreign columns).
    index("idx_pms_room_units_room_type").on(table.roomTypeId),
    index("idx_pms_room_units_property").on(table.propertyId),
  ],
)

export const unitAssignments = pgTable(
  "pms_unit_assignments",
  {
    id: localId("unas"),
    // Loose cross-module ref to the upstream `booking_items` (stay item).
    bookingItemId: typeIdRef("booking_item_id").notNull(),
    // Intra-module FK: dropping a unit removes its occupancy history.
    unitId: typeIdRef("unit_id")
      .notNull()
      .references((): AnyPgColumn => roomUnits.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    // The staff userId that made the assignment (loose ref to auth user). Nullable.
    assignedBy: typeIdRef("assigned_by"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Supports the per-unit overlap query (unit_id + date range).
    index("idx_pms_unit_assignments_unit_dates").on(table.unitId, table.fromDate, table.toDate),
    index("idx_pms_unit_assignments_booking_item").on(table.bookingItemId),
  ],
)

export type RoomUnitRow = typeof roomUnits.$inferSelect
export type UnitAssignmentRow = typeof unitAssignments.$inferSelect
