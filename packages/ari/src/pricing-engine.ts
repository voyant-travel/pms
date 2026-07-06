/**
 * Pure pricing engine for the ARI Pricing surface (rules & seasons).
 *
 * A non-technical hotel manager sets a *base* nightly price per (rate plan ×
 * room type) pair, then layers named rules on top — a `season` (date range) or a
 * `weekday` recurrence — each of which nudges the running price. This module is
 * the deterministic, timezone-free core that turns (base + rules + date) into a
 * concrete nightly cents value, and expands a booking horizon into the bulk
 * upsert rows that materialize into the upstream `rate_plan_daily_rates` table.
 *
 * Deliberately pure and dependency-light (only the pure date helpers) so the
 * stacking/priority/scope/rounding semantics are exhaustively unit-testable
 * without a database.
 *
 * Stacking semantics (the contract the UI copy promises):
 *   - Rules apply in ascending `priority` order (ties keep input order).
 *   - `set`      replaces the running total with the rule's cents value.
 *   - `percent`  multiplies the running total by (1 + value/100).
 *   - `absolute` adds the rule's cents value to the running total.
 *   - Each step rounds to whole cents and is floored at 0 (never negative).
 */

import { expandDates, isoWeekday, parseIsoDate } from "./date-mask.js"

export type PricingRuleKind = "season" | "weekday"
export type PricingAdjustmentType = "percent" | "absolute" | "set"

/**
 * The engine-facing shape of a pricing rule. Mirrors the stored row but with
 * plain arrays/strings so it is trivially constructable in tests. `null` scope
 * arrays mean "applies to every rate plan / room type of the property".
 */
export interface PricingRule {
  kind: PricingRuleKind
  fromDate: string | null
  toDate: string | null
  weekdays: number[] | null
  adjustmentType: PricingAdjustmentType
  adjustmentValue: number
  ratePlanIds: string[] | null
  roomTypeIds: string[] | null
  priority: number
  active: boolean
}

/** The base price for one (rate plan × room type) pair. */
export interface RateBase {
  ratePlanId: string
  roomTypeId: string
  currency: string
  baseAmountCents: number
}

/** A single-date bulk op, shape-compatible with `bulkUpsertRates` operations. */
export interface MaterializedRateOp {
  ratePlanId: string
  roomTypeId: string
  from: string
  to: string
  sellCurrency: string
  sellAmountCents: number
}

/** Does a rule apply to this (plan × room) pair on this date? */
export function ruleMatches(
  rule: PricingRule,
  ratePlanId: string,
  roomTypeId: string,
  isoDate: string,
  weekday: number,
): boolean {
  if (!rule.active) return false
  // Scope: a null array = all; otherwise the id must be listed.
  if (rule.ratePlanIds && !rule.ratePlanIds.includes(ratePlanId)) return false
  if (rule.roomTypeIds && !rule.roomTypeIds.includes(roomTypeId)) return false
  // Date bounds (ISO dates sort lexically, so string compare is correct).
  // Season rules always carry both bounds; weekday rules may be open-ended.
  if (rule.fromDate && isoDate < rule.fromDate) return false
  if (rule.toDate && isoDate > rule.toDate) return false
  // Weekday recurrence only constrains `weekday` kind.
  if (rule.kind === "weekday") {
    if (!rule.weekdays || rule.weekdays.length === 0) return false
    if (!rule.weekdays.includes(weekday)) return false
  }
  return true
}

/** Apply one adjustment to the running cents total, rounding + flooring at 0. */
function applyAdjustment(running: number, rule: PricingRule): number {
  let next: number
  switch (rule.adjustmentType) {
    case "set":
      next = rule.adjustmentValue
      break
    case "absolute":
      next = running + rule.adjustmentValue
      break
    case "percent":
      next = running * (1 + rule.adjustmentValue / 100)
      break
  }
  return Math.max(0, Math.round(next))
}

/**
 * Compute the nightly price (cents) for one (plan × room) base on one date by
 * folding every matching rule in ascending priority order over the base amount.
 */
export function computeNightlyPrice(
  base: RateBase,
  rules: readonly PricingRule[],
  isoDate: string,
): number {
  const weekday = isoWeekday(parseIsoDate(isoDate))
  // Stable ascending-priority order (index tiebreak preserves input order).
  const ordered = rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => a.rule.priority - b.rule.priority || a.index - b.index)

  let running = Math.max(0, Math.round(base.baseAmountCents))
  for (const { rule } of ordered) {
    if (ruleMatches(rule, base.ratePlanId, base.roomTypeId, isoDate, weekday)) {
      running = applyAdjustment(running, rule)
    }
  }
  return running
}

/**
 * Expand a set of bases across an inclusive `from..to` horizon into single-date
 * bulk upsert ops (one per base per date), each priced by `computeNightlyPrice`.
 * The rows are shape-compatible with `bulkUpsertRates` (which supplies the
 * remaining daily-rate defaults). Callers chunk the result to stay under
 * Postgres' bind-parameter ceiling.
 */
export function materializePlan(
  bases: readonly RateBase[],
  rules: readonly PricingRule[],
  from: string,
  to: string,
): MaterializedRateOp[] {
  const dates = expandDates(from, to)
  const ops: MaterializedRateOp[] = []
  for (const base of bases) {
    for (const date of dates) {
      ops.push({
        ratePlanId: base.ratePlanId,
        roomTypeId: base.roomTypeId,
        from: date,
        to: date,
        sellCurrency: base.currency,
        sellAmountCents: computeNightlyPrice(base, rules, date),
      })
    }
  }
  return ops
}
