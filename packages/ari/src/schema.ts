/**
 * Deployment-local schema for the ARI *pricing* surface (Pricing rules &
 * seasons). This is the ONE part of the `pms/ari` module that owns tables of
 * its own — the rest of the module authors the upstream
 * `@voyant-travel/accommodations` inventory tables (room types, rate plans,
 * daily rates/inventory) and owns no schema.
 *
 * The goal: let a non-technical hotel manager express nightly pricing as named,
 * plain-language rules ("Summer 2026 +60%", "Weekend uplift +15%") layered on a
 * per (rate plan × room type) *base* price — instead of hand-painting calendar
 * cells. The pricing *engine* (`pricing-engine.ts`) is pure and materializes
 * these into the upstream `rate_plan_daily_rates` table via the existing
 * `bulkUpsertRates` bulk op; the day-level calendar remains the after-the-fact
 * exception/override surface.
 *
 * Two tables:
 *   - `pms_rate_base`     — the always-applicable "starting from" nightly price
 *                            for a (rate plan × room type) pair.
 *   - `pms_pricing_rules` — named season / weekday adjustments applied in
 *                            priority order on top of the base.
 *
 * Picked up automatically by `drizzle.deployment-migrations.config.ts` (its
 * `packages/<name>/src/schema.ts` glob) and migrated as a deployment source
 * AFTER the framework bundle. Cross-entity references (property, rate plan, room type)
 * are LOOSE typeid text columns — never `.references()` to an upstream table —
 * per the repo guardrail (loose refs + service-layer existence checks). This
 * module owns no intra-module FKs.
 *
 * TypeID prefixes (collision-checked against @voyant-travel/schema-kit PREFIXES
 * AND the PMS-local set runt/unas/stop/hkt/hkrs/mblk/folo/fpst/bizd/chae/chrz —
 * both unused): `rbas` (rate base), `prul` (pricing rule). Generated via
 * `newIdFromPrefix` because these prefixes are deployment-local and therefore
 * not in the closed upstream `PrefixKey` registry that `typeId()` requires.
 */

import { newIdFromPrefix } from "@voyant-travel/db/lib/typeid"
import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  boolean,
  date,
  index,
  integer,
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

// --- base rates --------------------------------------------------------------

/**
 * The always-applicable "starting from" nightly price for a (rate plan × room
 * type) pair. Every pricing rule layers on top of this. Currency is stored
 * verbatim (ISO-4217) to match the upstream rate-plan currency.
 */
export const rateBases = pgTable(
  "pms_rate_base",
  {
    id: localId("rbas"),
    propertyId: typeIdRef("property_id").notNull(),
    ratePlanId: typeIdRef("rate_plan_id").notNull(),
    roomTypeId: typeIdRef("room_type_id").notNull(),
    currency: text("currency").notNull(),
    baseAmountCents: integer("base_amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One base price per (rate plan × room type) pair.
    uniqueIndex("uidx_pms_rate_base_plan_room").on(table.ratePlanId, table.roomTypeId),
    // Loose-ref lookups (repo guardrail: index loose foreign columns).
    index("idx_pms_rate_base_property").on(table.propertyId),
  ],
)

// --- pricing rules -----------------------------------------------------------

/** A rule is either a date-range season or a recurring weekday uplift. */
export const pricingRuleKindEnum = pgEnum("pms_pricing_rule_kind", ["season", "weekday"])

/**
 * How a rule changes the running price:
 *   - `percent`  → multiply the running total by (1 + value/100).
 *   - `absolute` → add `value` cents to the running total.
 *   - `set`      → replace the running total with `value` cents.
 */
export const pricingRuleAdjustmentEnum = pgEnum("pms_pricing_rule_adjustment", [
  "percent",
  "absolute",
  "set",
])

export const pricingRules = pgTable(
  "pms_pricing_rules",
  {
    id: localId("prul"),
    propertyId: typeIdRef("property_id").notNull(),
    name: text("name").notNull(),
    kind: pricingRuleKindEnum("kind").notNull(),
    // Season rules require both bounds; weekday rules may be open-ended (either
    // or both null). Validation enforces the season-requires-both invariant.
    fromDate: date("from_date"),
    toDate: date("to_date"),
    // ISO weekdays (1=Mon … 7=Sun). Required for `weekday` kind; null otherwise.
    weekdays: integer("weekdays").array(),
    adjustmentType: pricingRuleAdjustmentEnum("adjustment_type").notNull(),
    adjustmentValue: integer("adjustment_value").notNull(),
    // Scope: null = applies to all rate plans / room types of the property.
    roomTypeIds: text("room_type_ids").array(),
    ratePlanIds: text("rate_plan_ids").array(),
    // Application order (ascending). Lower runs first.
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The dominant read: every active rule for a property, in application order.
    index("idx_pms_pricing_rules_property_priority").on(table.propertyId, table.priority),
  ],
)

export type RateBaseRow = typeof rateBases.$inferSelect
export type PricingRuleRow = typeof pricingRules.$inferSelect
