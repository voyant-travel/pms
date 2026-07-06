/**
 * ARI authoring module — deployment-local (PLAN §4.5, Phase 1).
 *
 * Admin CRUD + calendar APIs that let a property manager fully author sellable
 * inventory in the upstream `@voyant-travel/accommodations` tables (room types,
 * bed configs, meal plans, rate plans + joins, daily rates, daily inventory)
 * without touching the DB. It owns no schema of its own — every table it writes
 * to is upstream-owned and already in the framework migration bundle — so this
 * directory has no `schema.ts` (nothing to migrate).
 *
 * Auto-discovered by `modulesFromGlob` in `src/api/composition.ts`; the module
 * name `pms/ari` mounts the admin routes at `/v1/admin/pms/ari/*`.
 *
 * Candidate for upstreaming into `accommodations` once the surface stabilizes
 * (PLAN §4.5): kept cleanly separated (services write via Drizzle against the
 * exported upstream tables) so the extraction stays cheap.
 */

import { defineDeploymentModule } from "@voyant-travel/framework"

import { ariAdminRoutes } from "./routes.js"

export default defineDeploymentModule({
  module: { name: "pms/ari" },
  adminRoutes: ariAdminRoutes,
})

export { expandDates, isoWeekday, MAX_RANGE_DAYS } from "./date-mask.js"
export type { AriDb } from "./db.js"
export {
  computeNightlyPrice,
  type MaterializedRateOp,
  materializePlan,
  type PricingAdjustmentType,
  type PricingRule,
  type PricingRuleKind,
  type RateBase,
  ruleMatches,
} from "./pricing-engine.js"
export {
  assembleCalendar,
  buildInventoryRows,
  buildRateRows,
  type CalendarGrid,
  type CalendarInventoryCell,
  type CalendarRateCell,
  type CalendarRatePlan,
  type CalendarRoomType,
} from "./service-calendar.js"
export type { ApplyResult, PreviewPair, PreviewResult } from "./service-pricing.js"
export * from "./validation.js"
