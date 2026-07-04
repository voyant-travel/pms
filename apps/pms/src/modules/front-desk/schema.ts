/**
 * Deployment-local schema for the `pms-front-desk` module (PLAN §4.2, Phase 3).
 *
 * `pms_stay_ops` is a 1:1 OPERATIONAL extension on the upstream stay booking item
 * (`stay_booking_items`, in `@voyant-travel/accommodations`). The upstream row
 * carries the reservation facts (dates, pax, rate plan, `reserved|cancelled|
 * no_show` status); this row carries the front-desk operational overlay: where in
 * the arrival→in-house→departure lifecycle the stay is, timestamps, and the
 * registration card. We never widen the upstream table (extension-table pattern,
 * PLAN §3.3) — `booking_item_id` is a loose typeid ref with a UNIQUE index (1:1).
 *
 * TypeID prefix `stop` (front-desk STay OPs) — checked against
 * @voyant-travel/schema-kit PREFIXES: unused. Generated via `newIdFromPrefix`
 * because the prefix is deployment-local (not in the closed `PrefixKey` registry).
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

const localId = (prefix: string) =>
  text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => newIdFromPrefix(prefix))

/**
 * Where the stay sits in the front-desk lifecycle. Distinct from the upstream
 * reservation `status` enum (`reserved|cancelled|no_show`) — this is the ops
 * overlay: `expected` (booked, not arrived) → `checked_in` → `checked_out`, with
 * `no_show` mirrored from a front-desk no-show action.
 */
export const stayOpsStatusEnum = pgEnum("pms_stay_ops_status", [
  "expected",
  "checked_in",
  "checked_out",
  "no_show",
])

export const stayOps = pgTable(
  "pms_stay_ops",
  {
    id: localId("stop"),
    // Loose 1:1 ref to the upstream `stay_booking_items.booking_item_id`.
    bookingItemId: typeIdRef("booking_item_id").notNull(),
    opsStatus: stayOpsStatusEnum("ops_status").notNull().default("expected"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    // Registration card fields (optional).
    docType: text("doc_type"),
    docNumber: text("doc_number"),
    notes: text("notes"),
    checkedInBy: typeIdRef("checked_in_by"),
    checkedOutBy: typeIdRef("checked_out_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 1:1 with the upstream stay item.
    uniqueIndex("uidx_pms_stay_ops_booking_item").on(table.bookingItemId),
    index("idx_pms_stay_ops_status").on(table.opsStatus),
  ],
)

export type StayOpsRow = typeof stayOps.$inferSelect
