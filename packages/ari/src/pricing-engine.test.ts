import { describe, expect, it } from "vitest"

import {
  computeNightlyPrice,
  materializePlan,
  type PricingRule,
  type RateBase,
  ruleMatches,
} from "./pricing-engine.js"

const base: RateBase = {
  ratePlanId: "rp_1",
  roomTypeId: "rt_1",
  currency: "EUR",
  baseAmountCents: 18000,
}

/** Build a rule with sane defaults, overridable per test. */
function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    kind: "season",
    fromDate: null,
    toDate: null,
    weekdays: null,
    adjustmentType: "percent",
    adjustmentValue: 0,
    ratePlanIds: null,
    roomTypeIds: null,
    priority: 0,
    active: true,
    ...overrides,
  }
}

describe("computeNightlyPrice", () => {
  it("returns the base when no rules match", () => {
    expect(computeNightlyPrice(base, [], "2026-07-15")).toBe(18000)
  })

  it("applies a season percent uplift within the range", () => {
    const summer = rule({
      kind: "season",
      fromDate: "2026-06-01",
      toDate: "2026-08-31",
      adjustmentType: "percent",
      adjustmentValue: 60,
    })
    expect(computeNightlyPrice(base, [summer], "2026-07-15")).toBe(28800) // 18000 * 1.6
    expect(computeNightlyPrice(base, [summer], "2026-05-31")).toBe(18000) // before range
    expect(computeNightlyPrice(base, [summer], "2026-09-01")).toBe(18000) // after range
  })

  it("matches season bounds inclusively", () => {
    const s = rule({
      kind: "season",
      fromDate: "2026-06-01",
      toDate: "2026-08-31",
      adjustmentValue: 10,
    })
    expect(computeNightlyPrice(base, [s], "2026-06-01")).toBe(19800)
    expect(computeNightlyPrice(base, [s], "2026-08-31")).toBe(19800)
  })

  it("applies a weekday percent uplift only on masked days", () => {
    // 2026-07-17 is a Friday (ISO 5), 2026-07-18 Saturday (6), 2026-07-15 Wed (3).
    const weekend = rule({
      kind: "weekday",
      weekdays: [5, 6],
      adjustmentType: "percent",
      adjustmentValue: 15,
    })
    expect(computeNightlyPrice(base, [weekend], "2026-07-17")).toBe(20700) // Fri: *1.15
    expect(computeNightlyPrice(base, [weekend], "2026-07-18")).toBe(20700) // Sat
    expect(computeNightlyPrice(base, [weekend], "2026-07-15")).toBe(18000) // Wed unchanged
  })

  it("supports open-ended weekday rules (no date bounds)", () => {
    const weekend = rule({ kind: "weekday", weekdays: [6], adjustmentValue: 20 })
    expect(computeNightlyPrice(base, [weekend], "2020-01-04")).toBe(21600) // a Saturday
    expect(computeNightlyPrice(base, [weekend], "2030-12-28")).toBe(21600) // a Saturday
  })

  it("honors optional date bounds on a weekday rule", () => {
    const promo = rule({
      kind: "weekday",
      weekdays: [5, 6],
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      adjustmentValue: 50,
    })
    expect(computeNightlyPrice(base, [promo], "2026-07-17")).toBe(27000) // Fri in July
    expect(computeNightlyPrice(base, [promo], "2026-08-14")).toBe(18000) // Fri, out of range
  })

  it("stacks season then weekday in priority order (percent on percent)", () => {
    const summer = rule({
      kind: "season",
      fromDate: "2026-06-01",
      toDate: "2026-08-31",
      adjustmentValue: 60,
      priority: 10,
    })
    const weekend = rule({ kind: "weekday", weekdays: [5, 6], adjustmentValue: 15, priority: 20 })
    // Fri 2026-07-17 in summer: 18000 * 1.6 = 28800, then * 1.15 = 33120.
    expect(computeNightlyPrice(base, [summer, weekend], "2026-07-17")).toBe(33120)
  })

  it("respects priority regardless of input order", () => {
    const setRule = rule({ adjustmentType: "set", adjustmentValue: 10000, priority: 5 })
    const pct = rule({ adjustmentType: "percent", adjustmentValue: 100, priority: 10 })
    // set to 10000 first, then double → 20000, regardless of array order.
    expect(computeNightlyPrice(base, [pct, setRule], "2026-07-15")).toBe(20000)
    expect(computeNightlyPrice(base, [setRule, pct], "2026-07-15")).toBe(20000)
  })

  it("set replaces the running total", () => {
    const setRule = rule({ adjustmentType: "set", adjustmentValue: 25000 })
    expect(computeNightlyPrice(base, [setRule], "2026-07-15")).toBe(25000)
  })

  it("absolute adds cents", () => {
    const add = rule({ adjustmentType: "absolute", adjustmentValue: 3000 })
    expect(computeNightlyPrice(base, [add], "2026-07-15")).toBe(21000)
    const sub = rule({ adjustmentType: "absolute", adjustmentValue: -5000 })
    expect(computeNightlyPrice(base, [sub], "2026-07-15")).toBe(13000)
  })

  it("floors at zero (never negative)", () => {
    const sub = rule({ adjustmentType: "absolute", adjustmentValue: -999999 })
    expect(computeNightlyPrice(base, [sub], "2026-07-15")).toBe(0)
    const pct = rule({ adjustmentType: "percent", adjustmentValue: -150 })
    expect(computeNightlyPrice(base, [pct], "2026-07-15")).toBe(0)
  })

  it("rounds to whole cents at each step", () => {
    const pct = rule({ adjustmentType: "percent", adjustmentValue: 33 })
    // 18000 * 1.33 = 23940 exactly, but odd base to force rounding:
    const odd = computeNightlyPrice({ ...base, baseAmountCents: 18001 }, [pct], "2026-07-15")
    expect(Number.isInteger(odd)).toBe(true)
    expect(odd).toBe(Math.round(18001 * 1.33))
  })

  it("skips inactive rules", () => {
    const off = rule({ adjustmentType: "set", adjustmentValue: 1, active: false })
    expect(computeNightlyPrice(base, [off], "2026-07-15")).toBe(18000)
  })

  it("filters by rate-plan scope", () => {
    const scoped = rule({ adjustmentValue: 50, ratePlanIds: ["rp_other"] })
    expect(computeNightlyPrice(base, [scoped], "2026-07-15")).toBe(18000)
    const matching = rule({ adjustmentValue: 50, ratePlanIds: ["rp_1"] })
    expect(computeNightlyPrice(base, [matching], "2026-07-15")).toBe(27000)
  })

  it("filters by room-type scope", () => {
    const scoped = rule({ adjustmentValue: 50, roomTypeIds: ["rt_other"] })
    expect(computeNightlyPrice(base, [scoped], "2026-07-15")).toBe(18000)
    const matching = rule({ adjustmentValue: 50, roomTypeIds: ["rt_1"] })
    expect(computeNightlyPrice(base, [matching], "2026-07-15")).toBe(27000)
  })
})

describe("ruleMatches", () => {
  it("requires a non-empty weekday mask for weekday kind", () => {
    const r = rule({ kind: "weekday", weekdays: [] })
    expect(ruleMatches(r, "rp_1", "rt_1", "2026-07-17", 5)).toBe(false)
  })

  it("ignores weekdays for season kind", () => {
    const r = rule({ kind: "season", fromDate: "2026-01-01", toDate: "2026-12-31", weekdays: [1] })
    expect(ruleMatches(r, "rp_1", "rt_1", "2026-07-17", 5)).toBe(true)
  })
})

describe("materializePlan", () => {
  const bases: RateBase[] = [
    base,
    { ratePlanId: "rp_2", roomTypeId: "rt_2", currency: "EUR", baseAmountCents: 12000 },
  ]

  it("emits one single-date op per base per date", () => {
    const ops = materializePlan(bases, [], "2026-07-01", "2026-07-03")
    expect(ops).toHaveLength(2 * 3)
    expect(ops[0]).toEqual({
      ratePlanId: "rp_1",
      roomTypeId: "rt_1",
      from: "2026-07-01",
      to: "2026-07-01",
      sellCurrency: "EUR",
      sellAmountCents: 18000,
    })
  })

  it("prices each op through the engine", () => {
    const weekend = rule({ kind: "weekday", weekdays: [5, 6], adjustmentValue: 15 })
    const ops = materializePlan([base], [weekend], "2026-07-17", "2026-07-18")
    expect(ops.map((o) => o.sellAmountCents)).toEqual([20700, 20700]) // Fri + Sat
  })

  it("returns rows shape-compatible with bulk rate ops", () => {
    const ops = materializePlan([base], [], "2026-07-01", "2026-07-01")
    const op = ops[0]
    expect(Object.keys(op).sort()).toEqual(
      ["from", "ratePlanId", "roomTypeId", "sellAmountCents", "sellCurrency", "to"].sort(),
    )
  })
})
