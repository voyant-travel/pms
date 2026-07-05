import { describe, expect, it } from "vitest"

import { buildSourceKey, planGeneratedTasks, type StayUnitRef } from "./generation"

const date = "2026-07-03"
const ref = (unitId: string, bookingItemId = `bkit_${unitId}`): StayUnitRef => ({
  bookingItemId,
  unitId,
})

describe("buildSourceKey", () => {
  it("is deterministic per (kind, unit, date) — the idempotency anchor", () => {
    expect(buildSourceKey("dep", "runt_1", date)).toBe("dep:runt_1:2026-07-03")
    expect(buildSourceKey("stay", "runt_1", date)).toBe("stay:runt_1:2026-07-03")
  })
})

describe("planGeneratedTasks", () => {
  it("plans a clean task + dirty mark per departure", () => {
    const plan = planGeneratedTasks({
      propertyId: "prop_1",
      date,
      departures: [ref("runt_1"), ref("runt_2")],
      stayovers: [],
    })
    expect(plan.tasks).toEqual([
      {
        unitId: "runt_1",
        propertyId: "prop_1",
        type: "clean",
        dueDate: date,
        source: "auto",
        sourceKey: "dep:runt_1:2026-07-03",
      },
      {
        unitId: "runt_2",
        propertyId: "prop_1",
        type: "clean",
        dueDate: date,
        source: "auto",
        sourceKey: "dep:runt_2:2026-07-03",
      },
    ])
    expect(plan.dirtyUnitIds).toEqual(["runt_1", "runt_2"])
  })

  it("plans a light turndown per stayover and never marks it dirty", () => {
    const plan = planGeneratedTasks({
      propertyId: "prop_1",
      date,
      departures: [],
      stayovers: [ref("runt_9")],
    })
    expect(plan.tasks).toEqual([
      {
        unitId: "runt_9",
        propertyId: "prop_1",
        type: "turndown",
        dueDate: date,
        source: "auto",
        sourceKey: "stay:runt_9:2026-07-03",
      },
    ])
    expect(plan.dirtyUnitIds).toEqual([])
  })

  it("lets a departure clean win over a stayover turndown for the same unit", () => {
    const plan = planGeneratedTasks({
      propertyId: "prop_1",
      date,
      departures: [ref("runt_1")],
      stayovers: [ref("runt_1")],
    })
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].type).toBe("clean")
  })

  it("de-duplicates repeated departures on the same unit", () => {
    const plan = planGeneratedTasks({
      propertyId: "prop_1",
      date,
      departures: [ref("runt_1", "bkit_a"), ref("runt_1", "bkit_b")],
      stayovers: [],
    })
    expect(plan.tasks).toHaveLength(1)
  })
})
