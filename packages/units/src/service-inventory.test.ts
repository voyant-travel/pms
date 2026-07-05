import { describe, expect, it } from "vitest"

import {
  buildInventoryRowsFromCapacities,
  computeDailyCapacities,
  isSellableUnit,
  type UnitForDerivation,
} from "./service-inventory"

const dates = ["2026-07-01", "2026-07-02", "2026-07-03"]

function unit(over: Partial<UnitForDerivation> & Pick<UnitForDerivation, "id">): UnitForDerivation {
  return { status: "available", active: true, ...over }
}

describe("isSellableUnit", () => {
  it("counts only active + available units", () => {
    expect(isSellableUnit(unit({ id: "u1" }))).toBe(true)
    expect(isSellableUnit(unit({ id: "u2", active: false }))).toBe(false)
    expect(isSellableUnit(unit({ id: "u3", status: "out_of_order" }))).toBe(false)
    expect(isSellableUnit(unit({ id: "u4", status: "out_of_service" }))).toBe(false)
  })
})

describe("computeDailyCapacities", () => {
  it("derives capacity = count of sellable units, flat across dates with no blocks", () => {
    const units = [
      unit({ id: "u1" }),
      unit({ id: "u2" }),
      unit({ id: "u3", active: false }), // excluded
      unit({ id: "u4", status: "out_of_order" }), // excluded
    ]
    const caps = computeDailyCapacities(units, dates)
    expect([...caps.values()]).toEqual([2, 2, 2])
  })

  it("subtracts blocked units per date (the Phase 4 maintenance hook)", () => {
    const units = [unit({ id: "u1" }), unit({ id: "u2" }), unit({ id: "u3" })]
    const blocked = new Map<string, ReadonlySet<string>>([
      ["2026-07-02", new Set(["u1"])],
      ["2026-07-03", new Set(["u1", "u2"])],
    ])
    const caps = computeDailyCapacities(units, dates, blocked)
    expect(caps.get("2026-07-01")).toBe(3)
    expect(caps.get("2026-07-02")).toBe(2)
    expect(caps.get("2026-07-03")).toBe(1)
  })

  it("ignores blocked ids that are not sellable anyway (no double subtraction)", () => {
    const units = [unit({ id: "u1" }), unit({ id: "u2", active: false })]
    const blocked = new Map<string, ReadonlySet<string>>([["2026-07-01", new Set(["u2"])]])
    expect(computeDailyCapacities(units, ["2026-07-01"], blocked).get("2026-07-01")).toBe(1)
  })

  it("yields zero capacity when there are no sellable units", () => {
    expect([...computeDailyCapacities([], dates).values()]).toEqual([0, 0, 0])
  })
})

describe("buildInventoryRowsFromCapacities", () => {
  it("projects the capacity map to upsert rows keyed by (roomTypeId, date)", () => {
    const caps = new Map([
      ["2026-07-01", 4],
      ["2026-07-02", 3],
    ])
    expect(buildInventoryRowsFromCapacities("rt_1", caps)).toEqual([
      { roomTypeId: "rt_1", date: "2026-07-01", capacity: 4 },
      { roomTypeId: "rt_1", date: "2026-07-02", capacity: 3 },
    ])
  })
})
